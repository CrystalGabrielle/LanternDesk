/* Office 在线预览引擎（Word / PowerPoint / Excel）
 * 纯原生 JS，仅依赖页面已内置的 JSZip；不联网、不上传文件内容到任何第三方。
 * 解析 OOXML（docx / pptx / xlsx）的 XML，输出安全的 HTML 字符串。
 * 旧版二进制 doc / ppt / xls 由服务端尽力提取文本后走纯文本阅读器。
 */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const kids = (n, name) => n ? [...n.childNodes].filter(c => c.nodeType === 1 && c.nodeName === name) : [];
  const first = (n, name) => kids(n, name)[0] || null;
  const all = (n, name) => n ? [...n.getElementsByTagName(name)] : [];
  const attr = (el, local) => {
    if (!el || !el.attributes) return '';
    for (const a of el.attributes) if (a.localName === local || a.name === local || a.name.endsWith(':' + local)) return a.value;
    return '';
  };
  const mimeOf = p => {
    const e = (p.split('.').pop() || '').toLowerCase();
    return 'image/' + ({ jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', bmp: 'bmp', svg: 'svg+xml' }[e] || 'png');
  };
  function normPath(base, rel) {
    const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
    const out = [];
    for (const p of (dir + (rel || '')).split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') out.pop(); else out.push(p);
    }
    return out.join('/');
  }
  async function readRels(zip, relPath) {
    const f = zip.file(relPath);
    if (!f) return {};
    try {
      const d = xml(await f.async('string')), map = {};
      for (const r of all(d, 'Relationship')) {
        const id = r.getAttribute('Id') || attr(r, 'Id');
        if (id) map[id] = r.getAttribute('Target') || attr(r, 'Target') || '';
      }
      return map;
    } catch { return {}; }
  }
  async function loadImages(zip, rels, baseFile) {
    const out = {};
    let n = 0;
    for (const [id, target] of Object.entries(rels)) {
      if (n >= 30 || !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(target || '')) continue;
      const p = normPath(baseFile, target.replace(/^\//, ''));
      const f = zip.file(p) || zip.file('xl/' + target) || zip.file('word/' + target) || zip.file('ppt/' + target);
      if (!f) continue;
      try {
        const b64 = await f.async('base64');
        if (b64.length > 6 * 1024 * 1024) continue;
        out[id] = 'data:' + mimeOf(p) + ';base64,' + b64;
        n++;
      } catch {}
    }
    return out;
  }
  const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();

  /* ------------------------------ Word ------------------------------ */
  function inline(node, images) {
    let out = '';
    if (!node || !node.childNodes) return '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += esc(n.nodeValue); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.nodeName;
      if (tag === 'w:t' || tag === 't') out += esc(n.textContent);
      else if (tag === 'w:tab' || tag === 'tab') out += '&nbsp;&nbsp;&nbsp;&nbsp;';
      else if (tag === 'w:br' || tag === 'br') out += '<br>';
      else if (tag === 'w:noBreakHyphen') out += '‑';
      else if (tag === 'w:drawing' || tag === 'drawing' || tag === 'w:pict' || tag === 'pict') {
        const blips = [...all(n, 'a:blip'), ...all(n, 'v:imagedata')];
        for (const b of blips) {
          const id = attr(b, 'embed') || attr(b, 'link') || attr(b, 'id');
          if (id && images[id]) out += `<img class="office-img" src="${images[id]}" alt="文档图片">`;
        }
      } else if (tag === 'w:r' || tag === 'r') {
        let inner = inline(n, images);
        const rPr = first(n, 'w:rPr') || first(n, 'rPr');
        if (rPr) {
          if (first(rPr, 'w:b') || first(rPr, 'b')) inner = '<strong>' + inner + '</strong>';
          if (first(rPr, 'w:i') || first(rPr, 'i')) inner = '<em>' + inner + '</em>';
          if (first(rPr, 'w:u') || first(rPr, 'u')) inner = '<u>' + inner + '</u>';
          const color = first(rPr, 'w:color');
          const cv = color && (color.getAttribute('w:val') || attr(color, 'val'));
          if (cv && /^[0-9a-f]{6}$/i.test(cv)) inner = `<span style="color:#${cv}">${inner}</span>`;
        }
        out += inner;
      } else if (tag === 'w:pPr' || tag === 'pPr' || tag === 'w:rPr' || tag === 'rPr') {
        // 属性节点不产生文本
      } else out += inline(n, images);
    }
    return out;
  }
  function cellHtml(tc, images) {
    return kids(tc, 'w:p').map(p => inline(p, images)).join('<br>') || inline(tc, images);
  }
  function tableHtml(tbl, images) {
    let h = '<table class="office-table"><tbody>';
    for (const tr of kids(tbl, 'w:tr')) {
      h += '<tr>';
      for (const tc of kids(tr, 'w:tc')) h += '<td>' + cellHtml(tc, images) + '</td>';
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }
  function paraHtml(p, images) {
    const pPr = first(p, 'w:pPr') || first(p, 'pPr');
    const style = first(pPr, 'w:pStyle');
    const sv = style ? (style.getAttribute('w:val') || attr(style, 'val') || '') : '';
    let tag = 'p', cls = '';
    if (/heading\s*1|标题\s*1|^[1]$/i.test(sv)) tag = 'h1';
    else if (/heading\s*2|标题\s*2|^2$/i.test(sv)) tag = 'h2';
    else if (/heading\s*([3-9])|标题\s*[3-9]/i.test(sv)) tag = 'h3';
    else if (/list|列表/i.test(sv)) cls = ' class="office-li"';
    const jc = first(pPr, 'w:jc');
    const align = jc ? (jc.getAttribute('w:val') || attr(jc, 'val')) : '';
    const st = ['center', 'right', 'left'].includes(align) ? ` style="text-align:${align}"` : '';
    return `<${tag}${cls}${st}>${inline(p, images) || '&nbsp;'}</${tag}>`;
  }
  async function parseDocx(zip) {
    const f = zip.file('word/document.xml');
    if (!f) throw new Error('不是有效的 DOCX 文件');
    const d = xml(await f.async('string'));
    if (d.getElementsByTagName('parsererror').length) throw new Error('DOCX XML 解析失败');
    const rels = await readRels(zip, 'word/_rels/document.xml.rels');
    const images = await loadImages(zip, rels, 'word/document.xml');
    const body = d.getElementsByTagName('w:body')[0] || d.documentElement;
    let html = '';
    for (const n of body.childNodes) {
      if (n.nodeType !== 1) continue;
      if (n.nodeName === 'w:p' || n.nodeName === 'p') html += paraHtml(n, images);
      else if (n.nodeName === 'w:tbl' || n.nodeName === 'tbl') html += tableHtml(n, images);
    }
    if (!html.trim()) html = '<p>（文档没有可提取的正文内容）</p>';
    const headings = [];
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    tmp.querySelectorAll('h1,h2,h3').forEach((h, i) => headings.push({ i, label: h.textContent.trim().slice(0, 60) || `标题 ${i + 1}` }));
    return { type: 'docx', html, text: strip(html).slice(0, 6000), headings };
  }

  /* ------------------------------ PowerPoint ------------------------------ */
  async function parsePptx(zip) {
    const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(/slide(\d+)/.exec(a)[1]) - Number(/slide(\d+)/.exec(b)[1]));
    if (!names.length) throw new Error('不是有效的 PPTX 文件');
    const slides = [];
    for (const name of names.slice(0, 300)) {
      const d = xml(await zip.file(name).async('string'));
      const rels = await readRels(zip, 'ppt/slides/_rels/' + name.split('/').pop() + '.rels');
      const images = await loadImages(zip, rels, name);
      const lines = [];
      for (const p of all(d, 'a:p')) {
        const t = all(p, 'a:t').map(x => x.textContent).join('').trim();
        if (t) lines.push(t);
      }
      const pics = [];
      for (const b of all(d, 'a:blip')) {
        const id = attr(b, 'embed') || attr(b, 'link');
        if (id && images[id]) pics.push(images[id]);
      }
      const noteName = 'ppt/notesSlides/notesSlide' + (/slide(\d+)/.exec(name)[1]) + '.xml';
      let note = '';
      const nf = zip.file(noteName);
      if (nf) { try { note = all(xml(await nf.async('string')), 'a:t').map(x => x.textContent).join(' ').trim().slice(0, 500); } catch {} }
      slides.push({ title: lines[0] || `第 ${slides.length + 1} 页`, lines, images: pics, note });
    }
    return { type: 'pptx', slides, text: slides.map(s => s.lines.join(' ')).join('\n').slice(0, 6000) };
  }

  /* ------------------------------ Excel ------------------------------ */
  function colFromRef(ref) {
    const m = /^([A-Z]+)/i.exec(ref || '');
    if (!m) return 0;
    let n = 0;
    for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  const colName = n => { let s = ''; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  async function parseXlsx(zip) {
    const wf = zip.file('xl/workbook.xml');
    if (!wf) throw new Error('不是有效的 XLSX 文件');
    const wb = xml(await wf.async('string'));
    const rels = await readRels(zip, 'xl/_rels/workbook.xml.rels');
    let shared = [];
    const sf = zip.file('xl/sharedStrings.xml');
    if (sf) {
      const sd = xml(await sf.async('string'));
      for (const si of all(sd, 'si')) shared.push(all(si, 't').map(t => t.textContent).join(''));
    }
    const sheets = [];
    const els = all(wb, 'sheet');
    for (let i = 0; i < els.length && i < 30; i++) {
      const el = els[i];
      const rid = attr(el, 'id');
      const target = rels[rid] || `worksheets/sheet${i + 1}.xml`;
      const p = normPath('xl/workbook.xml', target.replace(/^\//, ''));
      const f = zip.file(p) || zip.file('xl/' + target.replace(/^\//, ''));
      if (!f) continue;
      const d = xml(await f.async('string'));
      const rows = []; let maxCols = 0;
      for (const row of all(d, 'row')) {
        const cells = [];
        for (const c of kids(row, 'c')) {
          const ci = colFromRef(c.getAttribute('r'));
          const t = c.getAttribute('t'), vEl = first(c, 'v');
          let v = '';
          if (t === 's') v = shared[Number(vEl && vEl.textContent)] || '';
          else if (t === 'inlineStr') { const is = first(c, 'is'); v = is ? all(is, 't').map(x => x.textContent).join('') : ''; }
          else if (t === 'b') v = vEl && vEl.textContent === '1' ? 'TRUE' : 'FALSE';
          else if (t === 'str') v = vEl ? vEl.textContent : '';
          else v = vEl ? vEl.textContent : '';
          cells[ci] = v;
        }
        rows.push(cells);
        maxCols = Math.max(maxCols, cells.length);
        if (rows.length >= 300) break;
      }
      sheets.push({ name: el.getAttribute('name') || `Sheet${i + 1}`, rows, maxCols: Math.min(maxCols, 60), truncated: rows.length >= 300 });
    }
    if (!sheets.length) throw new Error('工作簿里没有可读取的工作表');
    return { type: 'xlsx', sheets, colName,
      text: sheets.map(s => s.name + ': ' + s.rows.slice(0, 20).map(r => r.join(' ')).join(' ')).join('\n').slice(0, 6000) };
  }

  async function parse(buf, ext) {
    if (!window.JSZip) throw new Error('Office 组件未加载');
    const zip = await JSZip.loadAsync(buf);
    if (ext === 'docx' || ext === 'docm') return parseDocx(zip);
    if (ext === 'pptx' || ext === 'pptm') return parsePptx(zip);
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xltx') return parseXlsx(zip);
    if (ext === 'csv') return { type: 'csv', text: new TextDecoder('utf-8').decode(new Uint8Array(buf)).slice(0, 200000) };
    throw new Error('该格式需要服务端文本提取');
  }

  /* ------------------------------ 渲染 ------------------------------ */
  function renderDocx(d) { return `<div class="office-doc">${d.html}</div>`; }
  function renderSlide(s, i, total) {
    const bullets = s.lines.slice(1).map(t => `<li>${esc(t)}</li>`).join('');
    const pics = (s.images || []).slice(0, 4).map(src => `<img class="slide-img" src="${src}" alt="幻灯片图片">`).join('');
    return `<div class="office-slide">
      <div class="slide-no">${i + 1} / ${total}</div>
      <h2>${esc(s.title)}</h2>
      ${bullets ? `<ul>${bullets}</ul>` : ''}
      ${pics ? `<div class="slide-pics">${pics}</div>` : ''}
      ${s.note ? `<div class="slide-note"><b>备注</b> ${esc(s.note)}</div>` : ''}
      ${!bullets && !pics ? '<p class="slide-empty">本页没有可提取的文字（可能是纯图形页），可下载原文件查看。</p>' : ''}
    </div>`;
  }
  function renderSheet(sh) {
    const cols = Math.min(sh.maxCols || 12, 60);
    let h = '<div class="office-sheet"><table class="office-table sheet"><thead><tr><th class="rowhead"></th>';
    for (let c = 0; c < cols; c++) h += `<th>${colName(c)}</th>`;
    h += '</tr></thead><tbody>';
    sh.rows.forEach((r, i) => {
      h += `<tr><th class="rowhead">${i + 1}</th>`;
      for (let c = 0; c < cols; c++) h += `<td>${esc(r[c] == null ? '' : r[c])}</td>`;
      h += '</tr>';
    });
    h += '</tbody></table>';
    if (sh.truncated) h += '<p class="sheet-note">表格较大，仅预览前 300 行 / 60 列；完整数据请下载原文件。</p>';
    return h + '</div>';
  }

  window.Office = { parse, renderDocx, renderSlide, renderSheet, strip, esc, colName };
})();
