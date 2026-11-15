'use strict';
/* 工作文件智能整理（Word / PPT / Excel / PDF / 图片 / 任意附件）
 * 设计原则与书库一致：原件永不移动、重命名或删除；项目 / 日期 / 类型都是 SQLite 索引记录。
 * 工作目录独立于书库根目录，避免 6000+ 本藏书与工作文档互相污染。
 * 零第三方依赖：OOXML 的 zip 直接用 Node 内置 zlib 读取，AI 分类为可选增强。
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const C = require('./core');

const { db, now, getSetting, setSetting, BOOKS_ROOT, PUBLIC_ROOT, safeSeg, NOTE_EXTS } = C;
const WORK_DIR = process.env.WORK_DIR || '_工作文件';
const WORK_MIRROR_DIR = process.env.WORK_MIRROR_DIR || '_工作台分类';
const WORK_ROOT = process.env.WORK_ROOT || path.join(PUBLIC_ROOT, WORK_DIR);
const MIRROR_ROOT = path.join(PUBLIC_ROOT, WORK_MIRROR_DIR);

db.exec(`
CREATE TABLE IF NOT EXISTS work_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root TEXT NOT NULL DEFAULT 'work',
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  project TEXT NOT NULL DEFAULT '未归档',
  project_source TEXT NOT NULL DEFAULT '',
  doc_date TEXT NOT NULL DEFAULT '',
  date_source TEXT NOT NULL DEFAULT '',
  doc_type TEXT NOT NULL DEFAULT '其他文档',
  tags TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '待整理',
  snippet TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'work',
  locked TEXT NOT NULL DEFAULT '',
  book_id INTEGER,
  missing INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(root, path)
);
CREATE INDEX IF NOT EXISTS idx_work_project ON work_files(project);
CREATE INDEX IF NOT EXISTS idx_work_date ON work_files(doc_date);
CREATE INDEX IF NOT EXISTS idx_work_type ON work_files(doc_type);
CREATE TABLE IF NOT EXISTS work_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);
// 兼容早期库（字段迁移，绝不重建表、绝不丢数据）
const wfCols = db.prepare('PRAGMA table_info(work_files)').all().map(c => c.name);
for (const [col, def] of [
  ['project_source', "TEXT NOT NULL DEFAULT ''"], ['date_source', "TEXT NOT NULL DEFAULT ''"],
  ['snippet', "TEXT NOT NULL DEFAULT ''"], ['locked', "TEXT NOT NULL DEFAULT ''"],
  ['pinned', 'INTEGER NOT NULL DEFAULT 0'], ['note', "TEXT NOT NULL DEFAULT ''"],
  ['status', "TEXT NOT NULL DEFAULT '待整理'"], ['book_id', 'INTEGER']
]) if (!wfCols.includes(col)) db.exec(`ALTER TABLE work_files ADD COLUMN ${col} ${def}`);

const pad = n => String(n).padStart(2, '0');
const isoDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const validDay = (y, m, d) => {
  y = Number(y); m = Number(m); d = Number(d);
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  return `${y}-${pad(m)}-${pad(d)}`;
};

/* ---------------------- OOXML 读取（不依赖任何 npm 包） ---------------------- */
function zipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(off + 10), compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (name.toLowerCase() === wanted.toLowerCase()) {
      if (localOff + 30 > buf.length) return null;
      const lName = buf.readUInt16LE(localOff + 26), lExtra = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lName + lExtra;
      const raw = buf.subarray(start, start + compSize);
      try { return method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw); } catch { return null; }
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
const xmlText = b => b ? b.toString('utf8')
  .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim() : '';

// 完整文本提取：供网页阅读器兜底与 AI 上下文使用（不解析排版，只取文字）
function officeText(abs, ext, limit = 200000) {
  if (!['docx', 'docm', 'pptx', 'pptm', 'xlsx', 'xlsm'].includes(ext)) return '';
  let buf;
  try { if (fs.statSync(abs).size > 80 * 1024 * 1024) return ''; buf = fs.readFileSync(abs); } catch { return ''; }
  const parts = [];
  if (ext.startsWith('doc')) {
    const x = zipEntry(buf, 'word/document.xml');
    if (x) parts.push(xmlText(x));
  } else if (ext.startsWith('ppt')) {
    for (let i = 1; i <= 200; i++) {
      const x = zipEntry(buf, `ppt/slides/slide${i}.xml`);
      if (!x) break;
      parts.push(xmlText(x));
    }
  } else {
    const ss = zipEntry(buf, 'xl/sharedStrings.xml');
    if (ss) parts.push(xmlText(ss));
    for (let i = 1; i <= 30; i++) {
      const x = zipEntry(buf, `xl/worksheets/sheet${i}.xml`);
      if (!x) break;
      parts.push(xmlText(x));
    }
  }
  return parts.join('\n').slice(0, limit);
}

