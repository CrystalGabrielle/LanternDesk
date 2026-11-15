'use strict';
// 灯下 · Lantern Desk —— 仅内网访问的私人书库与工作台服务（零第三方运行时依赖）
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const C = require('./core');
const TREE = require('./tree');
const COVERS = require('./covers');
const W = require('./work');

const { db, now, getSetting, setSetting, BOOKS_ROOT, DATA_DIR, PUBLIC_ROOT,
  IMPORT_DIR, MIRROR_DIR, READABLE, guessCategory, guessSubcategory,
  classify, sync, lastScan, materializeMirror } = C;
const PORT = Number(process.env.PORT || 8090);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const BOOKS_ABS = path.resolve(BOOKS_ROOT);
const SCAN_INTERVAL = Math.max(1, Number(process.env.SCAN_INTERVAL_MIN || 10));
// 书库与工作台共用一次扫描：先建图书索引，再识别工作文件的项目 / 日期 / 类型
function runSync() {
  const s = sync();
  const w = W.syncWork();
  return { ...s, work: w };
}
W.ensureWorkDir();

/* ---------------------------- 基础工具 ---------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.epub': 'application/epub+zip',
  '.txt': 'text/plain', '.md': 'text/plain', '.mht': 'message/rfc822', '.htm': 'text/html',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.zip': 'application/zip', '.rar': 'application/vnd.rar',
  '.xml': 'application/xml', '.opf': 'application/oebps-package+xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword', '.ppt': 'application/vnd.ms-powerpoint',
  '.xls': 'application/vnd.ms-excel', '.rtf': 'application/rtf'
};
const mimeOf = p => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

function send(res, code, data, headers = {}) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const ok = (res, data) => send(res, 200, data || { ok: true });
const fail = (res, code, msg, extra = {}) => send(res, code, { error: msg, ...extra });

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('请求体过大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJSON(req) {
  const b = await readBody(req);
  if (!b.length) return {};
  try { return JSON.parse(b.toString('utf8')); } catch { throw new Error('JSON 格式错误'); }
}

function serveFile(req, res, abs, { download = false, name = '' } = {}) {
  let st;
  try { st = fs.statSync(abs); } catch { return fail(res, 404, '文件不存在'); }
  if (!st.isFile()) return fail(res, 404, '不是文件');
  const type = mimeOf(abs);
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=0' };
  if (download) {
    const fn = name || path.basename(abs);
    headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(fn)}"; filename*=UTF-8''${encodeURIComponent(fn)}`;
  }
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      let start = m[1] ? Number(m[1]) : 0;
      let end = m[2] ? Number(m[2]) : st.size - 1;
      if (start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(abs, { start, end }).pipe(res);
    }
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  fs.createReadStream(abs).pipe(res);
}

/* ---------------------------- 内网安全 ---------------------------- */
function isPrivate(ip) {
  ip = (ip || '').replace(/^::ffff:/, '').toLowerCase();
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '') return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(ip) || ip === 'fe80::1') return true;
  return false;
}
function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const tokenFor = () => crypto.createHmac('sha256', getSetting('pin_hash', 'nop')).update('lan-library-session').digest('hex');
const authed = req => !getSetting('pin_hash', '') || parseCookies(req.headers.cookie || '').ll_token === tokenFor();

/* ---------------------------- AI 配置 ---------------------------- */
function aiRaw() {
  try { return JSON.parse(getSetting('ai_config', '{}')); } catch { return {}; }
}
function aiPublic() {
  const c = aiRaw();
  return { provider: c.provider || 'deepseek', baseUrl: c.baseUrl || 'https://api.deepseek.com/v1',
    model: c.model || 'deepseek-chat', enabled: c.enabled !== false,
    apiKey: '', hasKey: !!c.apiKey, keyHint: c.apiKey ? '••••••••' + c.apiKey.slice(-4) : '' };
}

