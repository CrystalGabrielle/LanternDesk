/* 内网图书馆 —— 前端主逻辑（原生 JS，无构建步骤） */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  spark: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17l.7 1.8L21.5 19.5l-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>',
  shelf: '<path d="M4 4h16M4 10h16M4 16h16M4 20h16"/><path d="M7 4v4M16 10v4M10 16v4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  forward: '<path d="m9 18 6-6-6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  toc: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  ai: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 15h6M2 11v4M22 11v4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  zoomin: '<circle cx="10" cy="10" r="7"/><path d="m20 20-4-4M10 7v6M7 10h6"/>',
  zoomout: '<circle cx="10" cy="10" r="7"/><path d="m20 20-4-4M7 10h6"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
};
const icon = n => `<span class="ico"><svg viewBox="0 0 24 24">${ICONS[n] || ICONS.file}</svg></span>`;
function hydrate(root = document) {
  $$('[data-ico]', root).forEach(el => { el.innerHTML = icon(el.dataset.ico); });
}

/* ------------------------------ API ------------------------------ */
async function req(path, { method = 'GET', body, raw } = {}) {
  const opt = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    if (raw) { opt.body = body; opt.headers['Content-Type'] = 'application/octet-stream'; }
    else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  }
  const r = await fetch('/api' + path, opt);
  if (r.status === 401) {
    const j = await r.json().catch(() => ({}));
    if (j.needAuth) { $('#loginMask').classList.remove('hidden'); throw new Error('__AUTH__'); }
  }
  if (!r.ok) { const j = await r.json().catch(() => ({ error: r.statusText })); throw new Error(j.error || r.statusText); }
  return r.json();
}
let toastTimer;
function toast(msg, ms = 2800) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
const fmtSize = n => n > 1 << 30 ? (n / (1 << 30)).toFixed(1) + ' GB' : n > 1 << 20 ? (n / (1 << 20)).toFixed(1) + ' MB' : n > 1024 ? (n / 1024).toFixed(0) + ' KB' : n + ' B';
const fmtDate = t => t ? new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const KIND_LABEL = { ebook: '电子书', document: '文档', audio: '音频', video: '视频', image: '图片', archive: '压缩包', other: '其他' };