function officeMeta(abs, ext) {
  const out = { created: '', title: '', creator: '', snippet: '' };
  // 笔记 / 纯文本：读取开头片段供项目识别与列表摘要，不解析全文
  if (NOTE_EXTS.includes(ext)) {
    try {
      const fd = fs.openSync(abs, 'r'), buf = Buffer.alloc(12000);
      const n = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
      out.snippet = buf.subarray(0, n).toString('utf8')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 800);
      const tm = /^#\s+(.+)$/m.exec(buf.subarray(0, n).toString('utf8'));
      if (tm) out.title = tm[1].trim().slice(0, 80);
    } catch {}
    return out;
  }
  if (!['docx', 'docm', 'pptx', 'pptm', 'xlsx', 'xlsm'].includes(ext)) return out;
  let buf;
  try { const st = fs.statSync(abs); if (st.size > 80 * 1024 * 1024) return out; buf = fs.readFileSync(abs); } catch { return out; }
  const core = zipEntry(buf, 'docProps/core.xml');
  if (core) {
    const s = core.toString('utf8');
    out.created = (/<dcterms:created[^>]*>([^<]+)/.exec(s) || [])[1] || '';
    out.modified = (/<dcterms:modified[^>]*>([^<]+)/.exec(s) || [])[1] || '';
    out.title = (/<dc:title[^>]*>([^<]*)/.exec(s) || [])[1] || '';
    out.creator = (/<dc:creator[^>]*>([^<]*)/.exec(s) || [])[1] || '';
  }
  const parts = [];
  if (ext.startsWith('doc')) { const x = zipEntry(buf, 'word/document.xml'); if (x) parts.push(xmlText(x)); }
  else if (ext.startsWith('ppt')) {
    for (let i = 1; i <= 6; i++) { const x = zipEntry(buf, `ppt/slides/slide${i}.xml`); if (x) parts.push(xmlText(x)); }
  } else { const x = zipEntry(buf, 'xl/sharedStrings.xml'); if (x) parts.push(xmlText(x)); }
  out.snippet = parts.join(' ').slice(0, 800);
  return out;
}

/* ------------------------------ 识别规则 ------------------------------ */
const STOP = new Set(['最终版', '终版', '定稿', '草稿', '初稿', '修订', '版本', '周报', '月报', '日报', '年报',
  '总结', '汇报', '方案', '计划', '会议', '纪要', '合同', '预算', '报价', '需求', '设计', '评审', '测试',
  '报告', '说明', '模板', '副本', '新建', '文件', '文档', '工作', '项目', '资料', '备份', '关于', '附件',
  '通知', '第', '清单', '记录', '整理', '未命名', 'final', 'draft', 'v1', 'v2', 'v3', 'rev', 'copy',
  'doc', 'file', 'report', 'plan', 'meeting', 'notes', 'summary', 'proposal', 'contract', 'template', 'new']);
