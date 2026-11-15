'use strict';
// 数据层：SQLite 索引、智能分类、增量扫描、书架初始化。
// 原则：原始资料文件永不被移动、重命名或删除；所有「整理」都体现在索引层。
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || '/data';
const BOOKS_ROOT = process.env.BOOKS_ROOT || '/books';
const PUBLIC_ROOT = process.env.PUBLIC_ROOT || '/lanpublic';
// 新导入图书 / 分类镜像的目录名，可通过环境变量改成自己习惯的名字
const IMPORT_DIR = process.env.IMPORT_DIR || '_导入图书';
const MIRROR_DIR = process.env.MIRROR_DIR || '_图书馆分类';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'library.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  kind TEXT NOT NULL,
  format TEXT,
  category TEXT,
  subcategory TEXT,
  tags TEXT,
  author TEXT,
  top_folder TEXT,
  imported INTEGER NOT NULL DEFAULT 0,
  missing INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_cat ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_kind ON books(kind);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE TABLE IF NOT EXISTS shelves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT NOT NULL DEFAULT '📚',
  sort_order INTEGER NOT NULL DEFAULT 0,
  auto_from TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS book_shelves (
  book_id INTEGER NOT NULL,
  shelf_id INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, shelf_id)
);
CREATE TABLE IF NOT EXISTS progress (
  book_id INTEGER PRIMARY KEY,
  locator TEXT NOT NULL DEFAULT '{}',
  percent REAL NOT NULL DEFAULT 0,
  device TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  locator TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  added INTEGER, updated INTEGER, missing INTEGER, total INTEGER,
  duration_ms INTEGER, ts INTEGER
);
`);

/* ------------ 迁移：目录层级 + 封面素材标记（兼容已存在的库） ------------ */
const bookCols = db.prepare('PRAGMA table_info(books)').all().map(c => c.name);
if (!bookCols.includes('dir_path')) db.exec("ALTER TABLE books ADD COLUMN dir_path TEXT NOT NULL DEFAULT ''");
if (!bookCols.includes('is_asset')) db.exec('ALTER TABLE books ADD COLUMN is_asset INTEGER NOT NULL DEFAULT 0');
function dirnameOf(rel, filename) {
  const i = rel.lastIndexOf('/');
  return i > 0 ? rel.slice(0, i) : '';
}
function isCoverAsset(filename, ext) {
  if (!['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes((ext || '').toLowerCase())) return 0;
  return /(封面|封底|书衣|cover|front|folder|thumb|poster|海报)/i.test(filename) ? 1 : 0;
}
// 启动时、每次扫描后重算，保证文件被移动/改名后层级依然准确（6213 行级别，耗时可忽略）
function recomputePaths() {
  const rows = db.prepare('SELECT id,path,filename,ext,dir_path,is_asset FROM books').all();
  const upd = db.prepare('UPDATE books SET dir_path=?, is_asset=? WHERE id=?');
  let changed = 0;
  db.exec('BEGIN');
  for (const r of rows) {
    const d = dirnameOf(r.path, r.filename), a = isCoverAsset(r.filename, r.ext);
    if (d !== r.dir_path || a !== r.is_asset) { upd.run(d, a, r.id); changed++; }
  }
  db.exec('COMMIT');
  return changed;
}
recomputePaths();

/* ------------------------------ 工具 ------------------------------ */
const now = () => Date.now();
const getSetting = (k, d = '') => {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  return r ? r.value : d;
};
const setSetting = (k, v) => db.prepare(
  'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
).run(k, String(v));

/* --------------------------- 格式与分类 --------------------------- */
// 笔记 / 轻量标记 / 源码文本：统一由前端 notes.js 渲染，服务端只做索引与文本提取
const NOTE_EXTS = [
  'md', 'markdown', 'mdown', 'mkd', 'mdx',
  'html', 'htm', 'xhtml', 'mht', 'mhtml',
  'rst', 'rest', 'adoc', 'asciidoc', 'asc', 'org', 'textile', 'wiki', 'mediawiki',
  'json', 'jsonc', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'xml', 'opml', 'tex', 'latex', 'sql',
  'py', 'js', 'mjs', 'ts', 'jsx', 'tsx', 'sh', 'bash', 'bat', 'ps1',
  'css', 'scss', 'less', 'c', 'h', 'cpp', 'cc', 'java', 'go', 'rs', 'php', 'rb',
  'diff', 'patch', 'properties', 'vue', 'svelte', 'graphql', 'proto'
];
const KIND_BY_EXT = {
  pdf: 'ebook', epub: 'ebook', mobi: 'ebook', azw: 'ebook', azw3: 'ebook',
  txt: 'ebook', md: 'ebook', fb2: 'ebook', djvu: 'ebook', chm: 'ebook',
  doc: 'document', docx: 'document', ppt: 'document', pptx: 'document',
  xls: 'document', xlsx: 'document', rtf: 'document', mht: 'document',
  html: 'document', htm: 'document', csv: 'document',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio', wma: 'audio', ogg: 'audio', ape: 'audio',
  mp4: 'video', mkv: 'video', avi: 'video', rmvb: 'video', rm: 'video', flv: 'video',
  wmv: 'video', mov: 'video', mpg: 'video', mpeg: 'video', vob: 'video',
  dat: 'video', ts: 'video', m4v: 'video', webm: 'video', bup: 'video', ifo: 'video',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', bmp: 'image', tif: 'image', tiff: 'image',
  rar: 'archive', zip: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', iso: 'archive'
};
// 笔记类格式统一归为「笔记」，便于按类型筛选（不影响原有目录层级与书架）
for (const e of NOTE_EXTS) KIND_BY_EXT[e] = 'note';
const READABLE = new Set(['pdf', 'epub', 'txt', 'mht', 'html', 'htm', 'docx', 'pptx', 'csv',
  'mobi', 'azw', 'azw3', ...NOTE_EXTS]);
// 幂等迁移：把已入库的笔记类文件类型纠正为 note（sync 只重算有变动的文件）
try {
  const ph = NOTE_EXTS.map(() => '?').join(',');
  const r = db.prepare(`UPDATE books SET kind='note' WHERE lower(ext) IN (${ph}) AND kind<>'note'`).run(...NOTE_EXTS);
  if (r.changes) console.log('[migrate] 笔记类型已纠正:', r.changes);
} catch (e) { console.error('[migrate] 笔记类型迁移失败:', e.message); }
const PLAYABLE = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'mp4', 'webm', 'mov', 'm4v', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);

// 顶层文件夹 → 一级分类
const TOP_CATEGORY = {
  '计算机': '计算机', '语言': '语言学习', '数学': '数学',
  '历史': '历史', '小说': '小说文学', '道': '国学·哲学'
};
// 关键词 → 一级分类（用于导入文件 / 无顶层目录命中的情况）
const KEYWORD_CATEGORY = [
  ['计算机', ['计算机', '编程', 'python', 'java', 'javascript', 'c语言', 'c++', '前端', '后端', '算法', '数据结构', '数据库', '操作系统', 'linux', '网络', '人工智能', '机器学习', '深度学习', '神经网络', '区块链', '内核', '分布式', '软件', '开发', '代码', '电脑', '3d', 'arduino', 'matlab', 'rust', 'latex', 'wifi', 'pcie', 'git', 'vue', 'react', 'sql', '源码', '架构']],
  ['语言学习', ['英语', '日语', '法语', '德语', '韩语', '语言', '词汇', '语法', 'toefl', 'ielts', '雅思', '托福', '翻译', '口语', '新概念', '单词']],
  ['数学', ['数学', '高数', '概率', '统计', '线性代数', '几何', '微积分', '数论', '拓扑', '离散']],
  ['历史', ['历史', '史记', '朝代', '战争', '考古', '通史', '民国', '古代', '世界史']],
  ['小说文学', ['小说', '文学', '散文', '诗集', '名著', '武侠', '科幻', '悬疑', '推理', '传记', '故事', '全集', '文集', '鲁迅', '金庸', '马尔克斯']],
  ['国学·哲学', ['道德经', '论语', '易经', '庄子', '佛', '禅', '儒', '国学', '哲学', '道家', '中医', '周易', '修行', '心经', '金刚经']],
  ['经济·管理', ['经济', '金融', '管理', '商业', '营销', '投资', '会计', '创业', '职场']],
  ['考试·教材', ['考研', '高考', '教材', '教程', '习题', '真题', '讲义', '课件', '考试', '笔记', '课程']]
];
// 二级主题关键词（细分到书架/标签）
const SUB_TOPICS = [
  ['人工智能', ['人工智能', '机器学习', '深度学习', '神经网络', 'ai', 'transformer', '大模型', 'llm', 'nlp', 'cv']],
  ['Python', ['python', 'django', 'flask', 'pandas']],
  ['Java', ['java', 'spring', 'jvm']],
  ['前端', ['前端', 'javascript', 'vue', 'react', 'css', 'html', 'node']],
  ['C/C++', ['c语言', 'c++', 'cpp', '指针']],
  ['算法与数据结构', ['算法', '数据结构', 'leetcode', '剑指offer']],
  ['数据库', ['数据库', 'mysql', 'redis', 'sql', 'postgres']],
  ['操作系统/内核', ['操作系统', '内核', 'linux kernel', '驱动']],
  ['网络与分布式', ['网络', '分布式', '微服务', '网络协议', 'tcp']],
  ['3D与硬件', ['3d', 'arduino', 'pcie', 'wifi', '硬件', '单片机']],
  ['英语', ['英语', 'english', '新概念', 'toefl', 'ielts', '雅思', '托福', '单词', '词汇']],
  ['古典文学', ['古典', '诗词', '古文', '四大名著', '红楼梦', '三国', '水浒', '西游']],
  ['经史典籍', ['史记', '资治通鉴', '二十四史', '左传']]
];

function guessCategory(text) {
  const t = text.toLowerCase();
  for (const [cat, kws] of KEYWORD_CATEGORY) {
    if (kws.some(k => t.includes(k))) return cat;
  }
  return '';
}
function guessSubcategory(text) {
  const t = text.toLowerCase();
  for (const [sub, kws] of SUB_TOPICS) {
    if (kws.some(k => t.includes(k))) return sub;
  }
  return '';
}
function cleanTitle(name, ext) {
  let s = name.slice(0, name.length - ext.length - 1);
  s = s.replace(/[_\s]+/g, ' ').trim();
  s = s.replace(/\[?(www\.)?[a-z0-9-]+\.(com|cn|net|org)\]?/gi, '');
  s = s.replace(/[【\[（(]?(高清|完整版|扫描版|珍藏版|简体|中文|pdf|epub|最全|合集|带书签)[】\]）)]?/gi, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s || name;
}
function extractTags(rel, category, subcategory, format) {
  const tags = new Set();
  if (category) tags.add(category);
  if (subcategory) tags.add(subcategory);
  if (format) tags.add(format.toUpperCase());
  const segs = rel.split('/').slice(0, -1);
  segs.forEach(s => { if (s && s !== IMPORT_DIR && s.length <= 18 && !s.startsWith('@')) tags.add(s); });
  const year = rel.match(/\b(19|20)\d{2}\b/);
  if (year) tags.add(year[0]);
  return [...tags].slice(0, 10);
}

function classify(rel, filename) {
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  const parts = rel.split('/');
  const imported = parts[0] === IMPORT_DIR ? 1 : 0;
  // 只有位于子目录中的文件才把首层目录当作「默认书架」来源；根目录散文件不建书架
  const topFolder = imported ? '' : (parts.length > 1 ? parts[0] : '');
  let category, subcategory;
  if (imported) {
    category = parts[1] || guessCategory(rel) || '未分类';
    subcategory = parts[2] && parts.length > 3 ? parts[2] : guessSubcategory(rel);
  } else {
    category = TOP_CATEGORY[topFolder] || guessCategory(rel) || '其他资料';
    // 优先用主题关键词，其次用第二层目录名
    subcategory = guessSubcategory(rel) || (parts.length > 2 ? parts[1] : '');
    if (subcategory.length > 18) subcategory = '';
  }
  const kind = KIND_BY_EXT[ext] || 'other';
  const format = ext ? ext.toUpperCase() : '未知';
  return {
    ext, kind, format, category, subcategory: subcategory || '',
    tags: JSON.stringify(extractTags(rel, category, subcategory, format)),
    title: cleanTitle(filename, ext), author: '', top_folder: topFolder, imported,
    dir_path: dirnameOf(rel, filename), is_asset: isCoverAsset(filename, ext)
  };
}

/* ------------------------------ 扫描 ------------------------------ */
function walk(dir, rel, out, depth = 0) {
  if (depth > 12) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const n = e.name;
    if (n.startsWith('.') || n.startsWith('@') || n === 'node_modules' || n === '$RECYCLE.BIN') continue;
    // 群晖/Windows 自动生成的垃圾文件不进书库
    if (/^(thumbs\.db|desktop\.ini|\.ds_store)$/i.test(n) || /\.(tmp|temp|part|crdownload|!ut)$/i.test(n)) continue;
    const full = path.join(dir, n);
    const r = rel ? rel + '/' + n : n;
    if (e.isDirectory()) { walk(full, r, out, depth + 1); continue; }
    if (!e.isFile()) continue;
    try {
      const st = fs.statSync(full);
      out.push({ path: r, name: n, size: st.size, mtime: Math.floor(st.mtimeMs) });
    } catch { /* 文件在扫描期间被移走，忽略 */ }
  }
}

const insertBook = db.prepare(`INSERT INTO books
 (path,filename,title,ext,size,mtime,kind,format,category,subcategory,tags,author,top_folder,imported,dir_path,is_asset,added_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const updateBook = db.prepare(`UPDATE books SET size=?,mtime=?,kind=?,format=?,dir_path=?,is_asset=?,missing=0,updated_at=? WHERE path=?`);
const findShelfByAuto = db.prepare('SELECT id FROM shelves WHERE auto_from=?');
const findShelfByName = db.prepare('SELECT id FROM shelves WHERE name=?');
const linkBook = db.prepare('INSERT OR IGNORE INTO book_shelves(book_id,shelf_id,added_at) VALUES(?,?,?)');

function ensureDefaultShelves() {
  const folders = db.prepare("SELECT DISTINCT top_folder FROM books WHERE imported=0 AND top_folder<>''").all();
  const palette = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];
  let i = 0;
  for (const f of folders) {
    const folder = f.top_folder;
    const cat = TOP_CATEGORY[folder] || folder;
    let row = findShelfByAuto.get(folder);
    if (!row) {
      db.prepare('INSERT OR IGNORE INTO shelves(name,description,color,icon,sort_order,auto_from,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(cat, '自动来自文件夹「' + folder + '」', palette[i++ % palette.length], '📁', i, folder, now());
      row = findShelfByAuto.get(folder);
    }
    if (row) {
      const rows = db.prepare('SELECT id,category,imported FROM books WHERE top_folder=? AND hidden=0').all(folder);
      db.exec('BEGIN');
      for (const b of rows) linkBook.run(b.id, row.id, now());
      db.exec('COMMIT');
    }
  }
  // 导入书籍、根目录散文件等：按分类归入同名书架，保证每本书都有归属
  const orphans = db.prepare(`SELECT id,category FROM books WHERE hidden=0
    AND NOT EXISTS(SELECT 1 FROM book_shelves bs WHERE bs.book_id=books.id)`).all();
  db.exec('BEGIN');
  for (const b of orphans) {
    const s = findShelfByName.get(b.category || '其他资料');
    if (s) linkBook.run(b.id, s.id, now());
  }
  db.exec('COMMIT');
}

let lastScan = { added: 0, updated: 0, missing: 0, total: 0, duration_ms: 0, ts: 0, running: false };

function sync({ initial = false } = {}) {
  if (lastScan.running) return { ...lastScan, skipped: true };
  lastScan.running = true;
  const t0 = now();
  try {
    const files = [];
    walk(BOOKS_ROOT, '', files);
    const seen = new Set(files.map(f => f.path));
    const existing = new Map(db.prepare('SELECT id,path,size,mtime,missing FROM books').all().map(r => [r.path, r]));
    let added = 0, updated = 0, missing = 0;
    db.exec('BEGIN');
    for (const f of files) {
      const old = existing.get(f.path);
      if (!old) {
        const c = classify(f.path, f.name);
        insertBook.run(f.path, f.name, c.title, c.ext, f.size, f.mtime, c.kind, c.format,
          c.category, c.subcategory, c.tags, c.author, c.top_folder, c.imported,
          c.dir_path, c.is_asset, now(), now());
        added++;
      } else if (old.size !== f.size || old.mtime !== f.mtime || old.missing) {
        const c = classify(f.path, f.name);
        updateBook.run(f.size, f.mtime, c.kind, c.format, c.dir_path, c.is_asset, now(), f.path);
        updated++;
      }
    }
    const markMissing = db.prepare('UPDATE books SET missing=1,updated_at=? WHERE path=? AND missing=0');
    for (const p of existing.keys()) {
      if (!seen.has(p)) { markMissing.run(now(), p); missing++; }
    }
    db.exec('COMMIT');
    ensureDefaultShelves();
    recomputePaths();
    const total = db.prepare('SELECT COUNT(*) n FROM books WHERE hidden=0 AND missing=0 AND is_asset=0').get().n;
    const duration_ms = now() - t0;
    lastScan = { added, updated, missing, total, duration_ms, ts: now(), running: false };
    db.prepare('INSERT INTO scan_log(added,updated,missing,total,duration_ms,ts) VALUES(?,?,?,?,?,?)')
      .run(added, updated, missing, total, duration_ms, now());
    setSetting('last_scan', String(now()));
    console.log(`[scan] +${added} ~${updated} -${missing} total=${total} ${duration_ms}ms`);
    return lastScan;
  } catch (err) {
    lastScan.running = false;
    try { db.exec('ROLLBACK'); } catch {}
    console.error('[scan] failed', err);
    throw err;
  }
}

/* --------------------- 分类镜像（硬链接，零空间占用，保留原层级） --------------------- */
const safeSeg = s => String(s || '').replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+$/, '_').slice(0, 80) || '_';
function materializeMirror() {
  const root = path.join(PUBLIC_ROOT, MIRROR_DIR);
  // 保留原始目录链：_图书馆分类/<一级分类>/<顶层文件夹>/<二级…>/<文件名>
  // 这样「克苏鲁的呼唤/第01话.pdf」与「敦威治恐怖事件/第01话.pdf」各归其套，不会混在一起
  const rows = db.prepare('SELECT id,path,category,dir_path,filename FROM books WHERE hidden=0 AND missing=0').all();
  const wanted = new Set(), srcInodes = new Set(), targets = [];
  for (const b of rows) {
    const src = path.join(BOOKS_ROOT, b.path);
    const chain = (b.dir_path || '').split('/').filter(Boolean).map(safeSeg);
    const dir = path.join(root, safeSeg(b.category || '其他资料'), ...chain);
    const dst = path.join(dir, safeSeg(b.filename));
    wanted.add(dst); targets.push({ src, dst, dir });
    try { const st = fs.statSync(src); srcInodes.add(st.dev + ':' + st.ino); } catch {}
  }
  // 清理旧版本生成的扁平链接：仅当 inode 与某本源书一致（确认是硬链接）时才 unlink，绝不误删用户文件
  let removed = 0;
  const sweep = d => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { sweep(abs); continue; }
      if (!e.isFile()) continue;
      if (wanted.has(abs)) continue;
      try {
        const st = fs.lstatSync(abs);
        if (srcInodes.has(st.dev + ':' + st.ino)) { fs.unlinkSync(abs); removed++; }
      } catch {}
    }
    if (d !== root) { try { fs.rmdirSync(d); } catch {} }
  };
  if (fs.existsSync(root)) sweep(root);
  let linked = 0, skipped = 0, failed = 0;
  for (const t of targets) {
    try { fs.mkdirSync(t.dir, { recursive: true }); } catch { failed++; continue; }
    if (fs.existsSync(t.dst)) { skipped++; continue; }
    try { fs.linkSync(t.src, t.dst); linked++; }
    catch { failed++; }
  }
  setSetting('mirror_built_at', String(now()));
  setSetting('mirror_count', String(linked + skipped));
  return { root, linked, skipped, failed, removed, total: rows.length, layout: '按分类 → 原始目录层级' };
}

module.exports = {
  db, now, getSetting, setSetting, DATA_DIR, BOOKS_ROOT, PUBLIC_ROOT,
  IMPORT_DIR, MIRROR_DIR, READABLE, PLAYABLE, KIND_BY_EXT, NOTE_EXTS,
  guessCategory, guessSubcategory, classify, sync, recomputePaths,
  dirnameOf, isCoverAsset, safeSeg,
  lastScan: () => lastScan, materializeMirror, ensureDefaultShelves
};