/* ------------------------------ 状态 ------------------------------ */
const S = {
  view: 'all', shelf: null, category: null, kind: null, subcategory: null, format: null,
  q: '', page: 1, size: 60, sort: 'recent', layout: 'grid', favorite: false,
  treeMode: localStorage.getItem('ll_mode') !== 'flat', path: '', tree: null, noDrill: false,
  state: {}, facets: {}, shelves: [], books: [], total: 0,
  theme: localStorage.getItem('ll_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
};
// 层级模式只在「书库」且没有搜索词时生效；搜索、继续阅读、书签用平铺更合适
const useTree = () => S.treeMode && !S.q && S.view === 'all' && !S.favorite;
// 目录位置写进 URL，刷新、换设备或分享链接都能回到同一层
try { const p = new URLSearchParams(location.search).get('path'); if (p) S.path = p; } catch {}
document.documentElement.dataset.theme = S.theme;

/* ------------------------------ 弹窗 ------------------------------ */
function modal({ title, body, foot, wide = false, onMount }) {
  closeModal();
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close>${icon('close')}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>`;
  mask.addEventListener('click', e => { if (e.target === mask || e.target.closest('[data-close]')) closeModal(); });
  $('#modalRoot').appendChild(mask);
  hydrate(mask);
  if (onMount) onMount(mask);
  return mask;
}
function closeModal() { $('#modalRoot').innerHTML = ''; $$('.ctx-menu').forEach(e => e.remove()); }
function confirmBox(title, text, onYes, danger = true) {
  const m = modal({ title, body: `<p style="font-size:13.5px;line-height:1.75;color:var(--text2);margin:0">${text}</p>`,
    foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-yes style="${danger ? 'background:var(--rose)' : ''}">确认</button>` });
  $('[data-yes]', m).onclick = async () => { try { await onYes(); closeModal(); } catch (e) { toast(e.message); } };
}
function ctxMenu(x, y, items) {
  $$('.ctx-menu').forEach(e => e.remove());
  const el = document.createElement('div');
  el.className = 'ctx-menu';
  el.innerHTML = items.map((it, i) => it.title
    ? `<div class="ctx-title">${esc(it.title)}</div>`
    : it.sep ? '<div style="height:1px;background:var(--border);margin:5px 0"></div>'
      : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon || 'file')}<span>${esc(it.label)}</span></button>`).join('');
  document.body.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.min(x, innerWidth - w - 10) + 'px';
  el.style.top = Math.min(y, innerHeight - h - 10) + 'px';
  el.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { const it = items[Number(b.dataset.i)]; el.remove(); it.fn && it.fn(); } };
  setTimeout(() => document.addEventListener('click', () => el.remove(), { once: true }), 0);
}

/* ------------------------------ 侧栏 ------------------------------ */
function renderShelves() {
  const box = $('#shelfList');
  box.innerHTML = S.shelves.map(s => `<div class="shelf-row ${S.shelf === s.id ? 'active' : ''}" data-id="${s.id}">
    <button class="shelf-main" data-open="${s.id}"><span class="shelf-dot" style="background:${esc(s.color)}"></span><span class="shelf-name">${esc(s.name)}</span><em>${s.count}</em></button>
    <span class="shelf-tools"><button class="mini-btn" data-edit="${s.id}" title="编辑">${icon('edit')}</button><button class="mini-btn" data-del="${s.id}" title="删除">${icon('trash')}</button></span>
  </div>`).join('') || '<div style="font-size:12px;color:var(--text3);padding:6px 10px">还没有书架</div>';
  hydrate(box);
  box.onclick = e => {
    const open = e.target.closest('[data-open]'), edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (open) { S.shelf = Number(open.dataset.open); S.view = 'all'; S.path = ''; S.page = 1; setViewVisual(); loadBooks(); closeSide(); }
    if (edit) shelfModal(S.shelves.find(x => x.id === Number(edit.dataset.edit)));
    if (del) {
      const s = S.shelves.find(x => x.id === Number(del.dataset.del));
      confirmBox('删除书架', `确定删除书架「${esc(s.name)}」吗？<br>书架里的图书不会受影响，仍保留在书库中。`, async () => {
        await req('/shelves/' + s.id, { method: 'DELETE' }); await refreshMeta(); toast('书架已删除');
      });
    }
  };
}
function renderFacets() {
  $('#catList').innerHTML = S.facets.categories.map(c =>
    `<button class="chip ${S.category === c.k ? 'active' : ''}" data-cat="${esc(c.k)}">${esc(c.k)}<small>${c.n}</small></button>`).join('');
  $('#kindList').innerHTML = S.facets.kinds.map(k =>
    `<button class="side-item ${S.kind === k.k ? 'active' : ''}" data-kind="${esc(k.k)}">${icon('folder')}<span>${KIND_LABEL[k.k] || k.k}</span><em>${k.n}</em></button>`).join('');
  hydrate($('#kindList'));
  $('#catList').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; S.category = S.category === b.dataset.cat ? null : b.dataset.cat; S.path = ''; S.page = 1; renderFacets(); renderFilters(); loadBooks(); };
  $('#kindList').onclick = e => { const b = e.target.closest('[data-kind]'); if (!b) return; S.kind = S.kind === b.dataset.kind ? null : b.dataset.kind; S.path = ''; S.page = 1; renderFacets(); renderFilters(); loadBooks(); };
}
function renderFilters() {
  const chips = [];
  if (S.q) chips.push(['q', '搜索：' + S.q, () => { S.q = ''; $('#searchInput').value = ''; }]);
  if (S.shelf) { const s = S.shelves.find(x => x.id === S.shelf); chips.push(['shelf', '书架：' + (s ? s.name : S.shelf), () => { S.shelf = null; }]); }
  if (S.category) chips.push(['category', '分类：' + S.category, () => { S.category = null; }]);
  if (S.subcategory) chips.push(['subcategory', '主题：' + S.subcategory, () => { S.subcategory = null; }]);
  if (S.kind) chips.push(['kind', '类型：' + (KIND_LABEL[S.kind] || S.kind), () => { S.kind = null; }]);
  if (S.format) chips.push(['format', '格式：' + S.format, () => { S.format = null; }]);
  const bar = $('#filterBar');
  bar.innerHTML = chips.map((c, i) => `<button class="filter-chip" data-i="${i}"><b>×</b>${esc(c[1])}</button>`).join('') +
    (chips.length > 1 ? `<button class="filter-chip" data-clear="1"><b>×</b>清除全部</button>` : '');
  bar.onclick = e => {
    if (e.target.closest('[data-clear]')) { S.q = ''; S.shelf = S.category = S.subcategory = S.kind = S.format = null; S.path = ''; $('#searchInput').value = ''; }
    else { const b = e.target.closest('[data-i]'); if (!b) return; chips[Number(b.dataset.i)][2](); }
    S.page = 1; renderFacets(); renderFilters(); loadBooks();
  };
}

/* ------------------------------ 封面 ------------------------------ */
// 服务端优先返回真实封面（现成封面图 / EPUB 内嵌 / 已生成的 PDF 首页），
// 没有则给排版式 SVG；可见的 PDF 卡片再由浏览器渲染首页并回传缓存，所有设备共享。
function coverSrc(b) {
  const id = b.coverId || b.id;
  return id ? '/api/cover/' + id
    : '/api/cover/folder?name=' + encodeURIComponent(b.title || '文件夹') + '&count=' + (b.count || 0);
}
function bindCovers(root) {
  $$('.cover-img', root).forEach(img => {
    const done = () => {
      const c = img.closest('.cover'); if (c) c.classList.add('has-img');
      // 封面加载完成即兜底排队，不单独依赖可见性观察器（部分浏览器/无头环境不触发）
      if (img.dataset.needsPdf) queuePdfCover({ id: Number(img.dataset.coverFor), size: Number(img.dataset.coverSize || 0) });
    };
    img.addEventListener('load', done);
    img.addEventListener('error', () => img.remove());
    if (img.complete && img.naturalWidth) done();
  });
}
const COVERQ = { list: [], busy: 0, seen: new Set(), io: null };
function watchPdfCovers(root) {
  if (COVERQ.io) { COVERQ.io.disconnect(); COVERQ.io = null; }
  const imgs = $$('img[data-needs-pdf]', root);
  if (!imgs.length || !('IntersectionObserver' in window)) return;
  COVERQ.io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      COVERQ.io.unobserve(e.target);
      queuePdfCover({ id: Number(e.target.dataset.coverFor), size: Number(e.target.dataset.coverSize || 0) }, true);
    }
  }, { rootMargin: '200px' });
  imgs.forEach(i => COVERQ.io.observe(i));
}
function queuePdfCover(b, front = false) {
  // 超大扫描版 PDF 不自动生成封面，避免拖慢浏览器
  if (!b || !b.id || COVERQ.seen.has(b.id) || b.size > 260 * 1024 * 1024) return;
  COVERQ.seen.add(b.id);
  if (front) COVERQ.list.unshift(b); else COVERQ.list.push(b);
  pumpCovers();
}
function pumpCovers() {
  while (COVERQ.busy < 2 && COVERQ.list.length) {
    const b = COVERQ.list.shift(); COVERQ.busy++;
    makePdfCover(b).finally(() => { COVERQ.busy--; pumpCovers(); });
  }
}
async function makePdfCover(b) {
  try {
    if (!window.pdfjsLib) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.js';
    // 启用 Range 请求，只取首页所需片段，几百 MB 的扫描件也不会整个下载
    const doc = await pdfjsLib.getDocument({ url: '/api/raw/' + b.id, rangeChunkSize: 65536,
      cMapUrl: '/vendor/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/standard_fonts/' }).promise;
    const pg = await doc.getPage(1);
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(1.5, 320 / Math.max(1, base.width));
    const vp = pg.getViewport({ scale });
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.floor(vp.width)); cv.height = Math.max(1, Math.floor(vp.height));
    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.74));
    try { await doc.destroy(); } catch {}
    if (!blob) return;
    const buf = new Uint8Array(await blob.arrayBuffer());
    const resp = await fetch('/api/cover/' + b.id, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream' }, body: buf });
    if (!resp.ok) return;
    const src = '/api/cover/' + b.id + '?v=' + Date.now();
    $$(`img[data-cover-for="${b.id}"], img[data-cover-id="${b.id}"]`).forEach(im => { im.src = src; });
  } catch (e) { /* 单本封面失败不影响其他书 */ }
}

/* ------------------------------ 书列表 ------------------------------ */
function bookCard(b, compact = false) {
  const pct = Math.round(b.percent || 0);
  const tags = (b.tags || []).slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  const isPdf = String(b.ext || '').toLowerCase() === 'pdf' && !b.covered;
  const pdfAttr = isPdf ? ` data-needs-pdf="1" data-cover-size="${b.size || 0}"` : '';
  return `<article class="book-card" data-id="${b.id}">
    <div class="cover k-${esc(b.kind)}">
      <img class="cover-img" src="${esc(coverSrc(b))}" alt="" loading="lazy" decoding="async" data-cover-for="${b.id}"${pdfAttr}>
      <div class="cover-title">${esc(b.title)}</div>
      <span class="cover-badge">${esc(b.format)}</span>
      ${['audio', 'video'].includes(b.kind) ? `<span class="cover-play">${icon('spark')}</span>` : ''}
    </div>
    <div class="book-info">
      <div class="book-title" title="${esc(b.title)}">${esc(b.title)}</div>
      <div class="book-meta"><span>${esc(b.category || '未分类')}</span><span>${fmtSize(b.size)}</span></div>
      ${!compact ? `<div class="book-tags">${tags}${b.marks ? `<span class="tag">书签 ${b.marks}</span>` : ''}</div>` : ''}
      ${pct > 0 && pct < 100 ? `<div class="progress-line"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
    </div>
    <button class="card-menu" data-menu="${b.id}" title="更多">${icon('more')}</button>
  </article>`;
}
function folderCard(d) {
  const src = d.coverId ? '/api/cover/' + d.coverId
    : '/api/cover/folder?name=' + encodeURIComponent(d.name) + '&count=' + d.count;
  const label = d.series ? `${d.direct} 话 · 合集` : `${d.count} 项`;
  return `<article class="book-card folder-card" data-path="${esc(d.path)}" title="${esc(d.path)}">
    <div class="cover k-folder">
      <img class="cover-img" src="${esc(src)}" alt="" loading="lazy" decoding="async" ${d.coverId ? `data-cover-id="${d.coverId}"` : ''}>
      <div class="cover-title">${esc(d.name)}</div>
      <span class="cover-badge">${d.series ? '套书' : '目录'}</span>
      <span class="folder-count">${icon('folder')} ${d.count}</span>
    </div>
    <div class="book-info">
      <div class="book-title" title="${esc(d.path)}">${esc(d.name)}</div>
      <div class="book-meta"><span>子目录</span><span>${esc(label)}</span></div>
    </div>
  </article>`;
}
function renderPager(total, size = S.size) {
  const el = $('#pager'), pages = Math.ceil(total / size), p = S.page;
  if (pages <= 1) { el.innerHTML = total ? `<span class="pager-info">共 ${total} 项</span>` : ''; return; }
  let nums = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - p) <= 2) nums.push(i);
  let last = 0, html = `<button class="page-btn" data-p="${p - 1}" ${p <= 1 ? 'disabled' : ''}>上一页</button>`;
  nums.forEach(n => { if (n - last > 1) html += `<span class="pager-info">…</span>`; html += `<button class="page-btn ${n === p ? 'active' : ''}" data-p="${n}">${n}</button>`; last = n; });
  html += `<span class="pager-info">共 ${total} 项 / ${pages} 页</span><button class="page-btn" data-p="${p + 1}" ${p >= pages ? 'disabled' : ''}>下一页</button>`;
  el.innerHTML = html;
  el.onclick = e => { const b = e.target.closest('[data-p]'); if (!b || b.disabled) return; S.page = Number(b.dataset.p); loadBooks(); $('#main').scrollTop = 0; window.scrollTo(0, 0); };
}
function renderBooks() {
  const area = $('#bookArea');
  area.className = 'book-area ' + S.layout;
  $('#crumbs').classList.add('hidden');
  $('#pager').innerHTML = '';
  if (!S.books.length) {
    area.innerHTML = `<div class="empty">${icon('bookmark')}<h3>这里还没有书</h3><p>试试切换筛选条件，或点击「同步」扫描资料目录</p></div>`;
    hydrate(area); return;
  }
  area.innerHTML = S.books.map(b => bookCard(b)).join('');
  hydrate(area); bindCovers(area); watchPdfCovers(area);
  renderPager(S.total);
}

