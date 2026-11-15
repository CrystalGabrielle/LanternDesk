'use strict';
// 目录层级视图：按磁盘上的真实目录链构树，序号型分回目录自动聚合成「一套书」。
// 筛选条件由调用方给出，树只包含命中的书，绝不会把不同目录的同名「第01话」混在一起展示。

const CN = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function cnNum(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (s in CN) return CN[s];
  const t = /^十([一二三四五六七八九])$/.exec(s);
  if (t) return 10 + CN[t[1]];
  const u = /^([一二三四五六七八九])十([一二三四五六七八九])?$/.exec(s);
  if (u) return CN[u[1]] * 10 + (u[2] ? CN[u[2]] : 0);
  return NaN;
}
/** 章节/分册标题 → 序号；非章节返回 NaN */
function chapterNum(title) {
  const s = String(title || '').trim();
  let m = /^第\s*([0-9零一二三四五六七八九十]{1,4})\s*(回|话|卷|章|集|期|节|部|篇|册)/.exec(s);
  if (m) return cnNum(m[1]);
  m = /^([0-9]{1,3})[\s._-]*(卷|话|回|章|集|期|册)?\s*(上|下|前篇|后篇|前|后)?$/.exec(s);
  if (m && !isNaN(Number(m[1]))) return Number(m[1]);
  m = /^第\s*([0-9零一二三四五六七八九十]{1,4})\s*[\s._-]*(上|下|前篇|后篇)?$/.exec(s);
  if (m) return cnNum(m[1]);
  return NaN;
}
/** 判断一个目录的直属文件是否是一套连续分册 */
function isSeries(rows) {
  const list = rows.filter(r => !r.is_asset);
  if (list.length < 2) return false;
  const hits = list.filter(r => !isNaN(chapterNum(r.title)) || !isNaN(chapterNum(r.filename)));
  if (hits.length / list.length < 0.6) return false;
  // 只有 2 本时必须都是分册，避免把任意两个文件误并成一套书
  if (list.length < 3 && hits.length !== list.length) return false;
  // 同一套书通常格式一致，避免把杂项文件误并
  const mainKind = list[0].kind;
  return list.filter(r => r.kind === mainKind).length / list.length >= 0.7;
}
function naturalSort(a, b) {
  const na = chapterNum(a.title), nb = chapterNum(b.title);
  const va = isNaN(na) ? chapterNum(a.filename) : na;
  const vb = isNaN(nb) ? chapterNum(b.filename) : nb;
  if (!isNaN(va) && !isNaN(vb) && va !== vb) return va - vb;
  return String(a.title).localeCompare(String(b.title), 'zh-CN', { numeric: true });
}
/** 为目录挑一张代表封面：现成封面素材 > 图片 > PDF/EPUB > 任意 */
function pickCover(rows, fallbackRows) {
  const pool = [...rows, ...(fallbackRows || [])];
  const asset = pool.find(r => r.is_asset);
  if (asset) return { coverId: asset.id, coverTitle: asset.title };
  const img = pool.find(r => r.kind === 'image');
  if (img) return { coverId: img.id, coverTitle: img.title };
  const doc = pool.find(r => ['pdf', 'epub'].includes(String(r.ext).toLowerCase()));
  if (doc) return { coverId: doc.id, coverTitle: doc.title };
  const any = pool[0];
  return any ? { coverId: any.id, coverTitle: any.title } : { coverId: null, coverTitle: '' };
}

/**
 * @param rows 已按筛选条件取出的全部图书行（含封面素材行）
 * @param currentPath 当前目录相对路径，'' 表示根
 * @param page,size 直属图书分页
 */
function build(rows, currentPath = '', page = 1, size = 60, opts = {}) {
  const drill = opts.drill !== false, depth = opts._depth || 0;
  currentPath = String(currentPath || '').replace(/^\/+|\/+$/g, '');
  const prefix = currentPath ? currentPath + '/' : '';
  const dirMap = new Map();
  const direct = [];
  for (const r of rows) {
    const d = String(r.dir_path || '');
    if (currentPath && d !== currentPath && !d.startsWith(prefix)) continue;
    const rest = d === currentPath ? '' : (prefix ? d.slice(prefix.length) : d);
    if (!rest) { direct.push(r); continue; }
    const name = rest.split('/')[0];
    const full = currentPath ? currentPath + '/' + name : name;
    let e = dirMap.get(full);
    if (!e) { e = { name, path: full, count: 0, directRows: [], allRows: [], assets: [] }; dirMap.set(full, e); }
    e.count++;
    e.allRows.push(r);
    if (r.is_asset) e.assets.push(r);
    if (!rest.includes('/')) e.directRows.push(r);
  }
  const dirs = [...dirMap.values()].map(e => {
    const cv = pickCover(e.assets.length ? e.assets : e.directRows, e.allRows);
    return {
      name: e.name, path: e.path, count: e.count,
      direct: e.directRows.filter(r => !r.is_asset).length,
      series: isSeries(e.directRows),
      coverId: cv.coverId, coverTitle: cv.coverTitle,
      kinds: [...new Set(e.allRows.filter(r => !r.is_asset).map(r => r.kind))].slice(0, 4)
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));

  const visible = direct.filter(r => !r.is_asset).sort(naturalSort);
  const seriesHere = isSeries(direct);
  // 连续的单链空目录（如 小说 → 克苏鲁 → 漫画集）自动展开，直接把有内容的那层呈现出来；
  // 面包屑仍保留完整路径，用户随时可以点回中间层（此时前端会带 drill=0 停在该层）。
  if (drill && !seriesHere && dirs.length === 1 && visible.length === 0 && depth < 5) {
    const next = build(rows, dirs[0].path, page, size, { drill, _depth: depth + 1 });
    next.drilled = true; next.drilledFrom = currentPath;
    return next;
  }
  const cv = pickCover(direct.filter(r => r.is_asset), direct);
  const crumbs = [{ name: '全部藏书', path: '' }];
  let acc = '';
  for (const seg of currentPath.split('/').filter(Boolean)) {
    acc = acc ? acc + '/' + seg : seg;
    crumbs.push({ name: seg, path: acc });
  }
  const p = Math.max(1, Number(page) || 1), sz = Math.min(200, Math.max(1, Number(size) || 60));
  const result = {
    path: currentPath, crumbs, dirs,
    books: seriesHere ? [] : visible.slice((p - 1) * sz, p * sz),
    booksTotal: seriesHere ? 0 : visible.length,
    page: p, size: sz, total: rows.length,
    series: null,
    coverId: cv.coverId
  };
  if (seriesHere) {
    result.series = {
      name: currentPath.split('/').filter(Boolean).pop() || '这套书',
      path: currentPath, count: visible.length, coverId: cv.coverId,
      chapters: visible.map((r, i) => ({ ...r, chapter: i + 1, tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || []) }))
    };
  }
  return result;
}

module.exports = { build, isSeries, chapterNum, naturalSort, pickCover };