const clean = s => String(s || '').replace(/^[\[\]【】#＃《》\s._\-—–·]+|[\[\]【】#＃《》\s._\-—–·]+$/g, '').trim().slice(0, 40);
// 「2026Q3」「2026-03」「2026」「2026年」这类是归档目录 / 日期，不该被当成项目名
const looksLikeDate = p => /^(19|20)\d{2}\s*[-_]?Q[1-4]$/i.test(p) ||
  /^(19|20)\d{2}([-_.年/]?\d{1,2})?(月|年度|年|份)?$/i.test(p) ||
  /^\d{4}[-_]\d{2}$/.test(p);

function inferProject(rel, filename, snippet, known) {
  const base = filename.replace(/\.[^.]+$/, '');
  const hay = rel + ' ' + base;
  const patterns = [
    /[【\[]([^】\]]{2,24})[】\]]/,
    /(?:项目|客户|Project|PRJ)\s*[:：_\-]\s*([^\s_\-—·,，。/\\]{2,24})/i,
    /#([^\s#\[\]【】]{2,20})/
  ];
  for (const re of patterns) {
    const m = re.exec(hay);
    if (m) {
      const p = clean(m[1]);
      if (p && !STOP.has(p.toLowerCase()) && !/^\d+$/.test(p) && !looksLikeDate(p))
        return { name: p, source: '文件名标记' };
    }
  }
  const lower = (hay + ' ' + (snippet || '').slice(0, 300)).toLowerCase();
  const hit = known.filter(p => p && p !== '未归档' && !looksLikeDate(p) && lower.includes(p.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (hit) return { name: hit, source: '项目库匹配' };
  const parts = rel.split('/').filter(Boolean);
  for (const seg of parts.slice(0, 3)) {
    // 根目录散文件的「第一段」就是文件名本身，去掉扩展名避免项目名变成 xxx.md
    const p = clean(seg === filename ? seg.replace(/\.[a-z0-9]{1,8}$/i, '') : seg);
    if (p && p.length >= 2 && p.length <= 24 && !looksLikeDate(p) &&
      !/^\d+$/.test(p) && !STOP.has(p.toLowerCase()) && !['年', '月'].includes(p)) {
      return { name: p, source: '目录推断' };
    }
  }
  const firstSeg = clean((base.split(/[\s_\-—–·~～]+/).filter(Boolean)[0] || ''));
  if (firstSeg.length >= 2 && firstSeg.length <= 24 && !STOP.has(firstSeg.toLowerCase()) &&
    !/^\d+$/.test(firstSeg) && !/^v?\d+(\.\d+)?$/i.test(firstSeg) && !looksLikeDate(firstSeg)) {
    return { name: firstSeg, source: '文件名推断' };
  }
  return { name: '未归档', source: '待确认' };
}

function inferDate(rel, filename, mtime, meta) {
  // 文件名在前，路径在后：正则按字符串顺序命中，保证「文件名日期」优先于归档目录
  const t = filename + ' ' + rel;
  let m;
  if ((m = /(20\d{2})[-_.年/](\d{1,2})[-_.月/](\d{1,2})日?/.exec(t))) {
    const d = validDay(m[1], m[2], m[3]); if (d) return { date: d, source: '文件名' };
  }
  if ((m = /(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?!\d)/.exec(t))) {
    const d = validDay(m[1], m[2], m[3]); if (d) return { date: d, source: '文件名' };
  }
  if ((m = /(20\d{2})\s*[-_]?Q([1-4])(?:季度)?/i.exec(t))) {
    const d = validDay(m[1], (Number(m[2]) - 1) * 3 + 1, 1); if (d) return { date: d, source: '文件名（季度）' };
  }
  if ((m = /(20\d{2})[-_.年/](\d{1,2})月?(?:份)?/.exec(t))) {
    const d = validDay(m[1], m[2], 1); if (d) return { date: d, source: '文件名（年月）' };
  }
  if ((m = /(20\d{2})年(?:度|报|总结|计划|预算|汇编)/.exec(t))) {
    const d = validDay(m[1], 1, 1); if (d) return { date: d, source: '文件名（年度）' };
  }
  if (meta.created) {
    const ts = Date.parse(meta.created);
    if (!Number.isNaN(ts) && ts > Date.parse('1990-01-01')) return { date: isoDay(ts), source: '文档属性' };
  }
  return { date: isoDay(mtime || now()), source: '文件修改时间' };
}

const DOC_TYPES = [
  ['会议纪要', ['会议', '纪要', 'minutes', '会议记录', 'meeting']],
  ['方案 / 规划', ['方案', 'proposal', '规划', '解决方案']],
  ['需求 / PRD', ['需求', 'prd', 'requirement', '用户故事']],
  ['设计 / 原型', ['设计', 'design', '原型', 'ui稿', '视觉稿']],
  ['汇报 / 总结', ['汇报', '总结', '述职', '周报', '月报', '年报', '复盘', 'report', 'review']],
  ['合同 / 法务', ['合同', '协议', 'contract', '法务', '条款', '盖章']],
  ['预算 / 财务', ['预算', '报价', '发票', '费用', '结算', '财务', 'budget', 'invoice', '报销']],
  ['数据 / 报表', ['数据', '报表', '统计', '台账', '清单', 'data', 'sheet', '分析表']],
  ['测试 / QA', ['测试用例', '测试报告', 'qa', 'bug', '验收']],
  ['调研 / 评审', ['调研', '评审', '竞品', '评估', '可行性']],
  ['计划 / 排期', ['计划', '排期', '甘特', 'roadmap', '里程碑']],
  ['通知 / 公文', ['通知', '公告', '函', '发文', '制度']],
  ['简历 / 人事', ['简历', '招聘', '面试', '绩效', '人事']],
  ['讲义 / 培训', ['培训', '讲义', '课件', '教程', 'handbook']],
  ['笔记 / 速记', ['笔记', 'note', 'memo', '速记', '随笔', '摘录', '日记', 'journal',
    'todo', '待办', '大纲', 'outline', 'readme', 'changelog', 'faq', 'wiki']]
];
function inferType(filename, rel) {
  const t = (filename + ' ' + rel).toLowerCase();
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  for (const [type, kws] of DOC_TYPES) if (kws.some(k => t.includes(k))) return type;
  if (['xlsx', 'xls', 'csv', 'et'].includes(ext)) return '数据 / 报表';
  if (['pptx', 'ppt', 'dps'].includes(ext)) return '汇报 / 总结';
  if (NOTE_EXTS.includes(ext)) return '笔记 / 速记';
  return '其他文档';
}
const isJunk = n => n.startsWith('.') || n.startsWith('@') || n === '$RECYCLE.BIN' ||
  /^(thumbs\.db|desktop\.ini|\.ds_store)$/i.test(n) || /\.(tmp|temp|part|crdownload|!ut)$/i.test(n);

function knownProjects() {
  const a = db.prepare('SELECT name FROM work_projects').all().map(r => r.name);
  const b = db.prepare("SELECT DISTINCT project FROM work_files WHERE project<>'未归档' AND hidden=0").all().map(r => r.project);
  return [...new Set([...a, ...b])];
}
function classifyWork(rel, filename, abs, st, opts = {}) {
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  const meta = officeMeta(abs, ext);
  const known = knownProjects();
  const proj = inferProject(rel, filename, meta.snippet, known);
  const dt = inferDate(rel, filename, st.mtimeMs, meta);
  const type = inferType(filename, rel);
  const tags = [
    proj.name, dt.date.slice(0, 4), dt.date.slice(0, 7), type,
    ext.toUpperCase(), meta.creator ? '作者:' + meta.creator : ''
  ].filter(Boolean);
  return {
    project: proj.name, project_source: proj.source,
    doc_date: dt.date, date_source: dt.source, doc_type: type,
    snippet: meta.snippet.slice(0, 800),
    tags: JSON.stringify([...new Set(tags)].slice(0, 12)),
    title: filename.replace(/\.[^.]+$/, '').replace(/[_\s]+/g, ' ').trim() || filename,
    ext, size: st.size, mtime: Math.floor(st.mtimeMs)
  };
}

/* ------------------------------ 扫描同步 ------------------------------ */
function walk(dir, rel, out, depth = 0) {
  if (depth > 10) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (isJunk(e.name)) continue;
    const full = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (e.name !== WORK_MIRROR_DIR) walk(full, r, out, depth + 1); continue; }
    if (!e.isFile()) continue;
    try { const s = fs.statSync(full); out.push({ path: r, filename: e.name, abs: full, st: s }); } catch {}
  }
}

const insertW = db.prepare(`INSERT INTO work_files
 (root,path,filename,title,ext,size,mtime,project,project_source,doc_date,date_source,doc_type,tags,note,status,snippet,pinned,source,locked,book_id,added_at,updated_at)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const updateW = db.prepare(`UPDATE work_files SET size=?,mtime=?,project=?,project_source=?,doc_date=?,date_source=?,
 doc_type=?,tags=?,snippet=?,missing=0,updated_at=? WHERE id=?`);

function syncWork() {
  const files = [];
  walk(WORK_ROOT, '', files);
  const existing = new Map(db.prepare("SELECT * FROM work_files WHERE source='work'").all().map(r => [r.path, r]));
  const seen = new Set(files.map(f => f.path));
  let added = 0, updated = 0, missing = 0;
  db.exec('BEGIN');
  try {
    for (const f of files) {
      const c = classifyWork(f.path, f.filename, f.abs, f.st);
      const old = existing.get(f.path);
      if (!old) {
        insertW.run('work', f.path, f.filename, c.title, c.ext, c.size, c.mtime,
          c.project, c.project_source, c.doc_date, c.date_source, c.doc_type, c.tags,
          '', '待整理', c.snippet, 0, 'work', '', null, now(), now());
        added++;
      } else if (old.size !== c.size || old.mtime !== c.mtime || old.missing) {
        const lock = String(old.locked || '').split(',').filter(Boolean);
        updateW.run(c.size, c.mtime,
          lock.includes('project') ? old.project : c.project,
          lock.includes('project') ? old.project_source : c.project_source,
          lock.includes('doc_date') ? old.doc_date : c.doc_date,
          lock.includes('doc_date') ? old.date_source : c.date_source,
          lock.includes('doc_type') ? old.doc_type : c.doc_type,
          lock.includes('tags') ? old.tags : c.tags, c.snippet, now(), old.id);
        updated++;
      }
    }
    const mark = db.prepare("UPDATE work_files SET missing=1,updated_at=? WHERE root='work' AND path=? AND source='work' AND missing=0");
    for (const p of existing.keys()) if (!seen.has(p)) { mark.run(now(), p); missing++; }
    // 从书库「加入工作台」的条目：只校验原件是否还在，绝不改动 books 表
    for (const r of db.prepare("SELECT id,path,size,mtime,missing FROM work_files WHERE source='adopted'").all()) {
      const abs = path.resolve(BOOKS_ROOT, r.path);
      let alive = false, st = null;
      try { st = fs.statSync(abs); alive = st.isFile(); } catch {}
      if (!alive && !r.missing) { db.prepare('UPDATE work_files SET missing=1,updated_at=? WHERE id=?').run(now(), r.id); missing++; }
      else if (alive && r.missing) { db.prepare('UPDATE work_files SET missing=0,updated_at=? WHERE id=?').run(now(), r.id); }
    }
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  const total = db.prepare('SELECT COUNT(*) n FROM work_files WHERE hidden=0 AND missing=0').get().n;
  const res = { added, updated, missing, total };
  setSetting('work_last_scan', String(now()));
  return res;
}

/* ------------------------------ 导入 ------------------------------ */
function importTarget(filename, c) {
  const y = (c.doc_date || isoDay(now())).slice(0, 4);
  const ym = (c.doc_date || isoDay(now())).slice(0, 7);
  return path.join(WORK_ROOT, safeSeg(c.project), y, ym);
}
// 先写同挂载点临时文件，识别项目/日期后再落到 <项目>/<年>/<年-月>/
function stageAndClassify(tmp, filename) {
  const st = fs.statSync(tmp);
  const c = classifyWork(filename, filename, tmp, st);
  const dir = importTarget(filename, c);
  fs.mkdirSync(dir, { recursive: true });
  let dest = path.join(dir, safeSeg(filename));
  if (fs.existsSync(dest)) {
    const dot = filename.lastIndexOf('.');
    dest = path.join(dir, (dot > 0 ? safeSeg(filename.slice(0, dot)) : safeSeg(filename)) + '_' + Date.now() + (dot > 0 ? filename.slice(dot) : ''));
  }
  fs.renameSync(tmp, dest);
  const rel = path.relative(WORK_ROOT, dest).split(path.sep).join('/');
  // 先落库「按文件名识别」的结果：否则随后全量扫描会按归档目录名（项目 / 年 / 年月）重新推断，
  // 导致导入响应与数据库里的项目、日期不一致。
  const finalName = path.basename(dest);
  const old = db.prepare("SELECT id FROM work_files WHERE root='work' AND path=?").get(rel);
  if (!old) {
    insertW.run('work', rel, finalName, c.title, c.ext, c.size, c.mtime, c.project, c.project_source,
      c.doc_date, c.date_source, c.doc_type, c.tags, '', '待整理', c.snippet, 0, 'work', '',
      null, now(), now());
  } else {
    updateW.run(c.size, c.mtime, c.project, c.project_source, c.doc_date, c.date_source, c.doc_type,
      c.tags, c.snippet, now(), old.id);
  }
  return { dest, rel, c };
}

/* ------------------------------ 镜像（硬链接） ------------------------------ */
function materializeMirror() {
  const rows = db.prepare('SELECT id,root,path,filename,project,doc_date,doc_type FROM work_files WHERE hidden=0 AND missing=0').all();
  const wanted = new Set(), inodes = new Set(), targets = [];
  for (const r of rows) {
    const src = r.root === 'books' ? path.join(BOOKS_ROOT, r.path) : path.join(WORK_ROOT, r.path);
    const month = (r.doc_date || '未知日期').slice(0, 7);
    const dir = path.join(MIRROR_ROOT, safeSeg(r.project || '未归档'), safeSeg(month), safeSeg(r.doc_type || '其他文档'));
    const dst = path.join(dir, safeSeg(r.filename));
    wanted.add(dst); targets.push({ src, dst, dir });
    try { const s = fs.statSync(src); inodes.add(s.dev + ':' + s.ino); } catch {}
  }
  let removed = 0;
  const sweep = d => {
    let entries = []; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { sweep(abs); continue; }
      if (!e.isFile() || wanted.has(abs)) continue;
      try { const s = fs.lstatSync(abs); if (inodes.has(s.dev + ':' + s.ino)) { fs.unlinkSync(abs); removed++; } } catch {}
    }
    if (d !== MIRROR_ROOT) { try { fs.rmdirSync(d); } catch {} }
  };
  if (fs.existsSync(MIRROR_ROOT)) sweep(MIRROR_ROOT);
  let linked = 0, skipped = 0, failed = 0;
  for (const t of targets) {
    try { fs.mkdirSync(t.dir, { recursive: true }); } catch { failed++; continue; }
    if (fs.existsSync(t.dst)) { skipped++; continue; }
    try { fs.linkSync(t.src, t.dst); linked++; } catch { failed++; }
  }
  setSetting('work_mirror_built_at', String(now()));
  setSetting('work_mirror_count', String(linked + skipped));
  return { root: MIRROR_ROOT, linked, skipped, failed, removed, total: rows.length,
    layout: '按项目 → 年月 → 文档类型' };
}

/* ------------------------------ 查询 / CRUD ------------------------------ */
const BASE = 'hidden=0 AND missing=0';
function list(q) {
  const where = [BASE], args = [];
  if (q.get('project')) { where.push('project=?'); args.push(q.get('project')); }
  if (q.get('month')) { where.push("substr(doc_date,1,7)=?"); args.push(q.get('month')); }
  if (q.get('type')) { where.push('doc_type=?'); args.push(q.get('type')); }
  if (q.get('status')) { where.push('status=?'); args.push(q.get('status')); }
  if (q.get('ext')) { where.push('ext=?'); args.push(q.get('ext')); }
  if (q.get('q')) {
    where.push('(title LIKE ? OR filename LIKE ? OR tags LIKE ? OR note LIKE ? OR project LIKE ? OR snippet LIKE ?)');
    const s = '%' + q.get('q') + '%'; args.push(s, s, s, s, s, s);
  }
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM work_files WHERE ${w}`).get(...args).n;
  const page = Math.max(1, Number(q.get('page') || 1));
  const size = Math.min(200, Math.max(1, Number(q.get('size') || 100)));
  const sort = q.get('sort') === 'name' ? 'title ASC' : q.get('sort') === 'size' ? 'size DESC'
    : q.get('sort') === 'date' ? 'doc_date ASC' : 'doc_date DESC, mtime DESC';
  const rows = db.prepare(`SELECT * FROM work_files WHERE ${w} ORDER BY pinned DESC, ${sort} LIMIT ? OFFSET ?`)
    .all(...args, size, (page - 1) * size);
  return { total, page, size, files: rows.map(pack) };
}
function pack(r) {
  let tags = []; try { tags = JSON.parse(r.tags || '[]'); } catch {}
  return { ...r, tags, locked: String(r.locked || '').split(',').filter(Boolean),
    month: (r.doc_date || '').slice(0, 7), year: (r.doc_date || '').slice(0, 4) };
}
function facets() {
  const f = (col) => db.prepare(`SELECT ${col} k, COUNT(*) n FROM work_files WHERE ${BASE} AND ${col}<>'' GROUP BY ${col} ORDER BY n DESC`).all();
  return {
    projects: f('project'), months: f('substr(doc_date,1,7)'), types: f('doc_type'),
    formats: db.prepare(`SELECT upper(ext) k, COUNT(*) n FROM work_files WHERE ${BASE} GROUP BY ext ORDER BY n DESC LIMIT 20`).all(),
    statuses: f('status'),
    total: db.prepare(`SELECT COUNT(*) n FROM work_files WHERE ${BASE}`).get().n,
    pending: db.prepare(`SELECT COUNT(*) n FROM work_files WHERE ${BASE} AND status='待整理'`).get().n,
    unassigned: db.prepare(`SELECT COUNT(*) n FROM work_files WHERE ${BASE} AND project='未归档'`).get().n
  };
}
function stats() {
  return {
    total: db.prepare(`SELECT COUNT(*) n FROM work_files WHERE ${BASE}`).get().n,
    projects: db.prepare('SELECT COUNT(*) n FROM work_projects').get().n,
    pending: db.prepare(`SELECT COUNT(*) n FROM work_files WHERE ${BASE} AND status='待整理'`).get().n,
    unassigned: db.prepare(`SELECT COUNT(*) n FROM work_files WHERE ${BASE} AND project='未归档'`).get().n,
    lastScanAt: Number(getSetting('work_last_scan', '0')),
    mirrorBuiltAt: Number(getSetting('work_mirror_built_at', '0')),
    mirrorCount: Number(getSetting('work_mirror_count', '0'))
  };
}
const EDITABLE = ['project', 'doc_date', 'doc_type', 'status', 'note', 'pinned', 'tags', 'title'];
function update(id, body) {
  const r = db.prepare('SELECT * FROM work_files WHERE id=?').get(Number(id));
  if (!r) throw new Error('工作文件不存在');
  const sets = [], args = [], lock = new Set(String(r.locked || '').split(',').filter(Boolean));
  for (const k of EDITABLE) {
    if (!(k in body)) continue;
    let v = body[k];
    if (k === 'tags') v = JSON.stringify(Array.isArray(v) ? v : String(v).split(/[,，]/).map(s => s.trim()).filter(Boolean));
    else if (k === 'pinned') v = v ? 1 : 0;
    else v = String(v == null ? '' : v);
    if (k === 'doc_date' && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('日期格式应为 YYYY-MM-DD');
    sets.push(`${k}=?`); args.push(v);
    if (['project', 'doc_date', 'doc_type'].includes(k)) {
      lock.add(k);
      if (k === 'project') { sets.push('project_source=?'); args.push('手动指定'); }
      if (k === 'doc_date') { sets.push('date_source=?'); args.push('手动指定'); }
    }
  }
  if (sets.length) {
    sets.push('locked=?', 'updated_at=?'); args.push([...lock].join(','), now(), r.id);
    db.prepare(`UPDATE work_files SET ${sets.join(',')} WHERE id=?`).run(...args);
  }
  return pack(db.prepare('SELECT * FROM work_files WHERE id=?').get(r.id));
}
function remove(id, restore = false) {
  db.prepare('UPDATE work_files SET hidden=?,updated_at=? WHERE id=?').run(restore ? 0 : 1, now(), Number(id));
  return { hidden: !restore };
}
function adopt(bookId) {
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(Number(bookId));
  if (!b) throw new Error('图书不存在');
  const dup = db.prepare("SELECT id FROM work_files WHERE root='books' AND path=?").get(b.path);
  if (dup) { db.prepare('UPDATE work_files SET hidden=0,missing=0,updated_at=? WHERE id=?').run(now(), dup.id); return pack(db.prepare('SELECT * FROM work_files WHERE id=?').get(dup.id)); }
  const abs = path.join(BOOKS_ROOT, b.path);
  let st; try { st = fs.statSync(abs); } catch { throw new Error('原文件已不可访问'); }
  const c = classifyWork(b.path, b.filename, abs, st);
  const r = insertW.run('books', b.path, b.filename, b.title || c.title, c.ext, c.size, c.mtime,
    c.project, c.project_source, c.doc_date, c.date_source, c.doc_type, c.tags,
    '', '待整理', c.snippet, 0, 'adopted', '', b.id, now(), now());
  return pack(db.prepare('SELECT * FROM work_files WHERE id=?').get(Number(r.lastInsertRowid)));
}
function reclassify(ids) {
  const rows = ids && ids.length
    ? db.prepare(`SELECT * FROM work_files WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids.map(Number))
    : db.prepare('SELECT * FROM work_files WHERE hidden=0 AND missing=0 ORDER BY added_at DESC LIMIT 200').all();
  let changed = 0;
  for (const r of rows) {
    const abs = r.root === 'books' ? path.join(BOOKS_ROOT, r.path) : path.join(WORK_ROOT, r.path);
    let st; try { st = fs.statSync(abs); } catch { continue; }
    const c = classifyWork(r.path, r.filename, abs, st);
    const lock = String(r.locked || '').split(',').filter(Boolean);
    db.prepare(`UPDATE work_files SET project=?,project_source=?,doc_date=?,date_source=?,doc_type=?,tags=?,snippet=?,updated_at=? WHERE id=?`)
      .run(lock.includes('project') ? r.project : c.project, lock.includes('project') ? r.project_source : c.project_source,
        lock.includes('doc_date') ? r.doc_date : c.doc_date, lock.includes('doc_date') ? r.date_source : c.date_source,
        lock.includes('doc_type') ? r.doc_type : c.doc_type, lock.includes('tags') ? r.tags : c.tags,
        c.snippet, now(), r.id);
    changed++;
  }
  return { changed };
}
/* 项目 CRUD */
function projects() {
  return db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM work_files w WHERE w.project=p.name AND w.hidden=0 AND w.missing=0) count
    FROM work_projects p ORDER BY p.created_at, p.id`).all();
}
function createProject(b) {
  const name = clean(b.name);
  if (!name) throw new Error('项目名不能为空');
  const r = db.prepare('INSERT INTO work_projects(name,color,description,created_at) VALUES(?,?,?,?)')
    .run(name, String(b.color || '#6366f1'), String(b.description || ''), now());
  return { id: Number(r.lastInsertRowid), name };
}
function updateProject(id, b) {
  const sets = [], args = [];
  for (const k of ['name', 'color', 'description']) if (k in b) { sets.push(`${k}=?`); args.push(String(b[k] || '')); }
  if (!sets.length) return { ok: true };
  const old = db.prepare('SELECT name FROM work_projects WHERE id=?').get(Number(id));
  db.prepare(`UPDATE work_projects SET ${sets.join(',')} WHERE id=?`).run(...args, Number(id));
  if (old && 'name' in b && clean(b.name) && clean(b.name) !== old.name)
    db.prepare('UPDATE work_files SET project=?,project_source=?,updated_at=? WHERE project=?')
      .run(clean(b.name), '手动指定', now(), old.name);
  return { ok: true };
}
function deleteProject(id) {
  const p = db.prepare('SELECT * FROM work_projects WHERE id=?').get(Number(id));
  if (!p) return { ok: true };
  db.prepare('UPDATE work_files SET project=?,project_source=?,updated_at=? WHERE project=?')
    .run('未归档', '待确认', now(), p.name);
  db.prepare('DELETE FROM work_projects WHERE id=?').run(Number(id));
  return { ok: true, unassigned: true };
}

/* ---------------------- 可选：AI 辅助识别（需用户自填 Key） ---------------------- */
function aiConfig() {
  try { return JSON.parse(getSetting('ai_config', '{}')); } catch { return {}; }
}
async function aiClassify(ids) {
  const cfg = aiConfig();
  if (!cfg.apiKey) throw new Error('请先在「设置」中配置 AI 账户（也可不配置，规则识别已可离线工作）');
  const rows = (ids && ids.length
    ? db.prepare(`SELECT * FROM work_files WHERE id IN (${ids.map(() => '?').join(',')}) AND hidden=0`).all(...ids.map(Number))
    : db.prepare("SELECT * FROM work_files WHERE hidden=0 AND (project='未归档' OR date_source='文件修改时间') LIMIT 20").all());
  if (!rows.length) return { changed: 0, message: '没有需要识别的文件' };
  const brief = rows.map(r => ({ id: r.id, name: r.filename, hint: (r.snippet || '').slice(0, 160),
    project: r.project, date: r.doc_date, type: r.doc_type }));
  const prompt = `你是工作文档归档助手。根据文件名与内容摘录，判断每个文件所属项目、业务日期、文档类型。
只返回 JSON 数组，不要解释、不要 Markdown 代码块。每项格式：
{"id":数字,"project":"项目名","doc_date":"YYYY-MM-DD","doc_type":"类型","note":"一句话说明"}
项目名用简短中文（2-20字），无法判断时用"未归档"；日期无法判断时保留原值；
类型从这些里选：会议纪要 / 方案 / 规划 / 需求 / PRD / 设计 / 原型 / 汇报 / 总结 / 合同 / 法务 / 预算 / 财务 / 数据 / 报表 / 测试 / QA / 调研 / 评审 / 计划 / 排期 / 通知 / 公文 / 简历 / 人事 / 讲义 / 培训 / 其他文档。
待归档文件：\n${JSON.stringify(brief)}`;
  let upstream;
  try {
    upstream = await fetch((cfg.baseUrl || '').replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model || 'deepseek-chat', stream: false, temperature: 0.1,
        messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(90000)
    });
  } catch (e) { throw new Error('无法连接 AI 服务：' + e.message); }
  if (!upstream.ok) throw new Error('AI 服务返回 ' + upstream.status);
  const j = await upstream.json();
  let text = j.choices?.[0]?.message?.content || '';
  text = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  let arr = []; try { arr = JSON.parse(a >= 0 && b > a ? text.slice(a, b + 1) : text); } catch { throw new Error('AI 返回格式无法解析'); }
  let changed = 0;
  for (const it of arr) {
    const r = rows.find(x => x.id === Number(it.id));
    if (!r) continue;
    const lock = String(r.locked || '').split(',').filter(Boolean);
    const sets = [], args = [];
    if (!lock.includes('project') && it.project && clean(it.project) && clean(it.project) !== '未归档') {
      sets.push('project=?', 'project_source=?'); args.push(clean(it.project), 'AI 识别');
    }
    if (!lock.includes('doc_date') && /^\d{4}-\d{2}-\d{2}$/.test(it.doc_date || '')) {
      sets.push('doc_date=?', 'date_source=?'); args.push(it.doc_date, 'AI 识别');
    }
    if (!lock.includes('doc_type') && it.doc_type) { sets.push('doc_type=?'); args.push(String(it.doc_type).slice(0, 20)); }
    if (it.note) { sets.push('note=?'); args.push(String(it.note).slice(0, 200)); }
    if (sets.length) {
      sets.push('updated_at=?'); args.push(now(), r.id);
      db.prepare(`UPDATE work_files SET ${sets.join(',')} WHERE id=?`).run(...args);
      changed++;
    }
  }
  return { changed, total: rows.length, model: cfg.model };
}

function absOf(r) {
  return path.resolve(r.root === 'books' ? BOOKS_ROOT : WORK_ROOT, r.path);
}

module.exports = {
  WORK_DIR, WORK_MIRROR_DIR, WORK_ROOT, MIRROR_ROOT,
  syncWork, stageAndClassify, classifyWork, materializeMirror, officeText,
  list, facets, stats, pack, update, remove, adopt, reclassify, aiClassify,
  projects, createProject, updateProject, deleteProject, absOf, knownProjects,
  ensureWorkDir: () => { try { fs.mkdirSync(WORK_ROOT, { recursive: true }); } catch {} }
};