/* ------------------------------ 目录层级视图 ------------------------------ */
function updateHead(tree) {
  const titles = { all: '全部藏书', reading: '继续阅读', marks: '我的书签', recent: '最近添加' };
  const shelf = S.shelves.find(x => x.id === S.shelf);
  const inTree = useTree();
  const crumb = inTree && tree && tree.path ? (tree.crumbs[tree.crumbs.length - 1] || {}).name : '';
  $('#pageTitle').textContent = crumb || (shelf ? shelf.name : (titles[S.view] || '全部藏书'));
  if (crumb && tree) {
    $('#pageDesc').textContent = tree.series
      ? `共 ${tree.series.count} 话 · 同一套书的分册按原目录顺序排列`
      : `${tree.dirs.length} 个子目录 · 本层 ${tree.booksTotal} 册 · 按原始文件夹层级整理`;
  } else {
    $('#pageDesc').textContent = shelf ? (shelf.description || '按书架浏览，可随时调整图书归属')
      : (S.view === 'reading' ? '跨设备同步的阅读进度'
        : S.view === 'marks' ? '所有书签，点击可直接跳到对应位置'
          : inTree ? `共 ${S.state.total || 0} 册 · 按原始文件夹层级整理，不同目录的同名分册不再混在一起`
            : `共 ${S.state.total || 0} 项资源 · 按智能分类整理`);
  }
  $('#modeToggle').style.display = S.view === 'all' ? '' : 'none';
  $('#modeFolders').classList.toggle('active', inTree);
  $('#modeFlat').classList.toggle('active', !inTree);
}
function renderCrumbs(d) {
  const box = $('#crumbs');
  if (!useTree()) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = d.crumbs.map((c, i) => {
    const last = i === d.crumbs.length - 1;
    return `${i ? '<span class="crumb-sep">›</span>' : ''}<button class="crumb ${last ? 'current' : ''}" data-path="${esc(c.path)}" ${last ? 'disabled' : ''}>${i === 0 ? icon('folder') : ''}${esc(c.name)}</button>`;
  }).join('') + (d.series ? `<span class="crumb-sep">›</span><span class="crumb-tag">共 ${d.series.count} 话</span>` : '')
    + (d.drilled ? `<span class="crumb-note">空目录层已自动展开</span>` : '');
  hydrate(box);
  box.onclick = e => {
    const b = e.target.closest('[data-path]'); if (!b || b.disabled) return;
    S.path = b.dataset.path; S.page = 1; S.noDrill = true; loadBooks();  // 点中间层时停在该层
  };
}
function renderTreeArea(d) {
  const area = $('#bookArea');
  area.className = 'tree-area';
  const grid = inner => `<div class="book-area ${S.layout} inner">${inner}</div>`;
  const parts = [];
  if (d.series) {
    const s = d.series;
    const src = s.coverId ? '/api/cover/' + s.coverId
      : '/api/cover/folder?name=' + encodeURIComponent(s.name) + '&count=' + s.count;
    parts.push(`<div class="series-head">
      <div class="series-cover"><img class="cover-img" src="${esc(src)}" alt="" loading="lazy" ${s.coverId ? `data-cover-id="${s.coverId}"` : ''}></div>
      <div class="series-meta"><h2>${esc(s.name)}</h2><p>共 ${s.count} 话 · 按文件夹内顺序排列，点击任意一话开始阅读</p>
      <span class="hint">原文件仍各自保存在原目录，这里只是按层级呈现；阅读进度会分别记录</span></div></div>`);
    if (s.chapters.length) parts.push(`<div class="section-label">分册 / 章节 · ${s.chapters.length}</div>` + grid(s.chapters.map(b => bookCard(b)).join('')));
  } else {
    if (d.dirs.length) parts.push(`<div class="section-label">文件夹 · ${d.dirs.length} 个</div>` + grid(d.dirs.map(folderCard).join('')));
    if (d.books.length) parts.push(`<div class="section-label">本层图书 · ${d.booksTotal} 册</div>` + grid(d.books.map(b => bookCard(b)).join('')));
  }
  if (!parts.length) parts.push(`<div class="empty">${icon('folder')}<h3>这一层还没有书</h3><p>返回上级目录，或切换「平铺」查看全部资源</p></div>`);
  area.innerHTML = parts.join('');
  hydrate(area); bindCovers(area); watchPdfCovers(area);
  renderPager(d.booksTotal);
}
function treeParams() {
  const p = new URLSearchParams({ page: S.page, size: S.size, sort: S.sort });
  if (S.q) p.set('q', S.q);
  if (S.shelf) p.set('shelf', S.shelf);
  if (S.category) p.set('category', S.category);
  if (S.subcategory) p.set('subcategory', S.subcategory);
  if (S.kind) p.set('kind', S.kind);
  if (S.format) p.set('format', S.format);
  if (S.view === 'reading') p.set('reading', '1');
  if (S.favorite) p.set('favorite', '1');
  return p;
}
async function loadTree() {
  const p = treeParams(); p.set('path', S.path);
  p.set('drill', S.noDrill ? '0' : '1'); S.noDrill = false;
  $('#bookArea').innerHTML = '<div class="loading"><span class="spin"></span>正在整理目录…</div>';
  try {
    const d = await req('/tree?' + p);
    if (d.path !== S.path) S.path = d.path;   // 自动展开单链目录后同步位置
    S.tree = d; S.total = d.total;
    S.books = [...(d.books || []), ...((d.series && d.series.chapters) || [])];
    try {
      const u = new URL(location.href);
      if (S.path) u.searchParams.set('path', S.path); else u.searchParams.delete('path');
      history.replaceState(null, '', u.pathname + (u.search || ''));
    } catch {}
    updateHead(d); renderCrumbs(d); renderTreeArea(d);
  } catch (e) { if (e.message !== '__AUTH__') $('#bookArea').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
async function loadFlat() {
  const p = treeParams();
  $('#bookArea').innerHTML = '<div class="loading"><span class="spin"></span>正在加载…</div>';
  try {
    const d = await req('/books?' + p);
    S.books = d.books; S.total = d.total; renderBooks();
  } catch (e) { if (e.message !== '__AUTH__') $('#bookArea').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
async function loadBooks() {
  updateHead(null);
  if (S.view === 'marks') return loadMarksView();
  if (useTree()) return loadTree();
  return loadFlat();
}
async function loadMarksView() {
  $('#bookArea').className = 'book-area list';
  $('#crumbs').classList.add('hidden');
  $('#bookArea').innerHTML = '<div class="loading"><span class="spin"></span>正在加载…</div>';
  const d = await req('/bookmarks');
  if (!d.bookmarks.length) { $('#bookArea').innerHTML = `<div class="empty">${icon('bookmark')}<h3>还没有书签</h3><p>阅读时点击顶部书签按钮即可添加</p></div>`; hydrate($('#bookArea')); return; }
  $('#bookArea').innerHTML = d.bookmarks.map(m => `<article class="book-card" data-book="${m.book_id}" data-loc='${esc(JSON.stringify(m.locator))}'>
    <div class="cover k-ebook"><img class="cover-img" src="/api/cover/${m.book_id}" alt="" loading="lazy" decoding="async"><div class="cover-title">书签</div><span class="cover-badge">MARK</span></div>
    <div class="book-info"><div class="book-title">${esc(m.label || m.book_title || '未命名书签')}</div>
    <div class="book-meta"><span>${esc(m.book_title || '')}</span><span>${fmtDate(m.created_at)}</span></div>
    ${m.note ? `<div class="book-meta">${esc(m.note)}</div>` : ''}</div>
    <button class="card-menu" data-delmark="${m.id}">${icon('trash')}</button></article>`).join('');
  hydrate($('#bookArea')); bindCovers($('#bookArea'));
  $('#pager').innerHTML = '';
}

/* ------------------------------ 交互 ------------------------------ */
function setViewVisual() {
  $$('.side-item[data-view]').forEach(b => {
    const v = b.dataset.view;
    const on = v === 'folders' ? (S.view === 'all' && S.treeMode && !S.shelf)
      : v === 'all' ? (S.view === 'all' && !S.treeMode && !S.shelf)
        : (S.view === v && !S.shelf);
    b.classList.toggle('active', on);
  });
  $$('.m-item[data-view]').forEach(b => {
    const v = b.dataset.view;
    const on = v === 'folders' ? ['all', 'reading', 'recent'].includes(S.view) : S.view === v;
    b.classList.toggle('active', on);
  });
  renderShelves();
}
function setMode(tree) {
  S.treeMode = tree; S.view = 'all'; S.path = ''; S.page = 1;
  localStorage.setItem('ll_mode', tree ? 'tree' : 'flat');
  setViewVisual(); renderFilters(); loadBooks();
}
function setView(v) {
  if (v === 'settings') return settingsModal();
  if (v === 'shelves') return ($('#sidebar').classList.add('open'), $('#sideMask').classList.add('show'));
  if (v === 'ai') {
    if (R.book) { openReader(R.book); toggleAI(true); }
    else toast('请先打开一本书，再使用阅读助手');
    return;
  }
  S.shelf = null; S.path = ''; S.page = 1;
  if (v === 'folders') { S.view = 'all'; S.treeMode = true; localStorage.setItem('ll_mode', 'tree'); }
  else if (v === 'all') { S.view = 'all'; S.treeMode = false; localStorage.setItem('ll_mode', 'flat'); }
  else S.view = v;
  setViewVisual(); renderFilters(); loadBooks(); closeSide();
}
function closeSide() { $('#sidebar').classList.remove('open'); $('#sideMask').classList.remove('show'); }
async function refreshMeta() {
  const [st, fc, sh] = await Promise.all([req('/state'), req('/facets'), req('/shelves')]);
  S.state = st; S.facets = fc; S.shelves = sh.shelves;
  $('#cntAll').textContent = st.total; $('#cntReading').textContent = st.reading; $('#cntMarks').textContent = st.marks;
  $('#scanInfo').innerHTML = `上次同步：${fmtDate(st.lastScanAt)}<br>共 ${st.total} 项 · ${st.shelves} 个书架<br>自动扫描每 ${st.intervalMin} 分钟`;
  renderFacets(); renderShelves(); setViewVisual();
}
async function boot() {
  try { await refreshMeta(); } catch (e) { if (e.message === '__AUTH__') return; console.error(e); toast('初始化失败：' + e.message); }
  renderFilters(); await loadBooks();
}

$('#btnMenu').onclick = () => { $('#sidebar').classList.toggle('open'); $('#sideMask').classList.toggle('show'); };
$('#sideMask').onclick = closeSide;
$('#brand').onclick = () => setView('all');
$$('.side-item[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
$$('.m-item[data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
let searchTimer;
$('#searchInput').addEventListener('input', e => {
  S.q = e.target.value.trim(); $('#btnSearchClear').style.display = S.q ? 'inline-flex' : 'none';
  // 搜索跨目录，自动切成平铺；清空搜索后回到层级视图
  clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.path = ''; S.page = 1; renderFilters(); loadBooks(); }, 320);
});
$('#btnSearchClear').onclick = () => { $('#searchInput').value = ''; S.q = ''; S.path = ''; S.page = 1; renderFilters(); loadBooks(); };
$('#sortSelect').onchange = e => { S.sort = e.target.value; S.page = 1; loadBooks(); };
$('#viewGrid').onclick = () => { S.layout = 'grid'; $('#viewGrid').classList.add('active'); $('#viewList').classList.remove('active'); loadBooks(); };
$('#viewList').onclick = () => { S.layout = 'list'; $('#viewList').classList.add('active'); $('#viewGrid').classList.remove('active'); loadBooks(); };
$('#modeFolders').onclick = () => setMode(true);
$('#modeFlat').onclick = () => setMode(false);
$('#btnTheme').onclick = () => {
  S.theme = S.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = S.theme;
  localStorage.setItem('ll_theme', S.theme); $('#btnTheme').innerHTML = icon(S.theme === 'dark' ? 'sun' : 'moon');
};
$('#btnScan').onclick = async () => {
  toast('正在扫描资料目录…');
  try { const r = await req('/scan', { method: 'POST' }); toast(`同步完成：新增 ${r.added}，更新 ${r.updated}，失效 ${r.missing}，共 ${r.total} 项`, 4200); await refreshMeta(); await loadBooks(); }
  catch (e) { toast('同步失败：' + e.message); }
};
$('#btnSettings').onclick = settingsModal;
$('#btnAddShelf').onclick = () => shelfModal(null);
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try { await req('/login', { method: 'POST', body: { pin: $('#loginPin').value } }); location.reload(); }
  catch (err) { $('#loginErr').textContent = err.message === '__AUTH__' ? '' : err.message; }
};
$('#searchIco').innerHTML = icon('search'); $('#btnSearchClear').innerHTML = icon('close');
$('#btnTheme').innerHTML = icon(S.theme === 'dark' ? 'sun' : 'moon');
$('#btnSettings').innerHTML = icon('settings'); $('#btnMenu').innerHTML = icon('menu');
$('#viewGrid').innerHTML = icon('grid'); $('#viewList').innerHTML = icon('list');
hydrate();

/* 卡片点击 / 菜单 */
$('#bookArea').addEventListener('click', async e => {
  const dm = e.target.closest('[data-delmark]');
  if (dm) { e.stopPropagation(); await req('/bookmarks/' + dm.dataset.delmark, { method: 'DELETE' }); toast('书签已删除'); return loadBooks(); }
  const menu = e.target.closest('[data-menu]');
  if (menu) {
    e.stopPropagation();
    const b = S.books.find(x => x.id === Number(menu.dataset.menu));
    if (!b) return;
    const r = menu.getBoundingClientRect();
    ctxMenu(r.left, r.bottom + 4, [
      { title: b.title.slice(0, 20) },
      { label: '打开阅读', icon: 'file', fn: () => openReader(b) },
      { label: '加入 / 移出书架', icon: 'shelf', fn: () => shelfPicker(b) },
      { label: '编辑资料', icon: 'edit', fn: () => bookEditModal(b) },
      { label: '下载原文件', icon: 'download', fn: () => location.href = '/api/download/' + b.id },
      { sep: true },
      { label: '移出图书馆（文件保留）', icon: 'trash', danger: true, fn: () => confirmBox('移出图书馆',
        `将《${esc(b.title)}》从图书馆中移除。<br><b>磁盘上的原文件不会被删除</b>，之后重新同步可恢复。`,
        async () => { await req('/books/' + b.id, { method: 'DELETE' }); toast('已移出，原文件保留'); await refreshMeta(); await loadBooks(); }) }
    ]);
    return;
  }
  const fold = e.target.closest('[data-path]');
  if (fold) { S.path = fold.dataset.path; S.page = 1; loadBooks(); $('#main').scrollTop = 0; window.scrollTo(0, 0); return; }
  const card = e.target.closest('[data-id]');
  if (card) { const b = S.books.find(x => x.id === Number(card.dataset.id)); if (b) openReader(b); return; }
  const mk = e.target.closest('[data-book]');
  if (mk) {
    try { const b = await req('/books/' + mk.dataset.book); openReader(b, JSON.parse(mk.dataset.loc || '{}')); } catch (err) { toast(err.message); }
  }
});

/* ------------------------------ 书架 / 编辑 ------------------------------ */
function shelfModal(s) {
  const colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444'];
  const m = modal({ title: s ? '编辑书架' : '新建书架',
    body: `<div class="form-row"><label>书架名称</label><input id="sfName" value="${esc(s ? s.name : '')}" placeholder="例如：今年要读完"></div>
      <div class="form-row"><label>简介（可选）</label><input id="sfDesc" value="${esc(s ? s.description : '')}" placeholder="这个书架放什么？"></div>
      <div class="form-row"><label>颜色</label><div class="preset-row" id="sfColors">${colors.map(c => `<button class="preset" data-c="${c}" style="width:30px;height:30px;border-radius:8px;background:${c};border:2px solid ${c === (s ? s.color : colors[0]) ? 'var(--text)' : 'transparent'}"></button>`).join('')}</div></div>`,
    foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
    onMount(mask) {
      let color = s ? s.color : colors[0];
      $('#sfColors', mask).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; $$('#sfColors .preset', mask).forEach(x => x.style.border = '2px solid transparent'); b.style.border = '2px solid var(--text)'; };
      $('[data-save]', mask).onclick = async () => {
        const name = $('#sfName', mask).value.trim();
        if (!name) return toast('请填写书架名称');
        try {
          if (s) await req('/shelves/' + s.id, { method: 'PATCH', body: { name, description: $('#sfDesc', mask).value, color } });
          else await req('/shelves', { method: 'POST', body: { name, description: $('#sfDesc', mask).value, color } });
          closeModal(); await refreshMeta(); toast('书架已保存');
        } catch (err) { toast(err.message); }
      };
    } });
}
function shelfPicker(b) {
  const chosen = new Set((b.shelves || []).map(s => s.id));
  const m = modal({ title: '书架归属 · ' + b.title.slice(0, 18),
    body: `<p style="font-size:12px;color:var(--text2);margin:0 0 12px">勾选该书要放入的书架。调整书架不会改变文件在磁盘上的位置。</p>
      <div id="sfPick">${S.shelves.map(s => `<label class="check-row"><input type="checkbox" value="${s.id}" ${chosen.has(s.id) ? 'checked' : ''}><span class="shelf-dot" style="background:${esc(s.color)};margin-top:5px"></span><span>${esc(s.name)}</span></label>`).join('') || '还没有书架，请先新建'}</div>`,
    foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存归属</button>`,
    onMount(mask) {
      $('[data-save]', mask).onclick = async () => {
        const ids = $$('#sfPick input:checked', mask).map(i => Number(i.value));
        try { await req('/books/' + b.id, { method: 'PATCH', body: { shelves: ids } }); closeModal(); toast('书架归属已更新'); await refreshMeta(); await loadBooks(); }
        catch (err) { toast(err.message); }
      };
    } });
}
function bookEditModal(b) {
  const m = modal({ title: '编辑图书资料',
    body: `<div class="form-row"><label>书名</label><input id="beTitle" value="${esc(b.title)}"></div>
      <div class="form-row"><label>作者</label><input id="beAuthor" value="${esc(b.author || '')}" placeholder="可留空"></div>
      <div class="form-row"><label>分类</label><input id="beCat" value="${esc(b.category || '')}"></div>
      <div class="form-row"><label>主题 / 子类</label><input id="beSub" value="${esc(b.subcategory || '')}"></div>
      <div class="form-row"><label>标签（逗号分隔）</label><input id="beTags" value="${esc((b.tags || []).join(', '))}"></div>
      <div class="form-row"><label>原文件位置</label><input value="${esc(b.path)}" disabled><div class="hint">只读，不可修改。网站不会移动或删除原始资料。</div></div>`,
    foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存</button>`,
    onMount(mask) {
      $('[data-save]', mask).onclick = async () => {
        try {
          await req('/books/' + b.id, { method: 'PATCH', body: { title: $('#beTitle', mask).value, author: $('#beAuthor', mask).value,
            category: $('#beCat', mask).value, subcategory: $('#beSub', mask).value,
            tags: $('#beTags', mask).value.split(/[,，]/).map(s => s.trim()).filter(Boolean) } });
          closeModal(); toast('资料已更新'); await refreshMeta(); await loadBooks();
        } catch (err) { toast(err.message); }
      };
    } });
}

/* ------------------------------ 导入 ------------------------------ */
function importModal() {
  const m = modal({ title: '从外部导入图书', wide: true,
    body: `<div class="import-zone" id="iz">${icon('upload')}<strong>点击选择，或把文件拖到这里</strong><span>支持 PDF / EPUB / TXT / MOBI / DOCX 及任意资料文件，可多选</span></div>
      <input type="file" id="fileInput" multiple class="hidden">
      <p class="hint" style="font-size:12px;color:var(--text2);line-height:1.8;margin:14px 0 0">导入后系统会按文件名与内容关键词<b>智能分类</b>，存放到资料目录的 <b>_导入图书/分类/主题/</b> 下，并自动加入索引与对应书架。同名文件不会被覆盖，原始文件始终保持完整。</p>
      <div class="import-list" id="impList"></div>`,
    foot: `<button class="btn" data-close>完成</button>` });
  const input = $('#fileInput', m), zone = $('#iz', m), list = $('#impList', m);
  zone.onclick = () => input.click();
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag'); };
  zone.ondragleave = () => zone.classList.remove('drag');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag'); upload(e.dataTransfer.files); };
  input.onchange = () => upload(input.files);
  async function upload(files) {
    for (const f of [...files]) {
      const row = document.createElement('div');
      row.className = 'import-row'; row.innerHTML = `<span>${esc(f.name)}</span><span>${fmtSize(f.size)}</span><span class="st">上传中…</span>`;
      list.prepend(row); const st = $('.st', row);
      try {
        const resp = await fetch('/api/import', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(f.name) }, body: f });
        if (resp.status === 401) { $('#loginMask').classList.remove('hidden'); throw new Error('需要登录'); }
        const j = await resp.json();
        if (!resp.ok) throw new Error(j.error || '上传失败');
        st.textContent = '已存入 ' + (j.category || '未分类'); st.className = 'st done';
        await refreshMeta(); await loadBooks();
      } catch (e) { st.textContent = e.message; st.className = 'st err'; }
    }
  }
}

