/* 灯下 · Lantern Desk —— 笔记格式渲染引擎（原生 JS，零依赖、完全离线）
 * 支持 Markdown / HTML / MHTML / reStructuredText / AsciiDoc / Org-mode /
 * Textile / MediaWiki / JSON / YAML / XML / OPML / 源码与配置文本。
 *
 * 安全原则：所有输出都经过 DOMParser 白名单消毒，脚本、事件属性、
 * javascript: / data:text/html 等 URL 一律移除；相对图片只走后端 asset 接口。
 */
(function () {
  'use strict';

  const MD_EXTS = ['md', 'markdown', 'mdown', 'mkd', 'mdx'];
  const HTML_EXTS = ['html', 'htm', 'xhtml', 'mht', 'mhtml'];
  const LIGHT_EXTS = ['rst', 'rest', 'adoc', 'asciidoc', 'asc', 'org', 'textile', 'wiki', 'mediawiki'];
  const CODE_EXTS = ['json', 'jsonc', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
    'xml', 'opml', 'tex', 'latex', 'sql', 'py', 'js', 'mjs', 'ts', 'jsx', 'tsx', 'sh', 'bash',
    'bat', 'ps1', 'css', 'scss', 'less', 'c', 'h', 'cpp', 'cc', 'java', 'go', 'rs', 'php',
    'rb', 'diff', 'patch', 'properties', 'vue', 'svelte', 'graphql', 'proto'];
  const NOTE_EXTS = [...MD_EXTS, ...HTML_EXTS, ...LIGHT_EXTS, ...CODE_EXTS];
  const NOTE_SET = new Set(NOTE_EXTS);
  const MD_SET = new Set(MD_EXTS), HTML_SET = new Set(HTML_EXTS),
    LIGHT_SET = new Set(LIGHT_EXTS), CODE_SET = new Set(CODE_EXTS);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stripCtl = s => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '');
  const decodeEnt = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');

  /* ------------------------------ URL 安全 ------------------------------ */
  function safeUrl(raw, kind, opts) {
    opts = opts || {};
    const u = stripCtl(decodeEnt(raw)).trim();
    if (!u) return '';
    const hit = opts.assets && (opts.assets[u] || opts.assets[decodeURIComponent(u)] ||
      opts.assets[u.replace(/^https?:\/\//i, '')]);
    if (hit) return hit;
    // 仅允许 data:image/* 的位图内嵌（MHTML 资源），禁止 SVG / HTML
    if (/^data:/i.test(u)) {
      return kind === 'img' && /^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,[a-z0-9+/=\s]+$/i.test(u)
        ? u.replace(/\s+/g, '') : '';
    }
    if (/^(javascript|vbscript|file|blob|about):/i.test(u)) return '';
    if (/^cid:/i.test(u)) return (opts.cid && opts.cid[u.slice(4)]) || '';
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u)) return u;
    if (u.charAt(0) === '#') return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';       // 其它协议一律拒绝
    if (/^([/\\]|[a-z]:)/i.test(u)) return '';             // 绝对路径 / 盘符
    if (kind === 'img') return opts.assetBase ? opts.assetBase + encodeURIComponent(u.split('#')[0]) : '';
    return '#';                                            // 相对链接：前端拦截并提示
  }

  /* --------------------------- HTML 白名单消毒 --------------------------- */
  const ALLOW = new Set(['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'b', 'em', 'i', 'del', 's',
    'mark', 'span', 'div', 'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'sup', 'sub', 'kbd', 'details', 'summary', 'figure', 'figcaption', 'input', 'dl', 'dt', 'dd']);
  const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base',
    'form', 'button', 'select', 'textarea', 'svg', 'math', 'video', 'audio', 'source', 'canvas',
    'noscript', 'template', 'applet', 'frame', 'frameset', 'param', 'map', 'area', 'portal']);
  const ATTR = {
    a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'],
    input: ['type', 'checked', 'disabled'], th: ['align'], td: ['align'],
    code: ['class'], pre: ['class'], details: ['open'], ol: ['start'], li: ['value']
  };
  const goodClass = v => /^(nt-|note-|language-|hljs|task)/.test(v) && v.length < 80 && /^[\w\s-]*$/.test(v);

  function sanitizeHtml(html, opts) {
    let doc, root;
    try {
      doc = new DOMParser().parseFromString('<div id="__note_root">' + String(html || '') + '</div>', 'text/html');
      root = doc.getElementById('__note_root');
    } catch (e) { return ''; }
    if (!root) return '';
    const all = Array.from(root.querySelectorAll('*'));
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i];
      if (!el.parentNode) continue;
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) { el.remove(); continue; }
      if (!ALLOW.has(tag)) {                       // 未知标签：只保留内容
        const p = el.parentNode;
        while (el.firstChild) p.insertBefore(el.firstChild, el);
        el.remove(); continue;
      }
      Array.from(el.attributes).forEach(a => {
        const n = a.name.toLowerCase();
        const allowed = (ATTR[tag] || []).indexOf(n) >= 0 ||
          (n === 'id' && /^note-h-\d+$/.test(a.value)) || (n === 'class' && goodClass(a.value));
        if (!allowed) { el.removeAttribute(a.name); return; }
        if (n === 'href' || n === 'src') {
          const v = safeUrl(a.value, n === 'src' ? 'img' : 'link', opts);
          if (!v) { el.removeAttribute(n); return; }
          el.setAttribute(n, v);
          if (n === 'href' && v === '#') el.setAttribute('data-note-link', a.value);
        }
        if (n === 'class' && !goodClass(a.value)) el.removeAttribute(n);
      });
      if (tag === 'a') {
        el.setAttribute('rel', 'noopener noreferrer nofollow');
        if (/^https?:\/\//i.test(el.getAttribute('href') || '')) el.setAttribute('target', '_blank');
      }
      if (tag === 'input') { el.setAttribute('type', 'checkbox'); el.setAttribute('disabled', ''); }
      if (tag === 'img') {
        el.setAttribute('loading', 'lazy');
        if (!el.getAttribute('alt')) el.setAttribute('alt', '');
        if (!el.getAttribute('src')) el.remove();
      }
    }
    return root.innerHTML;
  }

  /* ------------------------------ MHTML ------------------------------ */
  function qpBytes(s) {
    const bytes = [];
    s = String(s).replace(/=\r?\n/g, '');
    for (let i = 0; i < s.length; i++) {
      if (s.charAt(i) === '=' && /^[0-9a-f]{2}$/i.test(s.substr(i + 1, 2))) {
        bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2;
      } else bytes.push(s.charCodeAt(i) & 0xff);
    }
    return new Uint8Array(bytes);
  }
  function b64(bytes) {
    // 纯 JS 实现，避免不同浏览器 btoa 对高位字节的差异
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      out += T[a >> 2] + T[((a & 3) << 4) | ((b === undefined ? 0 : b) >> 4)];
      out += b === undefined ? '=' : T[((b & 15) << 2) | ((c === undefined ? 0 : c) >> 6)];
      out += c === undefined ? '=' : T[c & 63];
    }
    return out;
  }
  function b64decode(s) {
    const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = String(s).replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, '');
    let acc = 0, bits = 0; const out = [];
    for (const ch of clean) {
      const v = T.indexOf(ch); if (v < 0) continue;
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); acc &= (1 << bits) - 1; }
    }
    return new Uint8Array(out);
  }
  function decodeMhtml(src) {
    const head = src.slice(0, 6000);
    const bm = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(head);
    if (!bm) return { html: extractBody(src), assets: {}, cid: {} };
    const b = bm[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = src.split(new RegExp('\\r?\\n--' + b + '(?:--)?\\r?\\n', 'i'));
    const assets = {}, cid = {};
    let main = '';
    for (const part of parts) {
      const i = part.search(/\r?\n\r?\n/);
      if (i < 0) continue;
      const hdr = part.slice(0, i), body = part.slice(i).replace(/^\r?\n\r?\n/, '').replace(/\r?\n--$/, '');
      const type = ((/Content-Type\s*:\s*([^;\r\n]+)/i.exec(hdr) || [])[1] || 'application/octet-stream').trim();
      const enc = ((/Content-Transfer-Encoding\s*:\s*([^\r\n;]+)/i.exec(hdr) || [])[1] || '').trim().toLowerCase();
      const loc = ((/Content-Location\s*:\s*([^\r\n;]+)/i.exec(hdr) || [])[1] || '').trim();
      const cidv = ((/Content-ID\s*:\s*<([^>]+)>/i.exec(hdr) || [])[1] || '').trim();
      let bytes;
      if (enc === 'base64') bytes = b64decode(body);
      else bytes = qpBytes(body);
      const text = new TextDecoder('utf-8').decode(bytes);
      const plain = (text.match(/\uFFFD/g) || []).length > 2
        ? new TextDecoder('gb18030').decode(bytes) : text;
      if (/^text\/html/i.test(type) && !main) { main = plain; continue; }
      const mime = /^[a-z0-9]+\/[a-z0-9.+-]+$/i.test(type) ? type : 'application/octet-stream';
      const data = 'data:' + mime + ';base64,' + b64(bytes);
      if (loc) { assets[loc] = data; assets[loc.replace(/^https?:\/\//i, '')] = data; assets[loc.split('/').pop()] = data; }
      if (cidv) cid[cidv] = data;
    }
    return { html: main || extractBody(src), assets, cid };
  }
  function extractBody(src) {
    const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(src);
    return m ? m[1] : src;
  }

  /* ------------------------------ Markdown ------------------------------ */
  function inline(src, opts) {
    const tok = [];
    const stash = html => '\u0002' + (tok.push(html) - 1) + '\u0002';
    let s = String(src == null ? '' : src);
    s = s.replace(/(`+)([\s\S]*?)\1/g, (m, tick, code) => stash('<code>' + esc(code.trim()) + '</code>'));
    s = s.replace(/!\[([^\]]*)\]\(\s*((?:[^()\s]|\([^()\s]*\))+)(?:\s+"([^"]*)")?\s*\)/g, (m, alt, url, title) => {
      const v = safeUrl(url, 'img', opts);
      return v ? stash('<img src="' + esc(v) + '" alt="' + esc(decodeEnt(alt)) + '"' +
        (title ? ' title="' + esc(title) + '"' : '') + '>') : '';
    });
    s = s.replace(/\[([^\]]+)\]\(\s*((?:[^()\s]|\([^()\s]*\))+)(?:\s+"([^"]*)")?\s*\)/g, (m, text, url, title) => {
      const v = safeUrl(url, 'link', opts);
      return stash('<a href="' + esc(v) + '"' + (title ? ' title="' + esc(title) + '"' : '') +
        (v === '#' ? ' data-note-link="' + esc(url) + '"' : '') + '>' + esc(decodeEnt(text)) + '</a>');
    });
    s = s.replace(/<((?:https?|mailto):[^>\s]+)>/gi, (m, url) => stash('<a href="' + esc(safeUrl(url, 'link', opts)) + '">' + esc(url) + '</a>'));
    s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/gi, (m, pre, url) => pre + stash('<a href="' + esc(safeUrl(url, 'link', opts)) + '">' + esc(url) + '</a>'));
    s = esc(s);
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (m, c) => '&#' + c.charCodeAt(0) + ';');
    s = s.replace(/\*\*\*([^\n*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^\n*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^\n_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w*])\*([^\n*]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w_])_([^\n_]+)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^\n~]+)~~/g, '<del>$1</del>');
    s = s.replace(/==([^\n=]+)==/g, '<mark>$1</mark>');
    s = s.replace(/ {2,}\n/g, '<br>\n');
    return s.replace(/\u0002(\d+)\u0002/g, (m, i) => tok[Number(i)] || '');
  }

  const splitRow = line => {
    let s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  };
  const isTableSep = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

  function mdToHtml(src, opts) {
    opts = opts || {};
    const state = opts._state || (opts._state = { n: 0, heads: [] });
    const lines = String(src || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').split('\n');
    const out = [];
    let i = 0;
    const heading = (level, text) => {
      const h = { id: 'note-h-' + (++state.n), level, label: String(text).replace(/[*_`~#\[\]]/g, '').trim() };
      state.heads.push(h); return h;
    };
    const heads = state.heads;
    // YAML front matter
    if (lines[0] === '---') {
      const end = lines.indexOf('---', 1);
      if (end > 0) {
        const rows = lines.slice(1, end).filter(l => /^\s*[\w\u4e00-\u9fa5-]+\s*:/.test(l))
          .map(l => { const k = l.indexOf(':'); return '<tr><th>' + esc(l.slice(0, k).trim()) + '</th><td>' + inline(l.slice(k + 1).trim(), opts) + '</td></tr>'; });
        if (rows.length) out.push('<table class="note-front"><tbody>' + rows.join('') + '</tbody></table>');
        i = end + 1;
      }
    }
    const listBlock = (start, ordered) => {
      const items = [];
      const base = /^(\s*)/.exec(lines[start])[1].length;
      while (i < lines.length) {
        const l = lines[i];
        const m = ordered ? /^(\s*)\d+[.)]\s+(.*)$/.exec(l) : /^(\s*)[-*+]\s+(.*)$/.exec(l);
        if (!m || m[1].length < base || (m[1].length === base && !lines[i].trim())) break;
        if (m[1].length > base) { i++; continue; }              // 嵌套内容并进上一项（简化）
        let text = m[2];
        const task = /^\[([ xX])\]\s*/.exec(text);
        if (task) text = text.slice(task[0].length);
        items.push((task ? '<input type="checkbox" disabled' + (task[1].toLowerCase() === 'x' ? ' checked' : '') + '> ' : '') + inline(text, opts));
        i++;
      }
      return '<' + (ordered ? 'ol' : 'ul') + (items.some(x => x.indexOf('checkbox') >= 0) ? ' class="note-task"' : '') +
        '>' + items.map(t => '<li>' + t + '</li>').join('') + '</' + (ordered ? 'ol' : 'ul') + '>';
    };
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      // 围栏代码块
      let m = /^(\s{0,3})(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line);
      if (m) {
        const fence = m[2].charAt(0), lang = m[3];
        i++; const buf = [];
        while (i < lines.length && !new RegExp('^\\s{0,3}' + fence + '{' + m[2].length + ',}\\s*$').test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre class="note-code"><code' + (lang ? ' class="language-' + esc(lang) + '"' : '') + '>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }
      // 标题
      m = /^(\s{0,3})(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (m) {
        const h = heading(m[2].length, m[3]);
        out.push('<h' + h.level + ' id="' + h.id + '">' + inline(m[3], opts) + '</h' + h.level + '>'); i++; continue;
      }
      // Setext 标题
      if (i + 1 < lines.length && /^(\s{0,3})(=+|-{2,})\s*$/.test(lines[i + 1]) && line.trim()) {
        const h = heading(lines[i + 1].trim().charAt(0) === '=' ? 1 : 2, line);
        out.push('<h' + h.level + ' id="' + h.id + '">' + inline(line.trim(), opts) + '</h' + h.level + '>'); i += 2; continue;
      }
      // 分隔线
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      // 表格
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = splitRow(line), aligns = splitRow(lines[i + 1]).map(a =>
          /^:-+:$/.test(a) ? 'center' : /-+:$/.test(a) ? 'right' : 'left');
        i += 2; const rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) rows.push(splitRow(lines[i++]));
        out.push('<table class="note-table"><thead><tr>' + head.map((c, k) =>
          '<th style="text-align:' + (aligns[k] || 'left') + '">' + inline(c, opts) + '</th>').join('') +
          '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map((c, k) =>
            '<td style="text-align:' + (aligns[k] || 'left') + '">' + inline(c, opts) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
        continue;
      }
      // 引用
      if (/^\s{0,3}>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) buf.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        out.push('<blockquote>' + mdToHtml(buf.join('\n'), opts).html + '</blockquote>'); continue;
      }
      // 列表
      m = /^(\s*)([-*+]|\d+[.)])\s+/.exec(line);
      if (m) { out.push(listBlock(i, /\d/.test(m[2].charAt(0)))); continue; }
      // 缩进代码块
      if (/^ {4,}\S/.test(line)) {
        const buf = [];
        while (i < lines.length && (/^ {4,}/.test(lines[i]) || !lines[i].trim())) buf.push(lines[i++].replace(/^ {4}/, ''));
        out.push('<pre class="note-code"><code>' + esc(buf.join('\n')) + '</code></pre>'); continue;
      }
      // 段落
      const buf = [line]; i++;
      while (i < lines.length && lines[i].trim() &&
        !/^(\s{0,3})(#{1,6}\s|`{3,}|~{3,}|>|[-*+]\s|\d+[.)]\s)/.test(lines[i]) &&
        !/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(lines[i]) &&
        !(lines[i].indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1]))) buf.push(lines[i++]);
      out.push('<p>' + inline(buf.join('\n'), opts) + '</p>');
    }
    return { html: out.join('\n'), headings: heads };
  }

  /* --------------------- 轻量标记语言 → Markdown --------------------- */
  function lightToMarkdown(src, ext) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let inCode = false;
    const fence = lang => { out.push('```' + (lang || '')); inCode = true; };
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i];
      if (inCode) {
        if (/^\s*(----|```|#\+END_SRC)\s*$/i.test(l)) { out.push('```'); inCode = false; continue; }
        out.push(l.replace(/^\s{2,4}/, '')); continue;
      }
      if (/^(rst|rest)$/.test(ext)) {
        const nx = lines[i + 1] || '';
        if (/^[=~^\-`"':+*#]{3,}\s*$/.test(nx) && l.trim() && nx.trim().charAt(0) === nx.trim().charAt(0)) {
          const levels = { '=': 1, '~': 2, '^': 3, '-': 4, '"': 5, "'": 6 };
          const lv = levels[nx.trim().charAt(0)] || 2;
          out.push('#'.repeat(lv) + ' ' + l.trim()); i++; continue;
        }
        let m = /^\s*\.\.\s+(?:code-block|code|sourcecode)::\s*(\w*)/i.exec(l);
        if (m) { fence(m[1]); continue; }
        if (/::\s*$/.test(l) && /^\s*$/.test(lines[i + 1] || '')) { out.push(l.replace(/::\s*$/, '')); fence(''); continue; }
        l = l.replace(/``([^`]+)``/g, '`$1`').replace(/\.\.\s+_[^:]+:\s*\S+/g, '');
        if (/^\s*\.\.\s+\w+::/.test(l)) continue;
        if (/^\s*\|/.test(l)) { out.push(l); continue; }
        out.push(l); continue;
      }
      if (/^(adoc|asciidoc|asc)$/.test(ext)) {
        let m = /^(=+)\s+(.*)$/.exec(l);
        if (m) { out.push('#'.repeat(Math.max(1, m[1].length)) + ' ' + m[2]); continue; }
        if (/^\[source\s*(?:,\s*(\w+))?\]\s*$/i.test(lines[i + 1] || '') && /^----\s*$/.test(lines[i + 2] || '')) {
          out.push(l); i += 2; fence((/,\s*(\w+)/.exec(lines[i - 1]) || [])[1]); continue;
        }
        if (/^----\s*$/.test(l)) { fence(''); continue; }
        if (/^\|===/.test(l)) { out.push(''); continue; }
        l = l.replace(/\*([^*\n]+)\*/g, '**$1**').replace(/(^|\s)_([^_\n]+)_/g, '$1*$2*')
          .replace(/\[([^\]]+)\]/g, '`$1`').replace(/^\s*\.?\s*/, m0 => m0);
        out.push(l); continue;
      }
      if (ext === 'org') {
        let m = /^(\*+)\s+(.*)$/.exec(l);
        if (m) { out.push('#'.repeat(Math.min(6, m[1].length)) + ' ' + m[2].replace(/\s+:[\w:]+:\s*$/, '')); continue; }
        m = /^#\+BEGIN_SRC\s*(\w*)/i.exec(l);
        if (m) { fence(m[1]); continue; }
        if (/^#\+END_SRC/i.test(l)) continue;
        if (/^#\+BEGIN_(QUOTE|EXAMPLE)/i.test(l)) { out.push('>'); continue; }
        if (/^#\+END_/i.test(l) || /^#\+/.test(l)) continue;
        if (/^\s*\|[-+]+\|/.test(l)) { out.push('|' + l.trim().replace(/^\|/, '').replace(/[-+]+/g, '---') + '|'); continue; }
        l = l.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, '[$2]($1)')
          .replace(/(^|\s)\*([^*\n]+)\*/g, '$1**$2**').replace(/(^|\s)\/([^/\n]+)\//g, '$1*$2*')
          .replace(/[=~]([^=~\n]+)[=~]/g, '`$1`');
        out.push(l); continue;
      }
      if (ext === 'textile') {
        let m = /^h([1-6])\.\s+(.*)$/.exec(l);
        if (m) { out.push('#'.repeat(Number(m[1])) + ' ' + m[2]); continue; }
        if (/^bc\.\.?\s+/.test(l)) { out.push(l.replace(/^bc\.\.?\s+/, '')); fence(''); continue; }
        l = l.replace(/\*([^*\n]+)\*/g, '**$1**').replace(/_([^_\n]+)_/g, '*$1*')
          .replace(/@([^@\n]+)@/g, '`$1`').replace(/\?\?([^?\n]+)\?\?/g, '_$1_');
        out.push(l); continue;
      }
      // MediaWiki
      let m = /^(={1,6})\s*(.*?)\s*\1\s*$/.exec(l);
      if (m) { out.push('#'.repeat(m[1].length) + ' ' + m[2]); continue; }
      if (/^\{\|/.test(l) || /^\|\}/.test(l) || /^\|-/.test(l)) continue;
      l = l.replace(/'''''(.+?)'''''/g, '***$1***').replace(/'''(.+?)'''/g, '**$1**')
        .replace(/''(.+?)''/g, '*$1*').replace(/<code>(.*?)<\/code>/gi, '`$1`')
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '[$2]($1)').replace(/\[\[([^\]]+)\]\]/g, '[$1]($1)');
      if (/^\s*#+\s/.test(l)) l = l.replace(/^(#+)\s+/, (mm, h) => '1. ');
      out.push(l);
    }
    if (inCode) out.push('```');
    return out.join('\n');
  }

  /* --------------------------- 源码 / 数据视图 --------------------------- */
  function codeHtml(src, ext) {
    let s = String(src || ''), formatted = false;
    if (ext === 'json' || ext === 'jsonc') {
      try {
        const clean = ext === 'jsonc' ? s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') : s;
        s = JSON.stringify(JSON.parse(clean), null, 2); formatted = true;
      } catch (e) { formatted = false; }
    }
    if (ext === 'opml') return opmlHtml(s);
    const tokens = [];
    // 占位符使用私用区字符，避免被后面的「数字 / 关键字」正则误伤
    const stash = (cls, t) => {
      const idx = tokens.push('<span class="' + cls + '">' + t + '</span>') - 1;
      return '\u0003' + String.fromCharCode(0xE000 + idx) + '\u0003';
    };
    let r = esc(s);
    r = r.replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;|&#39;(?:[^&]|&(?!#39;))*?&#39;|`(?:[^`\n])*`)/g, m => stash('nt-s', m));
    r = r.replace(/(&lt;!--[\s\S]*?--&gt;|\/\/[^\n]*|^\s*#[^\n]*|^\s*;[^\n]*|^\s*--[^\n]*)/gm, m => stash('nt-c', m));
    r = r.replace(/\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, m => stash('nt-n', m));
    r = r.replace(/\b(true|false|null|None|True|False|function|const|let|var|return|class|def|import|from|if|else|for|while|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE)\b/g, m => stash('nt-k', m));
    r = r.replace(/(&lt;\/?[\w:-]+)/g, m => stash('nt-t', m));
    r = r.replace(/\u0003([\uE000-\uF8FF])\u0003/g, (m, ch) => tokens[ch.charCodeAt(0) - 0xE000] || '');
    return '<pre class="note-code" data-lang="' + esc(ext.toUpperCase()) + '"><code>' + r + '</code></pre>' +
      (formatted ? '<p class="note-hint">已自动格式化 JSON</p>' : '');
  }
  function opmlHtml(src) {
    let doc;
    try { doc = new DOMParser().parseFromString(src, 'application/xml'); } catch (e) { return codeHtml(src, 'xml'); }
    if (doc.querySelector('parsererror')) return codeHtml(src, 'xml');
    const build = (node, depth) => {
      const items = Array.from(node.children).filter(n => n.tagName.toLowerCase() === 'outline');
      if (!items.length) return '';
      return '<ul class="note-outline">' + items.map(n => {
        const text = esc(n.getAttribute('text') || n.getAttribute('title') || n.getAttribute('_name') || '');
        const note = n.getAttribute('_note') || n.getAttribute('note');
        return '<li>' + text + (note ? ' <span class="note-hint">' + esc(note.slice(0, 120)) + '</span>' : '') + build(n, depth + 1) + '</li>';
      }).join('') + '</ul>';
    };
    const title = doc.querySelector('head > title');
    return (title ? '<h1 id="note-h-1">' + esc(title.textContent) + '</h1>' : '') + build(doc.querySelector('body') || doc.documentElement, 0);
  }

  /* ------------------------------- 入口 ------------------------------- */
  function parse(source, ext, opts) {
    opts = opts || {};
    const e = String(ext || '').toLowerCase().replace(/^\./, '');
    const src = String(source == null ? '' : source);
    let rawHtml = '', headings = [], kind = 'markdown';
    if (HTML_SET.has(e)) {
      kind = 'html';
      const cleaned = src.replace(/<!doctype[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '');
      const d = /^(mht|mhtml)$/.test(e) ? decodeMhtml(src) : { html: extractBody(cleaned), assets: {}, cid: {} };
      const o = Object.assign({}, opts, { assets: d.assets, cid: d.cid });
      rawHtml = sanitizeHtml(/^(mht|mhtml)$/.test(e)
        ? d.html.replace(/<head[\s\S]*?<\/head>/gi, '') : d.html, o);
    } else if (LIGHT_SET.has(e)) {
      kind = 'light';
      const md = mdToHtml(lightToMarkdown(src, e), opts);
      rawHtml = md.html; headings = md.headings;
    } else if (CODE_SET.has(e)) {
      kind = 'code';
      rawHtml = codeHtml(src, e);
      if (e === 'opml') {
        const m = /<h1 id="note-h-1">([^<]*)<\/h1>/.exec(rawHtml);
        if (m) headings = [{ id: 'note-h-1', level: 1, label: decodeEnt(m[1]) }];
      }
    } else {
      const md = mdToHtml(src, opts);
      rawHtml = md.html; headings = md.headings;
    }
    if (HTML_SET.has(e)) {
      const tmp = document.createElement('div'); tmp.innerHTML = rawHtml;
      headings = Array.from(tmp.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h, i) => {
        if (!h.id) { h.id = 'note-h-' + (i + 1); }
        return { id: h.id, level: Number(h.tagName.charAt(1)), label: (h.textContent || '').trim().slice(0, 80) };
      });
      rawHtml = tmp.innerHTML;
    }
    const tmp2 = document.createElement('div'); tmp2.innerHTML = rawHtml;
    const text = (tmp2.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return { html: rawHtml, headings, text, kind, ext: e, source: src };
  }

  window.Notes = {
    NOTE_EXTS, MD_EXTS, HTML_EXTS, LIGHT_EXTS, CODE_EXTS,
    isNote: ext => NOTE_SET.has(String(ext || '').toLowerCase().replace(/^\./, '')),
    isMarkdown: ext => MD_SET.has(String(ext || '').toLowerCase().replace(/^\./, '')),
    isHtml: ext => HTML_SET.has(String(ext || '').toLowerCase().replace(/^\./, '')),
    isLight: ext => LIGHT_SET.has(String(ext || '').toLowerCase().replace(/^\./, '')),
    isCode: ext => CODE_SET.has(String(ext || '').toLowerCase().replace(/^\./, '')),
    parse, sanitizeHtml, mdToHtml, lightToMarkdown, codeHtml, decodeMhtml, esc, safeUrl
  };
})();