/* ---------------------- MOBI / 文本提取辅助 ---------------------- */
function palmDocUncompress(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === 0) { out.push(0); continue; }
    if (c <= 8) { for (let j = 0; j < c && i + 1 < buf.length; j++) out.push(buf[++i]); continue; }
    if (c < 0x80) { out.push(c); continue; }
    if (c < 0xc0) {
      if (i + 1 >= buf.length) break;
      const v = (c << 8) | buf[++i];
      const dist = (v >> 3) & 0x7ff, len = (v & 7) + 3;
      for (let j = 0; j < len; j++) out.push(out[out.length - dist] || 32);
      continue;
    }
    out.push(32, c ^ 0x80);
  }
  return Buffer.from(out);
}
// 旧版二进制 Office（OLE 复合文档）无法无损还原排版，尽力抽取 UTF-16 文本供阅读/检索
function legacyOfficeText(buf) {
  const out = [];
  let cur = '';
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const c = buf.readUInt16LE(i);
    const printable = (c >= 0x20 && c <= 0x7e) || (c >= 0x4e00 && c <= 0x9fff) ||
      (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef) || c === 0x0a || c === 0x0d;
    if (printable) cur += String.fromCharCode(c === 0x0a || c === 0x0d ? 0x20 : c);
    else { if (cur.trim().length >= 4) out.push(cur.trim()); cur = ''; }
  }
  if (cur.trim().length >= 4) out.push(cur.trim());
  return out.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 300000);
}
function extractText(abs, ext) {
  const buf = fs.readFileSync(abs);
  if (ext === 'rtf') {
    return buf.toString('utf8').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\{\\\*?[^}]*\}|\\par[d]?|\\[a-z]+-?\d* ?|[{}]/gi, ' ').replace(/[ \t]{2,}/g, ' ');
  }
  if (['doc', 'ppt', 'xls', 'wps', 'et', 'dps'].includes(ext)) return legacyOfficeText(buf);
  if (['txt', 'md', 'csv', 'mht', 'htm', 'html'].includes(ext)) {
    const utf8 = buf.toString('utf8');
    // 老资料里常见 GBK / GB18030 编码，UTF-8 解码出现大量替换符时自动回退
    if ((utf8.match(/\uFFFD/g) || []).length > 3) {
      try { return new TextDecoder('gb18030').decode(buf).replace(/^\uFEFF/, ''); } catch {}
    }
    return utf8.replace(/^\uFEFF/, '');
  }
  if (['mobi', 'azw', 'azw3', 'prc'].includes(ext) && buf.length > 100) {
    const count = buf.readUInt16BE(76);
    const recs = [];
    for (let i = 0; i < count; i++) recs.push(buf.readUInt32BE(78 + i * 8));
    const r0 = recs[0], r1 = recs[1] || buf.length;
    const comp = buf.readUInt16BE(r0);
    const textLen = buf.readUInt32BE(r0 + 4);
    const recCount = buf.readUInt16BE(r0 + 8);
    let text = Buffer.alloc(0);
    const chunks = [];
    for (let i = 1; i <= Math.min(recCount, recs.length - 1, 2000); i++) {
      const s = recs[i], e = recs[i + 1] || Math.min(buf.length, s + 4096);
      let part = buf.subarray(s, e);
      if (comp === 2) part = palmDocUncompress(part);
      chunks.push(part);
    }
    text = Buffer.concat(chunks).subarray(0, textLen || undefined);
    return text.toString('utf8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  }
  return null;
}

/* ------------------------------ 路由 ------------------------------ */
const routes = [];
const add = (m, re, fn) => routes.push({ m, re: new RegExp('^' + re + '$'), fn });

/* --- 状态与统计 --- */
add('GET', '/api/health', ({ res }) => ok(res, { ok: true, ts: now() }));
add('GET', '/api/state', ({ res, req }) => {
  const total = db.prepare('SELECT COUNT(*) n FROM books WHERE hidden=0 AND missing=0 AND is_asset=0').get().n;
  const shelves = db.prepare('SELECT COUNT(*) n FROM shelves').get().n;
  const marks = db.prepare('SELECT COUNT(*) n FROM bookmarks').get().n;
  const reading = db.prepare('SELECT COUNT(*) n FROM progress WHERE percent>0 AND percent<100').get().n;
  ok(res, { total, shelves, marks, reading, scan: lastScan(),
    lastScanAt: Number(getSetting('last_scan', '0')),
    intervalMin: SCAN_INTERVAL, authEnabled: !!getSetting('pin_hash', ''),
    authenticated: authed(req), ai: aiPublic(),
    mirrorBuiltAt: Number(getSetting('mirror_built_at', '0')),
    mirrorCount: Number(getSetting('mirror_count', '0')),
    covers: COVERS.coverCount(), work: W.stats() });
});
add('GET', '/api/facets', ({ res }) => {
  const base = 'hidden=0 AND missing=0 AND is_asset=0';
  const cat = db.prepare(`SELECT category k, COUNT(*) n FROM books WHERE ${base} GROUP BY category ORDER BY n DESC`).all();
  const kind = db.prepare(`SELECT kind k, COUNT(*) n FROM books WHERE ${base} GROUP BY kind ORDER BY n DESC`).all();
  const fmt = db.prepare(`SELECT format k, COUNT(*) n FROM books WHERE ${base} GROUP BY format ORDER BY n DESC LIMIT 20`).all();
  const sub = db.prepare(`SELECT subcategory k, COUNT(*) n FROM books WHERE ${base} AND subcategory<>'' GROUP BY subcategory ORDER BY n DESC LIMIT 40`).all();
  ok(res, { categories: cat, kinds: kind, formats: fmt, subcategories: sub });
});

/* --- 图书 --- */
// 筛选条件在「平铺列表」与「目录树」间复用，保证两个视图看到的是同一批书
function bookWhere(q, { assets = false } = {}) {
  const where = ['b.hidden=0', 'b.missing=0']; const args = [];
  if (!assets) where.push('b.is_asset=0');   // 封面素材不算一本书，避免混进书架
  if (q.get('kind')) { where.push('b.kind=?'); args.push(q.get('kind')); }
  if (q.get('category')) { where.push('b.category=?'); args.push(q.get('category')); }
  if (q.get('subcategory')) { where.push('b.subcategory=?'); args.push(q.get('subcategory')); }
  if (q.get('format')) { where.push('b.format=?'); args.push(q.get('format')); }
  if (q.get('q')) { where.push('(b.title LIKE ? OR b.filename LIKE ? OR b.tags LIKE ? OR b.author LIKE ? OR b.category LIKE ?)'); const s = '%' + q.get('q') + '%'; args.push(s, s, s, s, s); }
  if (q.get('shelf')) {
    where.push('EXISTS(SELECT 1 FROM book_shelves bs WHERE bs.book_id=b.id AND bs.shelf_id=?)'); args.push(Number(q.get('shelf')));
  }
  if (q.get('favorite')) where.push('EXISTS(SELECT 1 FROM bookmarks bm WHERE bm.book_id=b.id)');
  if (q.get('reading')) where.push('EXISTS(SELECT 1 FROM progress pr WHERE pr.book_id=b.id AND pr.percent>0 AND pr.percent<100)');
  const sortMap = { recent: 'b.added_at DESC', title: 'b.title ASC', size: 'b.size DESC', reading: 'pr.updated_at DESC', progress: 'pr.percent DESC' };
  return { where, args, sort: sortMap[q.get('sort') || 'recent'] || sortMap.recent };
}
add('GET', '/api/books', ({ res, q }) => {
  const { where, args, sort } = bookWhere(q);
  const page = Math.max(1, Number(q.get('page') || 1));
  const size = Math.min(200, Math.max(1, Number(q.get('size') || 60)));
  const base = `FROM books b LEFT JOIN progress pr ON pr.book_id=b.id WHERE ${where.join(' AND ')}`;
  const total = db.prepare('SELECT COUNT(*) n ' + base).get(...args).n;
  const rows = db.prepare(`SELECT b.*, COALESCE(pr.percent,0) percent, pr.updated_at read_at,
      (SELECT COUNT(*) FROM bookmarks bm WHERE bm.book_id=b.id) marks ${base} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .all(...args, size, (page - 1) * size);
  const ids = rows.map(r => r.id);
  let shelfMap = {};
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    for (const r of db.prepare(`SELECT bs.book_id, s.id, s.name, s.color FROM book_shelves bs JOIN shelves s ON s.id=bs.shelf_id WHERE bs.book_id IN (${ph})`).all(...ids)) {
      (shelfMap[r.book_id] ||= []).push({ id: r.id, name: r.name, color: r.color });
    }
  }
  ok(res, { total, page, size, books: rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'),
    shelves: shelfMap[r.id] || [], covered: COVERS.hasCover(r.id) ? 1 : 0 })) });
});

/* --- 目录层级浏览（默认视图） --- */
add('GET', '/api/tree', ({ res, q }) => {
  const { where, args } = bookWhere(q, { assets: true });
  const rows = db.prepare(`SELECT b.*, COALESCE(pr.percent,0) percent, pr.updated_at read_at,
      (SELECT COUNT(*) FROM bookmarks bm WHERE bm.book_id=b.id) marks
      FROM books b LEFT JOIN progress pr ON pr.book_id=b.id WHERE ${where.join(' AND ')}`).all(...args);
  const parsed = rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]'), covered: COVERS.hasCover(r.id) ? 1 : 0 }));
  ok(res, TREE.build(parsed, q.get('path') || '', q.get('page') || 1, q.get('size') || 60,
    { drill: q.get('drill') !== '0' }));
});

/* --- 封面（真实图片优先，SVG 兜底） --- */
function sendImage(res, buf, type, cache) {
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': buf.length,
    'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
  res.end(buf);
}
// 必须在 /api/cover/:id 之前注册，否则会被数字路由吃掉
add('GET', '/api/cover/folder', ({ res, q }) => {
  const svg = COVERS.svgCover({ title: q.get('name') || '文件夹', category: q.get('category') || '',
    kind: 'folder', folder: true, count: Number(q.get('count') || 0) });
  sendImage(res, Buffer.from(svg), 'image/svg+xml; charset=utf-8', 'no-store');
});
add('GET', '/api/cover/([^/]+)', async ({ res, parts }) => {
  const id = Number(parts[0]);
  const b = db.prepare('SELECT id,title,category,format,kind FROM books WHERE id=?').get(id);
  if (!b) return fail(res, 404, '图书不存在');
  const hit = await COVERS.resolve(id);
  if (hit) return sendImage(res, hit.buf, hit.type, 'private, max-age=604800');
  // 没有真实封面：返回排版式文字封面，前端再异步补全 PDF 首页
  const svg = COVERS.svgCover({ title: b.title, category: b.category, format: b.format, kind: b.kind });
  sendImage(res, Buffer.from(svg), 'image/svg+xml; charset=utf-8', 'no-store');
});
// 浏览器用 PDF.js 渲染首页后回传，服务端持久化，其他设备直接命中缓存
add('POST', '/api/cover/([^/]+)', async ({ res, req, parts }) => {
  const id = Number(parts[0]);
  if (!db.prepare('SELECT id FROM books WHERE id=?').get(id)) return fail(res, 404, '图书不存在');
  let buf;
  try { buf = await readBody(req, 6 * 1024 * 1024); } catch (e) { return fail(res, 413, e.message); }
  const type = COVERS.saveCover(id, buf);
  if (!type) return fail(res, 400, '不是有效的 JPEG / PNG / WebP 图片');
  ok(res, { ok: true, type });
});

add('GET', '/api/books/([^/]+)', ({ res, parts }) => {
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(Number(parts[0]));
  if (!b) return fail(res, 404, '图书不存在');
  const sh = db.prepare('SELECT s.id,s.name,s.color FROM book_shelves bs JOIN shelves s ON s.id=bs.shelf_id WHERE bs.book_id=?').all(b.id);
  const pr = db.prepare('SELECT * FROM progress WHERE book_id=?').get(b.id);
  ok(res, { ...b, tags: JSON.parse(b.tags || '[]'), shelves: sh, progress: pr || null });
});
add('PATCH', '/api/books/([^/]+)', async ({ res, parts, req }) => {
  const id = Number(parts[0]); const body = await readJSON(req);
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!b) return fail(res, 404, '图书不存在');
  const sets = [], args = [];
  for (const k of ['title', 'author', 'category', 'subcategory']) if (k in body) { sets.push(`${k}=?`); args.push(String(body[k] || '')); }
  if ('tags' in body) { sets.push('tags=?'); args.push(JSON.stringify(Array.isArray(body.tags) ? body.tags : [])); }
  if (sets.length) { sets.push('updated_at=?'); args.push(now(), id); db.prepare(`UPDATE books SET ${sets.join(',')} WHERE id=?`).run(...args); }
  if (Array.isArray(body.shelves)) {
    db.prepare('DELETE FROM book_shelves WHERE book_id=?').run(id);
    const link = db.prepare('INSERT OR IGNORE INTO book_shelves(book_id,shelf_id,added_at) VALUES(?,?,?)');
    for (const sid of body.shelves) link.run(id, Number(sid), now());
  }
  ok(res, { ok: true });
});
add('DELETE', '/api/books/([^/]+)', async ({ res, req, parts, q }) => {
  const id = Number(parts[0]);
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!b) return fail(res, 404, '图书不存在');
  // 默认仅从图书馆移除，磁盘文件一律保留
  if (q.get('purge') === '1') {
    const body = await readJSON(req).catch(() => ({}));
    if (body.confirm !== 'DELETE') return fail(res, 400, '需要二次确认');
    if (!b.imported) return fail(res, 403, '原始资料禁止物理删除，只能移出图书馆');
    try { fs.unlinkSync(path.join(BOOKS_ROOT, b.path)); } catch {}
    db.prepare('DELETE FROM books WHERE id=?').run(id);
    db.prepare('DELETE FROM book_shelves WHERE book_id=?').run(id);
    db.prepare('DELETE FROM bookmarks WHERE book_id=?').run(id);
    db.prepare('DELETE FROM progress WHERE book_id=?').run(id);
    return ok(res, { purged: true });
  }
  db.prepare('UPDATE books SET hidden=1,updated_at=? WHERE id=?').run(now(), id);
  ok(res, { hidden: true });
});
add('POST', '/api/books/([^/]+)/restore', ({ res, parts }) => {
  db.prepare('UPDATE books SET hidden=0 WHERE id=?').run(Number(parts[0])); ok(res);
});

/* --- 书架 --- */
add('GET', '/api/shelves', ({ res }) => {
  const rows = db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM book_shelves bs JOIN books b ON b.id=bs.book_id
      WHERE bs.shelf_id=s.id AND b.hidden=0 AND b.missing=0 AND b.is_asset=0) count
      FROM shelves s ORDER BY s.sort_order, s.id`).all();
  ok(res, { shelves: rows });
});
add('POST', '/api/shelves', async ({ res, req }) => {
  const b = await readJSON(req);
  const name = String(b.name || '').trim();
  if (!name) return fail(res, 400, '书架名不能为空');
  try {
    const r = db.prepare('INSERT INTO shelves(name,description,color,icon,sort_order,created_at) VALUES(?,?,?,?,?,?)')
      .run(name, String(b.description || ''), String(b.color || '#6366f1'), String(b.icon || '📚'), Number(b.sort_order || 0), now());
    ok(res, { id: Number(r.lastInsertRowid), name });
  } catch { fail(res, 409, '同名书架已存在'); }
});
add('PATCH', '/api/shelves/([^/]+)', async ({ res, parts, req }) => {
  const b = await readJSON(req); const id = Number(parts[0]);
  const sets = [], args = [];
  for (const k of ['name', 'description', 'color', 'icon', 'sort_order']) if (k in b) { sets.push(`${k}=?`); args.push(b[k]); }
  if (!sets.length) return ok(res);
  try { db.prepare(`UPDATE shelves SET ${sets.join(',')} WHERE id=?`).run(...args, id); ok(res); }
  catch { fail(res, 409, '同名书架已存在'); }
});
add('DELETE', '/api/shelves/([^/]+)', ({ res, parts }) => {
  const id = Number(parts[0]);
  db.prepare('DELETE FROM book_shelves WHERE shelf_id=?').run(id);
  db.prepare('DELETE FROM shelves WHERE id=?').run(id);
  ok(res);
});
add('POST', '/api/shelves/([^/]+)/books', async ({ res, parts, req }) => {
  const b = await readJSON(req); const sid = Number(parts[0]);
  const ids = Array.isArray(b.bookIds) ? b.bookIds : [];
  const link = db.prepare('INSERT OR IGNORE INTO book_shelves(book_id,shelf_id,added_at) VALUES(?,?,?)');
  db.exec('BEGIN'); for (const id of ids) link.run(Number(id), sid, now()); db.exec('COMMIT');
  ok(res, { added: ids.length });
});
add('DELETE', '/api/shelves/([^/]+)/books/([^/]+)', ({ res, parts }) => {
  db.prepare('DELETE FROM book_shelves WHERE shelf_id=? AND book_id=?').run(Number(parts[0]), Number(parts[1]));
  ok(res);
});

/* --- 阅读进度 / 书签 --- */
add('GET', '/api/progress/([^/]+)', ({ res, parts }) => {
  ok(res, db.prepare('SELECT * FROM progress WHERE book_id=?').get(Number(parts[0])) || { percent: 0, locator: '{}' });
});
add('PUT', '/api/progress/([^/]+)', async ({ res, parts, req }) => {
  const b = await readJSON(req); const id = Number(parts[0]);
  db.prepare(`INSERT INTO progress(book_id,locator,percent,device,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(book_id) DO UPDATE SET locator=excluded.locator,percent=excluded.percent,device=excluded.device,updated_at=excluded.updated_at`)
    .run(id, JSON.stringify(b.locator || {}), Number(b.percent || 0), String(b.device || ''), now());
  ok(res);
});
add('GET', '/api/bookmarks', ({ res, q }) => {
  const where = q.get('bookId') ? 'WHERE book_id=?' : '';
  const args = q.get('bookId') ? [Number(q.get('bookId'))] : [];
  const rows = db.prepare(`SELECT bm.*, b.title book_title FROM bookmarks bm LEFT JOIN books b ON b.id=bm.book_id ${where} ORDER BY bm.created_at DESC`).all(...args);
  ok(res, { bookmarks: rows.map(r => ({ ...r, locator: JSON.parse(r.locator || '{}') })) });
});
add('POST', '/api/bookmarks', async ({ res, req }) => {
  const b = await readJSON(req);
  const r = db.prepare('INSERT INTO bookmarks(book_id,label,locator,note,created_at) VALUES(?,?,?,?,?)')
    .run(Number(b.bookId), String(b.label || ''), JSON.stringify(b.locator || {}), String(b.note || ''), now());
  ok(res, { id: Number(r.lastInsertRowid) });
});
add('PATCH', '/api/bookmarks/([^/]+)', async ({ res, parts, req }) => {
  const b = await readJSON(req);
  const sets = [], args = [];
  for (const k of ['label', 'note']) if (k in b) { sets.push(`${k}=?`); args.push(String(b[k])); }
  if ('locator' in b) { sets.push('locator=?'); args.push(JSON.stringify(b.locator)); }
  if (sets.length) db.prepare(`UPDATE bookmarks SET ${sets.join(',')} WHERE id=?`).run(...args, Number(parts[0]));
  ok(res);
});
add('DELETE', '/api/bookmarks/([^/]+)', ({ res, parts }) => {
  db.prepare('DELETE FROM bookmarks WHERE id=?').run(Number(parts[0])); ok(res);
});

/* --- 扫描 / 整理 --- */
add('POST', '/api/scan', ({ res }) => ok(res, runSync()));
add('GET', '/api/scan/status', ({ res }) => ok(res, { ...lastScan(), intervalMin: SCAN_INTERVAL,
  history: db.prepare('SELECT * FROM scan_log ORDER BY id DESC LIMIT 10').all() }));
add('POST', '/api/organize/materialize', ({ res }) => {
  try { ok(res, materializeMirror()); } catch (e) { fail(res, 500, e.message); }
});

/* --- 导入（自定义二进制上传，避免 multipart 依赖） --- */
add('POST', '/api/import', async ({ req, res }) => {
  const rawName = req.headers['x-file-name'] || '';
  let filename;
  try { filename = decodeURIComponent(rawName); } catch { filename = rawName; }
  filename = path.basename(filename).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  if (!filename) return fail(res, 400, '缺少文件名');
  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  const cat = guessCategory(filename) || guessCategory(IMPORT_DIR + '/' + filename) || '未分类';
  const sub = guessSubcategory(filename) || '';
  const safe = s => s.replace(/[\\/:*?"<>|]/g, '_');
  const dir = path.join(BOOKS_ROOT, IMPORT_DIR, safe(cat), sub ? safe(sub) : '');
  fs.mkdirSync(dir, { recursive: true });
  let dest = path.join(dir, filename);
  if (fs.existsSync(dest)) {
    const dot = filename.lastIndexOf('.');
    dest = path.join(dir, (dot > 0 ? filename.slice(0, dot) : filename) + '_' + Date.now() + (dot > 0 ? filename.slice(dot) : ''));
  }
  // 临时文件必须和目标文件位于同一挂载点，否则 rename 会报 EXDEV
  const tmp = path.join(dir, '.upload_' + crypto.randomBytes(8).toString('hex') + '.part');
  try {
    await pipeline(req, fs.createWriteStream(tmp));
    fs.renameSync(tmp, dest);
    const stat = runSync();
    const rel = path.relative(BOOKS_ROOT, dest).split(path.sep).join('/');
    const row = db.prepare('SELECT id,title,category,subcategory FROM books WHERE path=?').get(rel);
    ok(res, { ok: true, filename: path.basename(dest), category: cat, subcategory: sub,
      book: row || null, scan: stat });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    fail(res, 500, '导入失败：' + e.message);
  }
});

/* --- 原始文件 / 文本 / 下载 --- */
function resolveBook(res, id) {
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(Number(id));
  if (!b) { fail(res, 404, '图书不存在'); return null; }
  const abs = path.resolve(BOOKS_ROOT, b.path);
  if (!abs.startsWith(BOOKS_ABS + path.sep) || !fs.existsSync(abs)) { fail(res, 404, '原文件已不可访问'); return null; }
  return { b, abs };
}
add('GET', '/api/raw/([^/]+)', ({ req, res, parts }) => {
  const r = resolveBook(res, parts[0]); if (!r) return;
  serveFile(req, res, r.abs);
});
add('GET', '/api/download/([^/]+)', ({ req, res, parts }) => {
  const r = resolveBook(res, parts[0]); if (!r) return;
  serveFile(req, res, r.abs, { download: true, name: r.b.filename });
});
add('GET', '/api/text/([^/]+)', ({ res, parts }) => {
  const r = resolveBook(res, parts[0]); if (!r) return;
  try {
    const t = extractText(r.abs, r.b.ext);
    if (t === null) return fail(res, 415, '该格式不提供纯文本提取');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(t.slice(0, 6 * 1024 * 1024));
  } catch (e) { fail(res, 500, e.message); }
});

/* ==================== 工作台：工作文件智能整理 ==================== */
function resolveWork(res, id) {
  const r = db.prepare('SELECT * FROM work_files WHERE id=?').get(Number(id));
  if (!r) { fail(res, 404, '工作文件不存在'); return null; }
  const root = path.resolve(r.root === 'books' ? BOOKS_ROOT : W.WORK_ROOT);
  const abs = path.resolve(root, r.path);
  if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) { fail(res, 404, '原文件已不可访问'); return null; }
  return { r, abs };
}
add('GET', '/api/work/files', ({ res, q }) => ok(res, W.list(q)));
add('GET', '/api/work/facets', ({ res }) => ok(res, W.facets()));
add('GET', '/api/work/projects', ({ res }) => ok(res, { projects: W.projects() }));
add('POST', '/api/work/projects', async ({ res, req }) => {
  try { ok(res, W.createProject(await readJSON(req))); } catch (e) { fail(res, 400, e.message); }
});
add('PATCH', '/api/work/projects/([^/]+)', async ({ res, req, parts }) => {
  try { ok(res, W.updateProject(parts[0], await readJSON(req))); } catch (e) { fail(res, 400, e.message); }
});
add('DELETE', '/api/work/projects/([^/]+)', ({ res, parts }) => ok(res, W.deleteProject(parts[0])));
add('GET', '/api/work/files/([^/]+)', ({ res, parts }) => {
  const r = db.prepare('SELECT * FROM work_files WHERE id=?').get(Number(parts[0]));
  if (!r) return fail(res, 404, '工作文件不存在');
  ok(res, W.pack(r));
});
add('PATCH', '/api/work/files/([^/]+)', async ({ res, req, parts }) => {
  try { ok(res, W.update(parts[0], await readJSON(req))); } catch (e) { fail(res, 400, e.message); }
});
add('DELETE', '/api/work/files/([^/]+)', ({ res, parts }) => ok(res, W.remove(parts[0])));
add('POST', '/api/work/files/([^/]+)/restore', ({ res, parts }) => ok(res, W.remove(parts[0], true)));
add('POST', '/api/work/adopt', async ({ res, req }) => {
  const b = await readJSON(req);
  try { ok(res, { file: W.adopt(b.bookId) }); } catch (e) { fail(res, 400, e.message); }
});
add('POST', '/api/work/reclassify', async ({ res, req }) => {
  const b = await readJSON(req).catch(() => ({}));
  ok(res, W.reclassify(b.ids));
});
add('POST', '/api/work/ai-classify', async ({ res, req }) => {
  const b = await readJSON(req).catch(() => ({}));
  try { ok(res, await W.aiClassify(b.ids)); } catch (e) { fail(res, 400, e.message); }
});
add('POST', '/api/work/organize', ({ res }) => {
  try { ok(res, W.materializeMirror()); } catch (e) { fail(res, 500, e.message); }
});
// 从浏览器导入工作文件：先落到同一挂载点的临时文件，识别项目 / 日期后再归档
add('POST', '/api/work/import', async ({ req, res }) => {
  const rawName = req.headers['x-file-name'] || '';
  let filename;
  try { filename = decodeURIComponent(rawName); } catch { filename = rawName; }
  filename = path.basename(filename).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  if (!filename) return fail(res, 400, '缺少文件名');
  const dir = path.join(W.WORK_ROOT, '_暂存');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return fail(res, 500, '无法创建工作目录：' + e.message); }
  const tmp = path.join(dir, '.upload_' + crypto.randomBytes(8).toString('hex') + '.part');
  try {
    await pipeline(req, fs.createWriteStream(tmp));
    const out = W.stageAndClassify(tmp, filename);
    const scan = runSync();
    const row = db.prepare("SELECT * FROM work_files WHERE root='work' AND path=?").get(out.rel);
    ok(res, { ok: true, filename: path.basename(out.dest), project: out.c.project,
      project_source: out.c.project_source, doc_date: out.c.doc_date, date_source: out.c.date_source,
      doc_type: out.c.doc_type, file: row ? W.pack(row) : null, scan });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    fail(res, 500, '导入失败：' + e.message);
  }
});
add('GET', '/api/work/raw/([^/]+)', ({ req, res, parts }) => {
  const r = resolveWork(res, parts[0]); if (!r) return;
  serveFile(req, res, r.abs);
});
add('GET', '/api/work/download/([^/]+)', ({ req, res, parts }) => {
  const r = resolveWork(res, parts[0]); if (!r) return;
  serveFile(req, res, r.abs, { download: true, name: r.r.filename });
});
add('GET', '/api/work/text/([^/]+)', ({ res, parts }) => {
  const r = resolveWork(res, parts[0]); if (!r) return;
  try {
    let t = extractText(r.abs, r.r.ext);
    if (t === null) t = W.officeText(r.abs, r.r.ext);
    if (!t) return fail(res, 415, '该格式无法提取文本，请下载后用本地应用打开');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(t.slice(0, 6 * 1024 * 1024));
  } catch (e) { fail(res, 500, e.message); }
});

/* --- AI --- */
add('GET', '/api/settings/ai', ({ res }) => ok(res, aiPublic()));
add('PUT', '/api/settings/ai', async ({ res, req }) => {
  const b = await readJSON(req); const old = aiRaw();
  const cfg = {
    provider: String(b.provider || old.provider || 'deepseek'),
    baseUrl: String(b.baseUrl || old.baseUrl || '').replace(/\/+$/, ''),
    model: String(b.model || old.model || ''),
    enabled: b.enabled !== false,
    apiKey: b.clearKey ? '' : (b.apiKey ? String(b.apiKey) : (old.apiKey || ''))
  };
  setSetting('ai_config', JSON.stringify(cfg));
  ok(res, aiPublic());
});
add('POST', '/api/ai/test', async ({ res }) => {
  const cfg = aiRaw();
  if (!cfg.apiKey) return fail(res, 400, '请先填写 API Key');
  try {
    const r = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: '请只回复"连接成功"' }], max_tokens: 16, stream: false }),
      signal: AbortSignal.timeout(20000)
    });
    if (!r.ok) return fail(res, 502, `上游返回 ${r.status}: ${(await r.text()).slice(0, 300)}`);
    ok(res, { ok: true, model: cfg.model });
  } catch (e) { fail(res, 502, '无法连接 AI 服务：' + e.message + '（请确认 NAS 可访问外网）'); }
});
add('POST', '/api/ai/chat', async ({ req, res }) => {
  const cfg = aiRaw();
  if (!cfg.apiKey) return fail(res, 400, '尚未配置 AI 账户，请在设置中填写 API Key');
  let b; try { b = await readJSON(req); } catch (e) { return fail(res, 400, e.message); }
  const book = b.bookId ? db.prepare('SELECT title,author,category FROM books WHERE id=?').get(Number(b.bookId)) : null;
  const sys = `你是一位贴心的阅读助手，正在帮助用户阅读《${book ? book.title : '一本书'}》${book && book.author ? '（作者：' + book.author + '）' : ''}。请用简体中文回答，简洁、准确、有条理；引用用户给的原文时保持原样。回答控制在 500 字以内，除非用户要求展开。`;
  const messages = [{ role: 'system', content: sys }];
  const hist = b.history || [];
  for (const m of hist.slice(-8)) if (m && m.role && m.content) messages.push({ role: m.role, content: String(m.content).slice(0, 4000) });
  const ctx = b.context ? `\n\n【当前阅读内容摘录】\n${String(b.context).slice(0, 6000)}` : '';
  messages.push({ role: 'user', content: String(b.question || '请介绍一下这本书') + ctx });
  let upstream;
  try {
    upstream = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: 0.7 }),
      signal: AbortSignal.timeout(120000)
    });
  } catch (e) { return fail(res, 502, '无法连接 AI 服务：' + e.message); }
  if (!upstream.ok) {
    const t = await upstream.text().catch(() => '');
    return fail(res, 502, `AI 服务返回 ${upstream.status}: ${t.slice(0, 400)}`);
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  let answer = '';
  try {
    const reader = upstream.body.getReader(), dec = new TextDecoder('utf-8');
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim();
        if (!d || d === '[DONE]') continue;
        try { const j = JSON.parse(d); answer += (j.choices?.[0]?.delta?.content || ''); } catch {}
      }
    }
  } catch (e) { console.error('[ai] stream', e.message); }
  res.end();
  try {
    const ins = db.prepare('INSERT INTO ai_messages(book_id,role,content,created_at) VALUES(?,?,?,?)');
    ins.run(b.bookId ? Number(b.bookId) : null, 'user', String(b.question || ''), now());
    if (answer) ins.run(b.bookId ? Number(b.bookId) : null, 'assistant', answer, now());
  } catch {}
});
add('GET', '/api/ai/history', ({ res, q }) => {
  const where = q.get('bookId') ? 'WHERE book_id=?' : '';
  const args = q.get('bookId') ? [Number(q.get('bookId'))] : [];
  ok(res, { messages: db.prepare(`SELECT * FROM ai_messages ${where} ORDER BY id DESC LIMIT 40`).all(...args).reverse() });
});
add('DELETE', '/api/ai/history', ({ res, q }) => {
  if (q.get('bookId')) db.prepare('DELETE FROM ai_messages WHERE book_id=?').run(Number(q.get('bookId')));
  else db.exec('DELETE FROM ai_messages');
  ok(res);
});