/* ------------------------------ 设置 ------------------------------ */
function settingsModal() {
  const st = S.state || {}, ai = st.ai || {};
  const m = modal({ title: '设置', wide: true,
    body: `<div class="setting-block">
        <h4>AI 阅读助手</h4>
        <p>填入你自己的 AI 账户密钥，密钥只保存在这台 NAS 的数据库中，不会发往任何第三方（除你选择的服务商）。看书时可随时提问。</p>
        <div class="preset-row" id="aiPresets">
          <button class="preset ${ai.provider === 'deepseek' ? 'active' : ''}" data-p="deepseek">DeepSeek</button>
          <button class="preset ${ai.provider === 'doubao' ? 'active' : ''}" data-p="doubao">豆包 / 火山方舟</button>
          <button class="preset ${ai.provider === 'custom' ? 'active' : ''}" data-p="custom">自定义 OpenAI 兼容</button>
        </div>
        <div class="form-row"><label>API Base URL</label><input id="aiBase" value="${esc(ai.baseUrl || '')}"></div>
        <div class="form-row"><label>模型名称</label><input id="aiModelIn" value="${esc(ai.model || '')}" placeholder="deepseek-chat / doubao-pro-32k / ep-xxxx"></div>
        <div class="form-row"><label>API Key ${ai.hasKey ? `<span style="color:var(--green);font-weight:400">（已保存 ${esc(ai.keyHint)}，留空即不修改）</span>` : ''}</label>
          <input id="aiKey" type="password" placeholder="${ai.hasKey ? '留空保持原密钥' : 'sk-…'}" autocomplete="off">
          ${ai.hasKey ? '<label class="check-row"><input type="checkbox" id="aiClear"><span>清除已保存的密钥</span></label>' : ''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="aiTest">测试连接</button><button class="btn primary" id="aiSave">保存 AI 设置</button></div>
        <div class="hint" id="aiTestOut" style="font-size:12px;color:var(--text2);margin-top:8px"></div>
      </div>
      <div class="divider"></div>
      <div class="setting-block">
        <h4>自动扫描同步</h4>
        <p>每 ${st.intervalMin || 10} 分钟自动扫描「学习资料」目录，新增文件自动加入索引并智能分类；被移走的文件标记为失效（不会删除任何磁盘文件）。也可随时手动同步。</p>
        <div class="kv"><span>上次同步</span><b>${fmtDate(st.lastScanAt)}</b></div>
        <div class="kv"><span>已索引资源</span><b>${st.total || 0} 项</b></div>
        <div class="kv"><span>书架 / 书签</span><b>${st.shelves || 0} / ${st.marks || 0}</b></div>
      </div>
      <div class="divider"></div>
      <div class="setting-block">
        <h4>分类目录镜像（可选）</h4>
        <p>在 NAS 共享目录生成 <b>_图书馆分类/分类/主题/</b> 的整理视图。使用硬链接，<b>不占用额外磁盘空间、不移动也不删除原文件</b>；删除镜像里的条目同样不会影响原件。${st.mirrorBuiltAt ? `上次生成：${fmtDate(st.mirrorBuiltAt)}，已链接 ${st.mirrorCount} 项。` : ''}</p>
        <button class="btn" id="btnMirror">生成 / 更新分类镜像</button>
        <div class="hint" id="mirrorOut" style="font-size:12px;color:var(--text2);margin-top:8px"></div>
      </div>
      <div class="divider"></div>
      <div class="setting-block">
        <h4>访问口令</h4>
        <p>网站已限制为仅内网可访问。可再加一层口令，其他设备首次打开时需要输入一次。</p>
        <div class="form-row"><label>${st.authEnabled ? '输入新口令（留空并保存即关闭口令）' : '设置口令（留空则保持关闭）'}</label><input id="pinIn" type="password" placeholder="不少于 4 位"></div>
        <button class="btn" id="pinSave">保存口令</button>
      </div>
      <div class="divider"></div>
      <div class="setting-block" style="margin-bottom:0">
        <h4>安全说明</h4>
        <p>容器端口仅绑定 ${esc(location.hostname)} 的局域网地址，未配置任何外网映射、端口转发或穿透；服务端还会拒绝所有非私有网段的请求。原始资料目录以只读方式使用，网页只在「导入」「分类镜像」中新增文件，永不删除原有资料。AI 问答会主动外连你配置的服务商，其余功能均在内网完成。</p>
      </div>`,
    foot: `<button class="btn primary" data-close>完成</button>`,
    onMount(mask) {
      const presets = {
        deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
        doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k' },
        custom: { baseUrl: '', model: '' }
      };
      let provider = ai.provider || 'deepseek';
      $('#aiPresets', mask).onclick = e => {
        const b = e.target.closest('[data-p]'); if (!b) return;
        provider = b.dataset.p; $$('#aiPresets .preset', mask).forEach(x => x.classList.toggle('active', x === b));
        const p = presets[provider]; $('#aiBase', mask).value = p.baseUrl; $('#aiModelIn', mask).value = p.model;
      };
      const payload = () => ({ provider, baseUrl: $('#aiBase', mask).value.trim(), model: $('#aiModelIn', mask).value.trim(),
        apiKey: $('#aiKey', mask).value, clearKey: $('#aiClear', mask) ? $('#aiClear', mask).checked : false, enabled: true });
      $('#aiSave', mask).onclick = async () => {
        try { await req('/settings/ai', { method: 'PUT', body: payload() }); S.state.ai = await req('/settings/ai'); toast('AI 设置已保存'); $('#aiModel').textContent = S.state.ai.model || ''; }
        catch (e) { toast(e.message); }
      };
      $('#aiTest', mask).onclick = async () => {
        const out = $('#aiTestOut', mask); out.textContent = '正在测试…';
        try { await req('/settings/ai', { method: 'PUT', body: payload() }); const r = await req('/ai/test', { method: 'POST', body: {} }); out.textContent = '连接成功，模型：' + r.model; out.style.color = 'var(--green)'; S.state.ai = await req('/settings/ai'); }
        catch (e) { out.textContent = e.message; out.style.color = 'var(--rose)'; }
      };
      $('#btnMirror', mask).onclick = async () => {
        const out = $('#mirrorOut', mask); out.textContent = '正在生成，请稍候…';
        try { const r = await req('/organize/materialize', { method: 'POST', body: {} }); out.textContent = `完成：新链接 ${r.linked} 项，已存在 ${r.skipped} 项，失败 ${r.failed} 项。目录：${r.root}`; toast('分类镜像已生成'); }
        catch (e) { out.textContent = e.message; }
      };
      $('#pinSave', mask).onclick = async () => {
        try { await req('/settings/pin', { method: 'PUT', body: { pin: $('#pinIn', mask).value } }); toast('口令设置已保存'); setTimeout(() => location.reload(), 700); }
        catch (e) { toast(e.message); }
      };
    } });
}

