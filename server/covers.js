'use strict';
// 封面服务：真实封面图 + 服务端缓存 + 精致 SVG 兜底。零第三方运行时依赖。
// 优先级：已生成的缩略图缓存 → 现成封面素材/图片原图 → EPUB 内嵌封面 → PDF 首页（浏览器渲染后回传）→ SVG
const fs = require('node:fs');
const path = require('node:path');
const { db, DATA_DIR, BOOKS_ROOT } = require('./core');

const COVER_DIR = path.join(DATA_DIR, 'covers');
fs.mkdirSync(COVER_DIR, { recursive: true });
const EXTS = ['jpg', 'png', 'webp', 'gif'];
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const idSafe = id => String(Number(id) || 0);

function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return null;
}
function cacheOf(id) {
  for (const e of EXTS) {
    const p = path.join(COVER_DIR, idSafe(id) + '.' + e);
    if (fs.existsSync(p)) return { p, type: TYPES[e] };
  }
  return null;
}
function readCached(id) {
  const c = cacheOf(id);
  if (!c) return null;
  try { return { buf: fs.readFileSync(c.p), type: c.type }; } catch { return null; }
}
/** 保存浏览器渲染生成的缩略图，返回 mime 或 null */
function saveCover(id, buf) {
  if (!Buffer.isBuffer(buf) || buf.length > 6 * 1024 * 1024) return null;
  const ext = sniff(buf);
  if (!ext) return null;
  const dest = path.join(COVER_DIR, idSafe(id) + '.' + ext);
  const tmp = dest + '.tmp';
  try {
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
    for (const e of EXTS) if (e !== ext) { try { fs.unlinkSync(path.join(COVER_DIR, idSafe(id) + '.' + e)); } catch {} }
    return TYPES[ext];
  } catch { try { fs.unlinkSync(tmp); } catch {} return null; }
}
/** 缓存数量（用于状态页） */
function coverCount() {
  try { return fs.readdirSync(COVER_DIR).filter(f => EXTS.some(e => f.endsWith('.' + e))).length; }
  catch { return 0; }
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const PALETTE = {
  ebook: ['#e5e9ff', '#c9d2f8', '#4a52a0'], document: ['#dff3e9', '#c2e7d5', '#2f7d5b'],
  audio: ['#fde9f0', '#f7ccdd', '#a34570'], video: ['#fff0dc', '#f9dcae', '#a5702b'],
  image: ['#e2f5f9', '#c5eaf1', '#2b7d90'], archive: ['#f0e9f9', '#dfd0f2', '#71509b'],
  other: ['#eceef4', '#d9dde8', '#525a75'], folder: ['#e7ecff', '#cfd9fb', '#4353a8']
};
/** 无真实封面时的排版式文字封面 */
function svgCover({ title = '', category = '', format = '', kind = 'ebook', folder = false, count = 0 } = {}) {
  const [c1, c2, ink] = PALETTE[kind] || PALETTE.other;
  const clean = String(title).replace(/[_\s]+/g, ' ').trim() || '未命名';
  const lines = [];
  for (let i = 0; i < clean.length && lines.length < 5; i += 8) lines.push(clean.slice(i, i + 8));
  const startY = 300 - (lines.length - 1) * 25;
  const text = lines.map((l, i) => `<text x="300" y="${startY + i * 50}" text-anchor="middle" font-size="42" font-weight="700" fill="${ink}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif">${esc(l)}</text>`).join('');
  const badge = folder
    ? `<rect x="222" y="600" width="156" height="46" rx="23" fill="${ink}" opacity=".13"/><text x="300" y="631" text-anchor="middle" font-size="24" font-weight="700" fill="${ink}" font-family="sans-serif">${count} 册</text>`
    : `<text x="300" y="666" text-anchor="middle" font-size="22" letter-spacing="3" fill="${ink}" opacity=".72" font-family="sans-serif">${esc(format || 'LAN LIBRARY')}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="600" height="800" fill="url(#g)"/>
<rect x="0" y="0" width="26" height="800" fill="${ink}" opacity=".18"/>
<rect x="46" y="46" width="508" height="708" fill="none" stroke="${ink}" stroke-opacity=".16" stroke-width="2" rx="8"/>
<text x="300" y="150" text-anchor="middle" font-size="20" letter-spacing="6" fill="${ink}" opacity=".6" font-family="sans-serif">${folder ? 'COLLECTION' : 'LAN LIBRARY'}</text>
<line x1="210" y1="182" x2="390" y2="182" stroke="${ink}" stroke-opacity=".35" stroke-width="2"/>
${text}
<line x1="210" y1="610" x2="390" y2="610" stroke="${ink}" stroke-opacity=".25" stroke-width="2"/>
<text x="300" y="716" text-anchor="middle" font-size="20" fill="${ink}" opacity=".62" font-family="sans-serif">${esc(String(category || '').slice(0, 14))}</text>
${badge}
</svg>`;
}

/* ---------------------- 从磁盘找现成封面图 ---------------------- */
function bookAbs(b) {
  const abs = path.resolve(BOOKS_ROOT, b.path);
  return abs.startsWith(path.resolve(BOOKS_ROOT) + path.sep) ? abs : null;
}
function imageFile(id) {
  const hit = cacheOf(id);
  if (hit) return { p: hit.p, type: hit.type, cached: true };
  const b = db.prepare('SELECT * FROM books WHERE id=?').get(Number(id));
  if (!b) return null;
  const abs = bookAbs(b);
  if (!abs || !fs.existsSync(abs)) return null;
  // 1) 图片本身就是封面
  if (b.kind === 'image' || b.is_asset) {
    try {
      const st = fs.statSync(abs);
      if (st.size <= 12 * 1024 * 1024) {
        const buf = fs.readFileSync(abs);
        if (sniff(buf)) return { p: abs, type: TYPES[sniff(buf)] || 'application/octet-stream', cached: false };
      }
    } catch {}
  }
  // 2) 同目录 / 父目录里现成的「封面.webp」等素材
  let dir = b.dir_path || '';
  for (let i = 0; i < 3 && dir; i++) {
    const row = db.prepare('SELECT * FROM books WHERE dir_path=? AND is_asset=1 AND missing=0 LIMIT 1').get(dir);
    if (row) {
      const a = bookAbs(row);
      if (a && fs.existsSync(a)) {
        try {
          const buf = fs.readFileSync(a);
          const ext = sniff(buf);
          if (ext) return { p: a, type: TYPES[ext], cached: false };
        } catch {}
      }
    }
    const j = dir.lastIndexOf('/');
    dir = j > 0 ? dir.slice(0, j) : '';
  }
  // 3) EPUB 内嵌封面（超大图文 EPUB 不整体读入内存，避免拖慢或撑爆容器）
  if (b.ext === 'epub') {
    try { if (fs.statSync(abs).size > 60 * 1024 * 1024) return null; } catch { return null; }
    return epubCover(b, abs);
  }
  return null;
}
function normZipPath(base, rel) {
  const d = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const out = [];
  for (const p of (d + rel).split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop(); else out.push(p);
  }
  return out.join('/');
}
function epubCover(b, abs) {
  try {
    const JSZip = require('../public/vendor/jszip.min.js');
    // JSZip 3.x 的 loadAsync 是静态工厂方法；解析结果交给调用方 await
    if (typeof JSZip.loadAsync !== 'function') return null;
    const out = { pending: true, promise: (async () => {
      const z = await JSZip.loadAsync(fs.readFileSync(abs));
      const c = z.file('META-INF/container.xml');
      if (!c) return null;
      const cx = await c.async('string');
      const m = /full-path=["']([^"']+)["']/.exec(cx);
      if (!m) return null;
      const opfPath = m[1];
      const of = z.file(opfPath);
      const opf = of ? await of.async('string') : '';
      let href = '';
      const meta = /<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i.exec(opf)
        || /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']cover["']/i.exec(opf);
      const tags = opf.match(/<item\b[^>]*>/gi) || [];
      for (const t of tags) {
        const props = (/(?:^|\s)properties=["']([^"']+)["']/i.exec(t) || [])[1] || '';
        const id = (/(?:^|\s)id=["']([^"']+)["']/i.exec(t) || [])[1] || '';
        const h = (/(?:^|\s)href=["']([^"']+)["']/i.exec(t) || [])[1] || '';
        if (/cover-image/i.test(props) || (meta && id === meta[1])) { href = h; break; }
      }
      let name = href ? normZipPath(opfPath, href) : '';
      let f = name ? z.file(name) : null;
      if (!f) {
        const cand = Object.keys(z.files).filter(n => /cover|封面|titlepage/i.test(n) && /\.(jpe?g|png|webp|gif)$/i.test(n));
        if (cand.length) f = z.file(cand.sort((a, b2) => a.length - b2.length)[0]);
      }
      if (!f) return null;
      const buf = Buffer.from(await f.async('uint8array'));
      const ext = sniff(buf);
      if (!ext) return null;
      const dest = path.join(COVER_DIR, idSafe(b.id) + '.' + ext);
      fs.writeFileSync(dest, buf);
      return { buf, type: TYPES[ext] };
    })() };
    return out;
  } catch { return null; }
}

/** 供路由使用：返回 { buf, type, cached } 或 null（null 表示用 SVG 兜底） */
async function resolve(id) {
  const hit = readCached(id);
  if (hit) return hit;
  const r = imageFile(id);
  if (!r) return null;
  if (r.pending) { try { return await r.promise; } catch { return null; } }
  if (r.cached) return { buf: fs.readFileSync(r.p), type: r.type };
  try {
    const buf = fs.readFileSync(r.p);
    const ext = sniff(buf);
    return ext ? { buf, type: TYPES[ext] } : null;
  } catch { return null; }
}

const hasCover = id => !!cacheOf(id);
module.exports = { resolve, saveCover, svgCover, coverCount, cacheOf, hasCover, sniff, COVER_DIR };