/* --- 访问口令 --- */
add('POST', '/api/login', async ({ req, res }) => {
  const b = await readJSON(req);
  const stored = getSetting('pin_hash', '');
  if (!stored) return ok(res, { ok: true });
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(String(b.pin || ''), salt, 32);
  if (!crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'))) return fail(res, 401, '口令不正确');
  send(res, 200, { ok: true }, { 'Set-Cookie': `ll_token=${tokenFor()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` });
});
add('PUT', '/api/settings/pin', async ({ res, req }) => {
  const b = await readJSON(req);
  const pin = String(b.pin || '');
  if (!pin) { setSetting('pin_hash', ''); return ok(res, { enabled: false }); }
  const salt = crypto.randomBytes(16).toString('hex');
  setSetting('pin_hash', salt + ':' + crypto.scryptSync(pin, salt, 32).toString('hex'));
  ok(res, { enabled: true });
});

/* ---------------------------- HTTP 服务 ---------------------------- */
const server = http.createServer(async (req, res) => {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (!isPrivate(ip)) return fail(res, 403, '本站点仅供局域网访问');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return fail(res, 400, 'Bad request'); }
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith('/api/')) {
    if (!authed(req) && getSetting('pin_hash', '')) return serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
    const rel = pathname === '/' ? '/index.html' : pathname;
    let abs = path.resolve(PUBLIC_DIR, '.' + rel);
    if (!abs.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) abs = path.resolve(PUBLIC_DIR, 'index.html');
    return serveFile(req, res, abs);
  }
  if (pathname !== '/api/health' && pathname !== '/api/login' && !authed(req))
    return fail(res, 401, '需要访问口令', { needAuth: true });

  for (const r of routes) {
    if (r.m !== req.method) continue;
    const m = r.re.exec(pathname);
    if (!m) continue;
    const ctx = { req, res, url, q: url.searchParams, parts: m.slice(1) };
    try { await r.fn(ctx); }
    catch (e) { console.error('[route]', req.method, pathname, e); if (!res.headersSent) fail(res, 500, e.message); else res.end(); }
    return;
  }
  fail(res, 404, '接口不存在');
});

server.on('clientError', (e, sock) => { try { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {} });

console.log('[boot] 首次扫描资料目录与工作目录…');
try { runSync(); } catch (e) { console.error('[boot] 扫描失败', e); }
server.listen(PORT, '0.0.0.0', () => console.log(`[boot] 已启动 :${PORT} （仅内网）`));
setInterval(() => { try { runSync(); } catch (e) { console.error('[scan]', e.message); } }, SCAN_INTERVAL * 60 * 1000);