/* ============================== 阅读器 ============================== */
const R = { book: null, mode: null, pdf: {}, epub: {}, text: {}, progress: {}, ctxText: '',
  history: [], aiOpen: false, panel: null, lastWrite: 0, saveTimer: null, serverUpdated: 0, zoom: 1 };
const stage = () => $('#rStage');
const setLoc = (loc, pct) => {
  $('#rLoc').textContent = loc; $('#rPct').textContent = Math.round(pct) + '%';
  $('#rProgress').value = Math.round(pct * 10);
};
function saveProgress(pct, locator, immediate = false) {
  pct = Math.max(0, Math.min(100, pct));
  R.progress = { percent: pct, locator };
  const doIt = async () => {
    try { R.lastWrite = Date.now(); await req('/progress/' + R.book.id, { method: 'PUT', body: { locator, percent: pct, device: navigator.userAgent.slice(0, 60) } }); R.serverUpdated = Date.now(); }
    catch (e) { console.warn(e); }
  };
  clearTimeout(R.saveTimer);
  if (immediate) return doIt();
  R.saveTimer = setTimeout(doIt, 900);
}
async function openReader(book, jumpLocator) {
  R.book = book; R.history = []; R.ctxText = ''; R.zoom = 1;
  $('#reader').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  $('#rTitle').textContent = book.title;
  $('#rContent').scrollTop = 0;
  stage().innerHTML = '<div class="loading"><span class="spin"></span>正在打开…</div>';
  $('#rPanel').classList.add('hidden'); $('#aiPanel').classList.add('hidden');
  const ext = (book.ext || '').toLowerCase();
  if (ext === 'pdf') R.mode = 'pdf';
  else if (ext === 'epub') R.mode = 'epub';
  else if (['mht', 'htm', 'html'].includes(ext)) R.mode = 'html';
  else if (['txt', 'md', 'csv', 'mobi', 'azw', 'azw3', 'prc'].includes(ext)) R.mode = 'text';
  else if (['docx', 'pptx'].includes(ext)) R.mode = 'docx';
  else if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) R.mode = 'audio';
  else if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) R.mode = 'video';
  else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ext)) R.mode = 'image';
  else R.mode = 'fallback';
  try {
    const p = await req('/progress/' + book.id);
    R.progress = p; R.serverUpdated = p.updated_at || 0;
    await loadReaderContent(jumpLocator || (() => { try { return JSON.parse(p.locator || '{}'); } catch { return {}; } })());
    startSyncWatch();
  } catch (e) { if (e.message !== '__AUTH__') toast('打开失败：' + e.message); }
}
function closeReader() {
  if (R.book) saveProgress(R.progress.percent || 0, R.progress.locator || {}, true);
  $('#reader').classList.add('hidden'); document.body.style.overflow = '';
  clearInterval(R.watchTimer); R.book = null; closeModal();
}
async function loadReaderContent(loc) {
  const b = R.book, url = '/api/raw/' + b.id;
  if (R.mode === 'pdf') return loadPdf(loc);
  if (R.mode === 'epub') return loadEpub(loc);
  if (R.mode === 'text' || R.mode === 'html') return loadText(loc, R.mode === 'html');
  if (R.mode === 'docx') return loadDocx(loc);
  if (R.mode === 'audio' || R.mode === 'video') return loadMedia(loc);
  if (R.mode === 'image') {
    stage().innerHTML = `<img src="${url}" style="max-width:100%;border-radius:10px;box-shadow:var(--shadow-lg)" alt="${esc(b.title)}">`;
    setLoc('图片', 100); saveProgress(100, { type: 'image' }); return;
  }
  stage().innerHTML = `<div class="r-fallback">${icon('file')}<h3>${esc(b.format)} 暂不支持在线预览</h3>
    <p>该文件为 ${esc(KIND_LABEL[b.kind] || b.kind)} 格式（${fmtSize(b.size)}）。浏览器无法直接渲染，可下载后用本地应用打开。原文件始终保留在 NAS 上。</p>
    <button class="btn primary" id="fbDl">下载原文件</button></div>`;
  hydrate(stage()); $('#fbDl').onclick = () => location.href = '/api/download/' + b.id;
  setLoc('—', 0); saveProgress(0, { type: 'fallback' });
}

/* --- PDF --- */
async function loadPdf(loc) {
  if (!window.pdfjsLib) return fallback('PDF 组件未加载');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.js';
  try {
    const data = await (await fetch('/api/raw/' + R.book.id)).arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data, disableRange: true, disableStream: true,
      cMapUrl: '/vendor/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/standard_fonts/' }).promise;
    R.pdf = { doc, pages: doc.numPages, page: Math.min(Math.max(1, Number(loc.page || 1)), doc.numPages), zoom: 1 };
    await renderPdf();
  } catch (e) { fallback('PDF 打开失败：' + e.message); }
}
async function renderPdf() {
  const { doc, page: n, pages, zoom } = R.pdf;
  const pg = await doc.getPage(n);
  const base = pg.getViewport({ scale: 1 });
  const avail = Math.max(320, $('#rStage').clientWidth || 760);
  const scale = Math.min(2.2, (avail - 24) / base.width) * zoom;
  const vp = pg.getViewport({ scale });
  const cv = document.createElement('canvas');
  cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
  const ctx = cv.getContext('2d');
  await pg.render({ canvasContext: ctx, viewport: vp }).promise;
  stage().innerHTML = ''; stage().appendChild(cv);
  try { const tc = await pg.getTextContent(); R.ctxText = tc.items.map(i => i.str).join(' ').slice(0, 6000); } catch {}
  const pct = pages ? (n / pages) * 100 : 0;
  setLoc(`${n} / ${pages}`, pct);
  saveProgress(pct, { type: 'pdf', page: n });
  updateCtxHint();
}
function pdfGo(n) { if (!R.pdf.doc) return; R.pdf.page = Math.min(Math.max(1, n), R.pdf.pages); renderPdf(); $('#rContent').scrollTop = 0; }

/* --- EPUB --- */
function normPath(baseHref, rel) {
  const dir = baseHref.includes('/') ? baseHref.slice(0, baseHref.lastIndexOf('/') + 1) : '';
  const parts = (dir + rel).split('/'); const out = [];
  for (const p of parts) { if (p === '.' || p === '') continue; if (p === '..') out.pop(); else out.push(p); }
  return out.join('/');
}
async function loadEpub(loc) {
  if (!window.JSZip) return fallback('EPUB 组件未加载');
  try {
    const buf = await (await fetch('/api/raw/' + R.book.id)).arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const cfile = zip.file('META-INF/container.xml');
    if (!cfile) return fallback('不是有效的 EPUB 文件');
    const container = await cfile.async('string');
    const mm = /full-path="([^"]+)"/.exec(container);
    if (!mm) return fallback('EPUB 容器信息缺失');
    const opfPath = mm[1], opf = await zip.file(opfPath).async('string');
    const P = new DOMParser();
    const x = P.parseFromString(opf, 'application/xml');
    const manifest = {};
    x.querySelectorAll('manifest > item').forEach(it => manifest[it.getAttribute('id')] = { href: it.getAttribute('href'), type: it.getAttribute('media-type') });
    const spine = [];
    x.querySelectorAll('spine > itemref').forEach(it => { const m = manifest[it.getAttribute('idref')]; if (m && m.href) spine.push(m.href); });
    if (!spine.length) return fallback('EPUB 没有可阅读章节');
    let tocTitles = [];
    const navItem = Object.values(manifest).find(m => (m.type || '').includes('xhtml') && /nav|toc/i.test(m.href));
    const ncxItem = Object.values(manifest).find(m => (m.type || '').includes('ncx'));
    try {
      if (navItem) { const nav = P.parseFromString(await zip.file(normPath(opfPath, navItem.href)).async('string'), 'text/html'); tocTitles = [...nav.querySelectorAll('nav a')].map(a => a.textContent.trim()); }
      else if (ncxItem) { const ncx = P.parseFromString(await zip.file(normPath(opfPath, ncxItem.href)).async('string'), 'application/xml'); tocTitles = [...ncx.querySelectorAll('navLabel text')].map(t => t.textContent.trim()); }
    } catch {}
    R.epub = { zip, opfPath, spine, tocTitles, idx: Math.min(Math.max(0, Number(loc.idx || 0)), spine.length - 1) };
    await renderEpub();
  } catch (e) { fallback('EPUB 打开失败：' + e.message); }
}
async function renderEpub() {
  const { zip, opfPath, spine, idx } = R.epub;
  const href = normPath(opfPath, spine[idx]);
  const file = zip.file(href) || zip.file(decodeURIComponent(href));
  if (!file) return fallback('章节文件缺失：' + href);
  let html = await file.async('string');
  const P = new DOMParser(); const d = P.parseFromString(html, 'text/html');
  d.querySelectorAll('script,iframe,object,embed').forEach(n => n.remove());
  const imgs = [...d.querySelectorAll('img')];
  for (const im of imgs) {
    const src = im.getAttribute('src'); if (!src || src.startsWith('data:')) continue;
    const f = zip.file(normPath(href, src.split('#')[0]));
    if (f) { const ext = src.split('.').pop().split('#')[0].toLowerCase(); const mime = ['png', 'gif', 'webp', 'svg', 'bmp'].includes(ext) ? 'image/' + (ext === 'svg' ? 'svg+xml' : ext) : 'image/jpeg'; im.src = 'data:' + mime + ';base64,' + await f.async('base64'); }
  }
  R.ctxText = (d.body.textContent || '').replace(/\s+/g, ' ').slice(0, 6000);
  const css = `body{font:16px/1.9 -apple-system,"PingFang SC","Microsoft YaHei",serif;padding:24px 28px;color:#23283a;background:#fff;max-width:100%}img{max-width:100%;height:auto}h1,h2,h3{line-height:1.4}p{margin:.7em 0}a{color:#5b5bd6}`;
  const frame = document.createElement('iframe');
  frame.style.minHeight = '70vh'; frame.setAttribute('sandbox', 'allow-same-origin');
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${css}</style></head><body>${d.body.innerHTML}</body></html>`;
  stage().innerHTML = ''; stage().appendChild(frame);
  const pct = (idx / spine.length) * 100;
  setLoc(`${idx + 1} / ${spine.length} 章`, pct);
  saveProgress(pct, { type: 'epub', idx });
  updateCtxHint(); highlightToc();
}
function epubGo(i) { if (!R.epub.spine) return; R.epub.idx = Math.min(Math.max(0, i), R.epub.spine.length - 1); renderEpub(); $('#rContent').scrollTop = 0; }

/* --- 纯文本 / HTML / DOCX --- */
function splitText(t, size = 2200) {
  const chunks = []; let i = 0;
  while (i < t.length) { let end = Math.min(i + size, t.length); if (end < t.length) { const br = t.lastIndexOf('\n', end); if (br > i + size * .55) end = br; } chunks.push(t.slice(i, end)); i = end; }
  return chunks.length ? chunks : [''];
}
async function loadText(loc, asHtml) {
  try {
    const t = await (await fetch('/api/text/' + R.book.id)).text();
    if (!t.trim()) return fallback('文件内容为空或无法提取文本');
    if (asHtml) {
      stage().innerHTML = `<div class="text-page html">${t}</div>`;
      R.ctxText = t.replace(/<[^>]+>/g, ' ').slice(0, 6000);
      setLoc('全文', 100); saveProgress(100, { type: 'html' }); updateCtxHint(); return;
    }
    R.text = { chunks: splitText(t), idx: Math.min(Math.max(0, Number(loc.idx || 0)), splitText(t).length - 1) };
    renderText();
  } catch (e) { fallback('读取失败：' + e.message); }
}
function renderText() {
  const { chunks, idx } = R.text;
  stage().innerHTML = `<div class="text-page">${esc(chunks[idx] || '')}</div>`;
  R.ctxText = (chunks[idx] || '').slice(0, 6000);
  const pct = chunks.length ? (idx / chunks.length) * 100 : 100;
  setLoc(`${idx + 1} / ${chunks.length} 页`, pct);
  saveProgress(pct, { type: 'text', idx });
  updateCtxHint();
}
function textGo(i) { const n = R.text.chunks.length; R.text.idx = Math.min(Math.max(0, i), n - 1); renderText(); $('#rContent').scrollTop = 0; }
async function loadDocx(loc) {
  if (!window.JSZip) return fallback('文档组件未加载');
  try {
    const buf = await (await fetch('/api/raw/' + R.book.id)).arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const f = zip.file('word/document.xml') || zip.file('ppt/slides/slide1.xml');
    if (!f) return fallback('无法解析该文档');
    const xml = await f.async('string');
    const d = new DOMParser().parseFromString(xml, 'application/xml');
    let text = '';
    d.querySelectorAll('w\\:p, p, a\\:p').forEach(p => { text += (p.textContent || '') + '\n\n'; });
    if (!text.trim()) text = (d.documentElement.textContent || '').replace(/(.{80})/g, '$1\n');
    R.text = { chunks: splitText(text), idx: Math.min(Number(loc.idx || 0), splitText(text).length - 1) };
    renderText();
  } catch (e) { fallback('文档解析失败：' + e.message); }
}
function loadMedia(loc) {
  const tag = R.mode === 'audio' ? 'audio' : 'video';
  stage().innerHTML = `<${tag} class="r-media" id="rMedia" controls preload="metadata" src="/api/raw/${R.book.id}" ${tag === 'video' ? 'playsinline style="max-height:72vh"' : ''}></${tag}>
    <p style="color:var(--text2);font-size:12px;margin-top:12px">${R.mode === 'video' ? '浏览器可播放 MP4/WebM/MOV；RMVB、RM、FLV 等格式请下载后用本地播放器打开。' : '播放进度会自动保存，换设备继续收听。'}</p>`;
  const el = $('#rMedia');
  el.addEventListener('loadedmetadata', () => { if (loc.time && el.duration) el.currentTime = loc.time; });
  el.addEventListener('timeupdate', () => { if (el.duration) { const p = el.currentTime / el.duration * 100; setLoc(fmtTime(el.currentTime) + ' / ' + fmtTime(el.duration), p); saveProgress(p, { type: 'media', time: el.currentTime }); } });
  R.ctxText = '当前资源：' + R.book.title;
  setLoc('准备播放', 0);
}
const fmtTime = s => { s = Math.floor(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function fallback(msg) {
  stage().innerHTML = `<div class="r-fallback">${icon('info')}<h3>无法在线阅读</h3><p>${esc(msg)}</p><button class="btn primary" id="fbDl">下载原文件</button></div>`;
  hydrate(stage()); $('#fbDl').onclick = () => location.href = '/api/download/' + R.book.id;
  setLoc('—', 0);
}

/* --- 进度同步 watcher --- */
function startSyncWatch() {
  clearInterval(R.watchTimer);
  R.watchTimer = setInterval(async () => {
    if (!R.book || document.hidden) return;
    try {
      const p = await req('/progress/' + R.book.id);
      if (p.updated_at && p.updated_at > R.serverUpdated + 1500 && p.updated_at > R.lastWrite + 1500) {
        R.serverUpdated = p.updated_at;
        confirmBox('进度已更新', `检测到其他设备把《${esc(R.book.title)}》读到了 ${Math.round(p.percent)}%，是否跳转到该位置？`, async () => {
          let loc = {}; try { loc = JSON.parse(p.locator || '{}'); } catch {}
          if (loc.type === 'pdf' && loc.page) pdfGo(loc.page);
          else if (loc.type === 'epub') epubGo(loc.idx || 0);
          else if (loc.type === 'text') textGo(loc.idx || 0);
        }, false);
      }
    } catch {}
  }, 30000);
}

/* --- 阅读器工具条 --- */
function gotoLocator(loc) {
  if (!loc) return;
  if (loc.type === 'pdf' && loc.page) pdfGo(loc.page);
  else if (loc.type === 'epub') epubGo(loc.idx || 0);
  else if (loc.type === 'text') textGo(loc.idx || 0);
  else if (loc.type === 'media' && $('#rMedia') && loc.time) $('#rMedia').currentTime = loc.time;
}
function readerPrev() {
  if (R.mode === 'pdf') pdfGo(R.pdf.page - 1);
  else if (R.mode === 'epub') epubGo(R.epub.idx - 1);
  else if (R.text.chunks) textGo(R.text.idx - 1);
}
function readerNext() {
  if (R.mode === 'pdf') pdfGo(R.pdf.page + 1);
  else if (R.mode === 'epub') epubGo(R.epub.idx + 1);
  else if (R.text.chunks) textGo(R.text.idx + 1);
}
function showPanel(kind) {
  const p = $('#rPanel'), body = $('#rpBody');
  R.panel = kind; p.classList.remove('hidden');
  $('#aiPanel').classList.add('hidden'); R.aiOpen = false;
  $('#rpTitle').textContent = kind === 'toc' ? '目录' : '书签';
  if (kind === 'toc') {
    let items = [];
    if (R.mode === 'pdf') items = Array.from({ length: R.pdf.pages || 0 }, (_, i) => ({ n: i + 1, label: `第 ${i + 1} 页`, active: R.pdf.page === i + 1 }));
    else if (R.mode === 'epub') items = R.epub.spine.map((h, i) => ({ n: i, label: (R.epub.tocTitles[i] || `第 ${i + 1} 节`), active: R.epub.idx === i }));
    else if (R.text.chunks) items = R.text.chunks.map((_, i) => ({ n: i, label: `第 ${i + 1} 页`, active: R.text.idx === i }));
    body.innerHTML = items.map(it => `<button class="toc-item ${it.active ? 'active' : ''}" data-n="${it.n}">${esc(it.label)}</button>`).join('') || '<div style="color:var(--text3);font-size:12px;padding:12px">该格式没有目录</div>';
    body.onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; const n = Number(b.dataset.n);
      if (R.mode === 'pdf') pdfGo(n); else if (R.mode === 'epub') epubGo(n); else textGo(n); showPanel('toc'); };
  } else {
    req('/bookmarks?bookId=' + R.book.id).then(d => {
      body.innerHTML = d.bookmarks.map(m => `<div class="bm-item" data-id="${m.id}" data-loc='${esc(JSON.stringify(m.locator))}'>
        ${esc(m.label || '书签')}<small>${esc(m.note || '')} · ${fmtDate(m.created_at)}</small>
        <button class="bm-del" data-del="${m.id}">${icon('close')}</button></div>`).join('') || '<div style="color:var(--text3);font-size:12px;padding:12px">还没有书签</div>';
      hydrate(body);
      body.onclick = e => {
        const del = e.target.closest('[data-del]');
        if (del) { req('/bookmarks/' + del.dataset.del, { method: 'DELETE' }).then(() => showPanel('marks')); return; }
        const it = e.target.closest('[data-loc]'); if (it) gotoLocator(JSON.parse(it.dataset.loc));
      };
    });
  }
}
function highlightToc() { if (R.panel === 'toc') $$('.toc-item', $('#rpBody')).forEach(el => el.classList.remove('active')); }
function addBookmark() {
  const labelMap = { pdf: `第 ${R.pdf.page || 1} 页`, epub: `第 ${(R.epub.idx || 0) + 1} 章`, text: `第 ${(R.text.idx || 0) + 1} 页` };
  const m = modal({ title: '添加书签',
    body: `<div class="form-row"><label>书签名称</label><input id="bmLabel" value="${esc(labelMap[R.mode] || '书签')}"></div>
      <div class="form-row"><label>备注（可选）</label><textarea id="bmNote" placeholder="记录一下想法…"></textarea></div>`,
    foot: `<button class="btn" data-close>取消</button><button class="btn primary" data-save>保存书签</button>`,
    onMount(mask) { $('[data-save]', mask).onclick = async () => {
      try { await req('/bookmarks', { method: 'POST', body: { bookId: R.book.id, label: $('#bmLabel', mask).value, note: $('#bmNote', mask).value, locator: R.progress.locator || {} } });
        closeModal(); toast('书签已保存'); showPanel('marks'); } catch (e) { toast(e.message); }
    }; } });
}
$('#rBack').onclick = closeReader;
$('#rToc').onclick = () => R.panel === 'toc' ? ($('#rPanel').classList.add('hidden'), R.panel = null) : showPanel('toc');
$('#rMark').onclick = addBookmark;
$('#rAI').onclick = () => toggleAI(!R.aiOpen);
$('#rDownload').onclick = () => { if (R.book) location.href = '/api/download/' + R.book.id; };
$('#rpClose').onclick = () => { $('#rPanel').classList.add('hidden'); R.panel = null; };
$('#rPrev').onclick = readerPrev; $('#rNext').onclick = readerNext;
const applyTextZoom = () => { const t = $('.text-page', stage()); if (t) t.style.fontSize = (14 + R.zoom * 2) + 'px'; };
$('#rZoomIn').onclick = () => { R.zoom = Math.min(2, R.zoom + .15); if (R.mode === 'pdf') { R.pdf.zoom = R.zoom; renderPdf(); } else applyTextZoom(); };
$('#rZoomOut').onclick = () => { R.zoom = Math.max(.6, R.zoom - .15); if (R.mode === 'pdf') { R.pdf.zoom = R.zoom; renderPdf(); } };
$('#rProgress').oninput = e => {
  const pct = Number(e.target.value) / 10;
  if (R.mode === 'pdf') pdfGo(Math.max(1, Math.round(R.pdf.pages * pct / 100)));
  else if (R.mode === 'epub') epubGo(Math.round(R.epub.spine.length * pct / 100));
  else if (R.text.chunks) textGo(Math.round(R.text.chunks.length * pct / 100));
};
$('#rBack').innerHTML = icon('back'); $('#rToc').innerHTML = icon('toc'); $('#rMark').innerHTML = icon('bookmark');
$('#rAI').innerHTML = icon('ai'); $('#rDownload').innerHTML = icon('download'); $('#rpClose').innerHTML = icon('close');
$('#rPrev').innerHTML = icon('left'); $('#rNext').innerHTML = icon('right');
$('#rZoomIn').innerHTML = icon('zoomin'); $('#rZoomOut').innerHTML = icon('zoomout');
$('#aiClose').innerHTML = icon('close'); $('#aiSend').innerHTML = icon('send') + ' 发送';
document.addEventListener('keydown', e => {
  if (!$('#reader').classList.contains('hidden')) {
    if (e.key === 'Escape') { if (!$('#modalRoot').innerHTML) closeReader(); else closeModal(); }
    if (e.key === 'ArrowLeft') readerPrev();
    if (e.key === 'ArrowRight') readerNext();
  }
});

/* ------------------------------ AI 面板 ------------------------------ */
function updateCtxHint() {
  const sel = getSelectionText();
  const txt = sel || R.ctxText;
  $('#aiCtx').textContent = txt ? (sel ? '已选中文本，将作为提问上下文' : '上下文：' + txt.slice(0, 90) + '…') : '当前阅读内容将自动作为提问上下文';
  $('#aiCtx').dataset.text = txt || '';
}
function getSelectionText() {
  let s = (window.getSelection() || '').toString().trim();
  if (!s) { const f = $('iframe', stage()); try { s = (f.contentWindow.getSelection() || '').toString().trim(); } catch {} }
  return s.slice(0, 6000);
}
async function toggleAI(on) {
  R.aiOpen = on;
  $('#aiPanel').classList.toggle('hidden', !on);
  if (on) { $('#rPanel').classList.add('hidden'); R.panel = null; $('#aiModel').textContent = (S.state.ai || {}).model || ''; await loadAIHistory(); }
}
$('#aiClose').onclick = () => toggleAI(false);
$('#aiClear').onclick = async () => { await req('/ai/history?bookId=' + R.book.id, { method: 'DELETE' }); R.history = []; $('#aiMessages').innerHTML = ''; loadAIHistory(); };
$('#aiQuestion').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendAI(); } });
$('#aiSend').onclick = sendAI;
$('#aiQuick').innerHTML = ['总结当前内容', '解释这段', '翻译成英文', '提取要点', '延伸阅读'].map(q => `<button class="quick-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('');
$('#aiQuick').onclick = e => { const b = e.target.closest('[data-q]'); if (!b) return; $('#aiQuestion').value = b.dataset.q; sendAI(); };
function pushMsg(role, text) {
  const box = $('#aiMessages');
  const el = document.createElement('div'); el.className = 'msg ' + (role === 'user' ? 'user' : 'ai'); el.textContent = text;
  box.appendChild(el); box.scrollTop = box.scrollHeight; return el;
}
async function loadAIHistory() {
  if (!R.book) return;
  try {
    const d = await req('/ai/history?bookId=' + R.book.id);
    R.history = d.messages.map(m => ({ role: m.role, content: m.content }));
    const box = $('#aiMessages'); box.innerHTML = '';
    if (!d.messages.length) { const t = document.createElement('div'); t.className = 'msg tip'; t.textContent = '边读边问：可以解释原文、总结章节、翻译或做延伸提问'; box.appendChild(t); }
    d.messages.slice(-20).forEach(m => pushMsg(m.role, m.content));
    if (!(S.state.ai || {}).hasKey) { const t = document.createElement('div'); t.className = 'msg tip'; t.textContent = '尚未配置 AI 账户，请到「设置」填写 API Key'; box.appendChild(t); }
  } catch (e) { console.warn(e); }
}
async function sendAI() {
  const q = $('#aiQuestion').value.trim(); if (!q || !R.book) return;
  $('#aiQuestion').value = '';
  const ctx = getSelectionText() || ($('#aiCtx').dataset.text || R.ctxText || '');
  pushMsg('user', q);
  const el = pushMsg('ai', '思考中…');
  let answer = '';
  try {
    const resp = await fetch('/api/ai/chat', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: R.book.id, question: q, context: ctx, history: R.history.slice(-8) }) });
    if (!resp.ok) { const j = await resp.json().catch(() => ({})); throw new Error(j.error || ('HTTP ' + resp.status)); }
    const reader = resp.body.getReader(), dec = new TextDecoder('utf-8'); let buf = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
        try { const j = JSON.parse(d); const c = j.choices?.[0]?.delta?.content || ''; if (c) { answer += c; el.textContent = answer; $('#aiMessages').scrollTop = $('#aiMessages').scrollHeight; } } catch {}
      }
    }
    if (!answer) el.textContent = '（未收到回复内容，请检查模型名称或 API Key）';
    R.history.push({ role: 'user', content: q }, { role: 'assistant', content: answer });
  } catch (e) { el.textContent = '出错了：' + e.message; }
}
boot();
