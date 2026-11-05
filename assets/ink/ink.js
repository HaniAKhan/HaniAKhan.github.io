/* Ink notes: hand-drawn loops around things on the page, with a handwritten note beside each.
   For visitors it only draws the saved notes (notes/ beside this file): no tools. On this machine,
   with the notes server running (the ink-notes skill), it's the editor, and saves go to those files.

   Settings are in ink.json beside this file:
     id        the project's name; the editor only attaches to a server reporting the same one
     port      the notes server's port; null means only the origin that server serves can edit
     frames    selector for canvases: a note drawn in one belongs to its image wherever it's shown
     ignore    selector for page furniture to leave out when working out what was circled
     hideWhen  selector tested on <html>: while it matches, no notes show
     dark      selector tested on <html>: while it matches, notes use their dark colours
     base      the path the site is hosted under, if any ("/repo"); it's left out of page names
     pages     which pages have notes (kept by the server), so other pages fetch nothing more

   Editing: Alt+A or the pen button for draw mode. Drag a loop, type a note, Enter to save.
   Drag a loop or note to move it, click a note to edit, × to delete. Alt+Shift+A hides it all. */
(() => {
  if (window.__ink || window.self !== window.top) return; // once per tab, not inside iframes like the demo
  window.__ink = true;

  const script = document.currentScript || document.querySelector('script[src$="ink.js"]');
  const HOME = new URL('.', script?.src || location.href); // the files beside this one
  const inHome = (file) => new URL(file, HOME).href;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(location.hostname);
  const SVG = 'http://www.w3.org/2000/svg';
  let cfg = {};
  let API = ''; // the notes server, once it has answered
  let OWN = '#ink-root, #ink-dock, .ink-list';
  // A copy of a frame (a lightbox) shows the same notes, so frames are matched by their image's src.
  let FRAME = '[data-ink-frame]';
  const htmlMatches = (sel) => { try { return !!sel && document.documentElement.matches(sel); } catch { return false; } };
  // One name per page, whatever the host does with index.html and trailing slashes
  function pageKey() {
    let p = location.pathname;
    if (cfg.base && p.startsWith(cfg.base)) p = p.slice(cfg.base.length) || '/';
    p = p.replace(/index\.html$/, '');
    return /\/$|\.[a-z0-9]+$/i.test(p) ? p : `${p}/`;
  }
  let page = '/';
  // Below this the side notes don't fit, and below this size their text can't be read: numbered badges instead
  const PHONE = 640, NOTE_PX = 21, MIN_PX = 11;
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  let items = [];
  let editable = false;
  let mode = store.get('ink-mode', 'view'); // off | view | draw
  const views = new Map(); // id → { g, loop, hit, leader, note, el, key }

  /* ---------- DOM ---------- */
  const h = (tag, cls, parent) => {
    const el = tag.includes(':') ? document.createElementNS(SVG, tag.split(':')[1]) : document.createElement(tag);
    if (cls) el.setAttribute('class', cls);
    if (parent) parent.append(el);
    return el;
  };
  const root = h('div');
  root.id = 'ink-root';
  const capture = h('div', 'ink-capture', root);
  const svg = h('svg:svg', 'ink-svg', root);
  const notes = h('div', 'ink-notes', root);
  const sheet = h('div', 'ink-sheet', root); // a badge's note, opened large; the badge's own label reads it out
  sheet.hidden = true;
  sheet.setAttribute('aria-hidden', 'true');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Handwritten notes on this page');
  svg.setAttribute('aria-hidden', 'true');
  const defs = h('svg:defs', null, svg);
  const draft = h('svg:path', 'ink-loop', svg);

  const dock = h('div');
  dock.id = 'ink-dock';
  dock.innerHTML = `
    <button type="button" class="ink-btn" data-act="draw" title="Draw (Alt+A)">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16c1.5-.3 2.6-.9 3.6-1.9l7.7-7.7a1.8 1.8 0 0 0-2.6-2.6L5 11.5C4 12.5 3.4 13.6 3.1 15.1z"/><path d="M11.6 5.2l2.6 2.6"/></svg>
    </button>
    <button type="button" class="ink-btn" data-act="eye" title="Show or hide notes (Alt+Shift+A)">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.8 10s3-5.5 8.2-5.5S18.2 10 18.2 10s-3 5.5-8.2 5.5S1.8 10 1.8 10z"/><circle cx="10" cy="10" r="2.4"/></svg>
    </button>
    <span class="ink-count" title="Notes on this page"></span>`;

  /* ---------- Geometry ---------- */
  const rectOf = (el) => (el && el.isConnected ? el.getBoundingClientRect() : null);
  const usable = (r) => r && r.width > 0 && r.height > 0;
  const norm = (x, y, r) => [+((x - r.left) / r.width).toFixed(4), +((y - r.top) / r.height).toFixed(4)];
  const denorm = ([u, v], r) => [r.left + u * r.width, r.top + v * r.height];
  const bounds = (pts) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top, right: Math.max(...xs), bottom: Math.max(...ys) };
  };

  // Smooth a pointer trail into quadratic curves through the midpoints.
  const pathOf = (pts) => {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i], [nx, ny] = pts[i + 1];
      d += ` Q${x.toFixed(1)},${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)},${((y + ny) / 2).toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${last[0].toFixed(1)},${last[1].toFixed(1)}`;
  };

  /* ---------- What was circled ---------- */
  const esc = (s) => CSS.escape(s);
  const classesOf = (el) => [...el.classList].filter((c) => !/^(is-|has-|js-)/.test(c));

  function selectorOf(el) {
    const doc = el.ownerDocument;
    if (el.id && doc.querySelectorAll('#' + esc(el.id)).length === 1) return '#' + esc(el.id);
    const parts = [];
    for (let n = el; n && n !== doc.documentElement; n = n.parentElement) {
      if (n.id && doc.querySelectorAll('#' + esc(n.id)).length === 1) { parts.unshift('#' + esc(n.id)); break; }
      let part = n.tagName.toLowerCase();
      const cls = classesOf(n).slice(0, 2);
      if (cls.length) part += '.' + cls.map(esc).join('.');
      const sibs = n.parentElement ? [...n.parentElement.children].filter((s) => s.matches(part)) : [];
      if (sibs.length > 1) part += `:nth-of-type(${[...n.parentElement.children].filter((s) => s.tagName === n.tagName).indexOf(n) + 1})`;
      parts.unshift(part);
      const sel = parts.join(' > ');
      if (doc.querySelectorAll(sel).length === 1) return sel;
    }
    return parts.join(' > ');
  }

  function describe(el) {
    let meaningful = null;
    for (let n = el; n && n !== el.ownerDocument.body && !meaningful; n = n.parentElement) meaningful = classesOf(n)[0] || null;
    const text = (el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    return {
      selector: selectorOf(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: classesOf(el),
      class: meaningful,
      // CSS-module names like _searchBox_o1jpq_64 come from a build; the source name is searchBox.
      module: (meaningful || '').match(/^_([A-Za-z][\w]*?)_[a-z0-9]{5}_\d+$/)?.[1] || null,
      text: text.slice(0, 120) || null,
      html: el.outerHTML.slice(0, el.outerHTML.indexOf('>') + 1).slice(0, 200),
    };
  }

  // Elements mostly inside the loop's box; the anchor is the one element, or their common ancestor.
  function resolve(box, doc = document) {
    const hits = [];
    for (const el of doc.body.querySelectorAll('*')) {
      if (el.closest(OWN) || /^(SCRIPT|STYLE|LINK|META|BR|svg|path|g|defs)$/i.test(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 16) continue;
      const ix = Math.min(r.right, box.right) - Math.max(r.left, box.left);
      const iy = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
      if (ix <= 0 || iy <= 0 || (ix * iy) / (r.width * r.height) < 0.7) continue;
      const cs = doc.defaultView.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'contents' || +cs.opacity === 0) continue;
      // Skip things clipped out of sight (an odometer's hidden digits): the centre has to hit-test to it.
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cs.pointerEvents !== 'none' && !doc.elementsFromPoint(cx, cy).some((x) => x === el || el.contains(x))) continue;
      hits.push(el);
    }
    const set = new Set(hits);
    let top = hits.filter((el) => !set.has(el.parentElement));
    if (!top.length) {
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      const under = doc.elementsFromPoint(cx, cy).find((el) => !el.closest(OWN) && el !== doc.documentElement);
      top = [under || doc.body];
    }
    let anchor = top[0];
    if (top.length > 1) {
      while (anchor && !top.every((el) => anchor.contains(el))) anchor = anchor.parentElement;
    }
    anchor = anchor || doc.body;
    const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
    return { anchor, elements: top.sort((a, b) => area(b) - area(a)).slice(0, 8) };
  }

  /* ---------- Frames ---------- */
  const frameKey = (el) => el.querySelector('img, video')?.getAttribute('src') || null;
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && getComputedStyle(el).visibility !== 'hidden' ? r : null; };
  const framesFor = (key) => [...document.querySelectorAll(FRAME)].filter((f) => frameKey(f) === key);

  // The frame on top at a point, if any: the lightbox's copy, not the slide behind it.
  const topAt = (x, y) => document.elementsFromPoint(x, y).find((el) => !el.closest(OWN)) || null;
  function frameAt(box) {
    const f = topAt(box.left + box.width / 2, box.top + box.height / 2)?.closest(FRAME);
    return f && frameKey(f) ? f : null;
  }
  // Covered by something else (a slide behind the open lightbox): its ink hides with it.
  // Tested in the middle of the part that's on screen, so a frame half scrolled off still counts.
  function covered(f, r) {
    const left = Math.max(r.left, 0), right = Math.min(r.left + r.width, innerWidth);
    const top0 = Math.max(r.top, 0), bottom = Math.min(r.top + r.height, innerHeight);
    if (right <= left || bottom <= top0) return false;
    const top = topAt((left + right) / 2, (top0 + bottom) / 2);
    return !!top && !f.contains(top);
  }

  // The same element in another copy of the frame, by child position.
  function mirror(el, from, to) {
    const path = [];
    for (let n = el; n && n !== from; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n));
    return path.reduce((n, i) => n?.children[i], to) || to;
  }

  // Where the frame's ink may show: the frame, cut down by any clipping box around it (the carousel).
  function clipOf(el) {
    let c = el.getBoundingClientRect();
    c = { left: c.left, top: c.top, right: c.right, bottom: c.bottom };
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const r = n.getBoundingClientRect();
      c = { left: Math.max(c.left, r.left), top: Math.max(c.top, r.top), right: Math.min(c.right, r.right), bottom: Math.min(c.bottom, r.bottom) };
    }
    return c;
  }

  // Everything the server needs to record, from viewport points.
  function capturePayload(pts, noteXY) {
    const box = bounds(pts);
    const inFrame = frameAt(box);
    if (inFrame) return framePayload(pts, noteXY, box, inFrame);
    const { anchor, elements } = resolve(box);
    const r = anchor.getBoundingClientRect();
    const ref = usable(r) ? r : { left: box.left, top: box.top, width: Math.max(box.width, 1), height: Math.max(box.height, 1) };
    // A same-origin iframe (the case study demos) is the anchor, but also record what was circled inside it.
    let frame = null;
    if (anchor.tagName === 'IFRAME' && anchor.contentDocument?.body) {
      const fr = anchor.getBoundingClientRect();
      const inner = { left: box.left - fr.left, top: box.top - fr.top, right: box.right - fr.left, bottom: box.bottom - fr.top };
      Object.assign(inner, { width: inner.right - inner.left, height: inner.bottom - inner.top });
      const found = resolve(inner, anchor.contentDocument);
      frame = {
        page: anchor.contentWindow.location.pathname,
        target: describe(found.anchor),
        elements: found.elements.map(describe),
      };
    }
    return {
      target: describe(anchor),
      elements: elements.map(describe),
      frame,
      frameKey: null,
      frameW: null,
      box: { x: Math.round(box.left + scrollX), y: Math.round(box.top + scrollY), w: Math.round(box.width), h: Math.round(box.height) },
      anchorBox: { x: Math.round(ref.left + scrollX), y: Math.round(ref.top + scrollY), w: Math.round(ref.width), h: Math.round(ref.height) },
      loop: pts.map(([x, y]) => norm(x, y, ref)),
      notePos: norm(noteXY[0], noteXY[1], ref),
      _anchor: anchor,
    };
  }

  // Inside a frame the loop and note are kept relative to the frame, and described on the page's own
  // copy of it (the first in the document), so the selector and source line point at the real markup.
  function framePayload(pts, noteXY, box, frame) {
    const key = frameKey(frame);
    const home = framesFor(key)[0] || frame;
    const r = frame.getBoundingClientRect();
    const scale = home.getBoundingClientRect().width / r.width || 1;
    const inside = [...frame.querySelectorAll('*')].filter((el) => {
      const e = el.getBoundingClientRect();
      const ix = Math.min(e.right, box.right) - Math.max(e.left, box.left);
      const iy = Math.min(e.bottom, box.bottom) - Math.max(e.top, box.top);
      return ix > 0 && iy > 0 && (ix * iy) / (e.width * e.height || 1) > 0.05;
    });
    const hb = home.getBoundingClientRect();
    // The box is given on the page's own copy, so it is where the image sits in the page
    const sx = (x) => hb.left + (x - r.left) * scale + scrollX, sy = (y) => hb.top + (y - r.top) * scale + scrollY;
    return {
      target: describe(home),
      elements: (inside.length ? inside : [frame]).slice(0, 8).map((el) => describe(mirror(el, frame, home))),
      frameKey: key,
      frameW: Math.round(r.width),
      box: { x: Math.round(sx(box.left)), y: Math.round(sy(box.top)), w: Math.round(box.width * scale), h: Math.round(box.height * scale) },
      anchorBox: { x: Math.round(hb.left + scrollX), y: Math.round(hb.top + scrollY), w: Math.round(hb.width), h: Math.round(hb.height) },
      loop: pts.map(([x, y]) => norm(x, y, r)),
      notePos: norm(noteXY[0], noteXY[1], r),
      _anchor: frame,
    };
  }

  /* ---------- Server ---------- */
  const api = (method, id, body) =>
    fetch(id ? `${API}/annotations/${id}` : `${API}/annotations`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => (r.status === 204 ? null : r.json()));
  const strip = ({ _anchor, ...rest }) => rest;

  /* ---------- Rendering ---------- */
  // Several notes can share a frame, so each frame is measured once per render
  let pass = new Map();
  // A frame in a carousel moves when its slide's style changes. Re-rendering straight after that
  // write (a mutation callback runs before the frame paints) keeps the ink on the image, whichever
  // of the two animation loops runs first.
  const watched = new WeakSet();
  const follow = new MutationObserver(() => { if (mode !== 'off' && !root.hidden) render(false); });
  const watch = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (watched.has(n)) return;
      watched.add(n);
      follow.observe(n, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  };
  function frameInfo(key) {
    if (pass.has(key)) return pass.get(key);
    // The largest copy on show: the lightbox while it's open, the carousel slide otherwise
    let best = null, area = 0, rect = null;
    for (const f of framesFor(key)) {
      const r = shown(f);
      if (r && r.width * r.height > area) { best = f; area = r.width * r.height; rect = r; }
    }
    if (best) watch(best);
    const info = best && {
      el: best,
      rect,
      clip: covered(best, rect) ? { left: 0, top: 0, right: 0, bottom: 0 } : clipOf(best),
      fade: +getComputedStyle(best).opacity, // fades in with its frame on the page
    };
    pass.set(key, info);
    return info;
  }

  // A selector with a position in it can land on a different element after the page changes, so
  // there the text has to agree too. Any element that still has its id or classes is taken as itself.
  const textOf = (el) => (el.innerText || el.getAttribute('alt') || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
  function sameTarget(t, el) {
    if (t.tag && el.tagName.toLowerCase() !== t.tag) return false;
    if (!/:nth-of-type/.test(t.selector) || (t.text || '').length < 8) return true;
    return textOf(el).includes(t.text.slice(0, 24).toLowerCase());
  }

  // Sets v.state: ok, hidden (it's there but not showing now) or gone (it's not on the page, or the
  // selector now finds something else). Gone notes are only drawn for the editor, where they were.
  function anchorRect(a, v) {
    v.clip = null;
    v.fade = 1;
    v.state = 'ok';
    if (a.frameKey) {
      const f = frameInfo(a.frameKey);
      if (f) {
        v.el = f.el;
        v.clip = f.clip;
        v.fade = f.fade;
        return f.rect;
      }
      if (framesFor(a.frameKey).length) { v.state = 'hidden'; return null; }
    } else {
      const t = performance.now();
      if (!v.el || !v.el.isConnected || t - (v.checked || 0) > 1000) {
        let el = null;
        try { el = document.querySelector(a.target.selector); } catch {}
        v.el = el && sameTarget(a.target, el) ? el : null;
        v.checked = t;
      }
      const r = rectOf(v.el);
      if (usable(r)) return r;
      if (v.el) { v.state = 'hidden'; return null; }
    }
    v.state = 'gone';
    const b = a.anchorBox;
    return { left: b.x - scrollX, top: b.y - scrollY, width: b.w || 1, height: b.h || 1 };
  }

  function viewFor(a) {
    let v = views.get(a.id);
    if (v) return v;
    const g = h('svg:g', 'ink-item', svg);
    v = { g, leader: h('svg:path', 'ink-leader', g), loop: h('svg:path', 'ink-loop', g), hit: h('svg:path', 'ink-hit', g), note: h('div', 'ink-note', notes) };
    v.note.innerHTML = '<span class="ink-sr"></span><span class="ink-text"></span><button type="button" class="ink-x" title="Delete" aria-label="Delete note">×</button>';
    v.badge = h('button', 'ink-badge', notes);
    v.badge.type = 'button';
    v.badge.setAttribute('aria-expanded', 'false');
    v.hit.dataset.id = v.note.dataset.id = v.badge.dataset.id = a.id;
    if (a.frameKey) {
      const cp = h('svg:clipPath', null, defs);
      cp.id = `ink-clip-${a.id}`;
      cp.setAttribute('clipPathUnits', 'userSpaceOnUse');
      v.clipRect = h('svg:rect', null, cp);
      v.clipPath = cp;
    }
    views.set(a.id, v);
    return v;
  }
  const dropView = (id, v) => { v.g.remove(); v.note.remove(); v.badge.remove(); v.clipPath?.remove(); views.delete(id); };
  const hideView = (v) => {
    v.g.style.display = v.note.style.display = v.badge.style.display = 'none';
    v.key = null;
  };
  // What a screen reader hears before a note: the thing it's about
  const subjectOf = (a) => {
    const text = a.elements?.[0]?.text || a.target?.text;
    return text ? `“${text.slice(0, 80).replace(/[“”]/g, '')}”` : 'this page';
  };

  // Everything is drawn in page coordinates, in a layer that scrolls with the page, so scrolling
  // moves the ink natively and leaves nothing to redo here unless the element itself moves.
  const toPage = (b, ox, oy) => b && { left: b.left + ox, top: b.top + oy, right: (b.right ?? b.left + b.width) + ox, bottom: (b.bottom ?? b.top + b.height) + oy, width: b.width ?? b.right - b.left, height: b.height ?? b.bottom - b.top };
  function place(a, v, vr, force) {
    const ox = scrollX, oy = scrollY;
    const r = toPage(vr, ox, oy);
    const c = toPage(v.clip, ox, oy);
    // In a frame the note scales with it, like the image, and is cut off where the frame is.
    const s = a.frameKey ? r.width / (a.frameW || r.width) : 1;
    const compact = !v.note.classList.contains('is-editing') && (innerWidth <= PHONE || s * NOTE_PX < MIN_PX);
    const key = [r.left, r.top, r.width, r.height, a.updated, a._dx || 0, a._dy || 0, a._nx || 0, a._ny || 0, c && [c.left, c.top, c.right, c.bottom], v.fade, v.state, v.n, compact, innerWidth].join();
    if (!force && key === v.key) return;
    v.key = key;
    v.g.style.display = v.note.style.display = v.badge.style.display = '';
    const lost = v.state === 'gone';
    v.g.classList.toggle('is-lost', lost);
    v.note.classList.toggle('is-lost', lost);
    v.badge.classList.toggle('is-lost', lost);
    v.note.classList.toggle('is-compact', compact);
    v.badge.classList.toggle('is-compact', compact);
    // Its note is written out under the frame, so the badge is only a marker
    const listed = compact && !!a.frameKey && !!cfg.listIn && innerWidth <= PHONE && !!v.el?.closest(cfg.listIn);
    v.badge.classList.toggle('is-listed', listed);
    v.badge.toggleAttribute('aria-hidden', listed);
    v.badge.tabIndex = listed ? -1 : 0;
    v.note.title = v.badge.title = lost ? 'What this note pointed at is gone, so visitors don\'t see it. Drag the loop onto the right thing, or delete the note.' : '';
    const pts = a.loop.map((p) => denorm(p, r)).map(([x, y]) => [x + (a._dx || 0), y + (a._dy || 0)]);
    v.loop.setAttribute('d', pathOf(pts));
    v.hit.setAttribute('d', pathOf(pts));
    const text = v.note.querySelector('.ink-text');
    if (!v.note.classList.contains('is-editing') && text.textContent !== a.note) text.textContent = a.note;
    v.note.querySelector('.ink-sr').textContent = `Note on ${subjectOf(a)}: `;
    v.g.style.opacity = v.note.style.opacity = v.badge.style.opacity = a.frameKey && v.fade < 1 ? v.fade : '';
    if (v.clipRect) {
      if (c && !lost) {
        v.g.setAttribute('clip-path', `url(#${v.clipPath.id})`);
        v.clipRect.setAttribute('x', c.left);
        v.clipRect.setAttribute('y', c.top);
        v.clipRect.setAttribute('width', Math.max(0, c.right - c.left));
        v.clipRect.setAttribute('height', Math.max(0, c.bottom - c.top));
      } else {
        v.g.removeAttribute('clip-path');
      }
    }
    if (compact) {
      placeBadge(a, v, pts, r, c);
      v.leader.setAttribute('d', '');
      return;
    }
    let [nx, ny] = denorm(a.notePos, r);
    nx += a._nx || 0; ny += a._ny || 0;
    const w = v.note.offsetWidth, nh = v.note.offsetHeight;
    if (a.frameKey) {
      // Keep the whole note on the frame, so the frame's edge never cuts it off
      const pad = 12 * s;
      nx = Math.min(Math.max(r.left + pad, nx), r.right - w * s - pad);
      ny = Math.min(Math.max(r.top + pad, ny), r.bottom - nh * s - pad);
    } else if (!a._nx && (nx < ox + 8 || nx + w > ox + innerWidth - 8)) {
      // On a narrower window a side note can fall off screen: pull it in, and below the loop if it would cover it.
      nx = Math.min(Math.max(ox + 8, nx), ox + innerWidth - w - 8);
      const b = bounds(pts);
      if (nx < b.right && nx + w > b.left && ny < b.bottom && ny + nh > b.top) ny = b.bottom + 16;
    }
    v.note.style.transform = `translate(${nx}px, ${ny}px)` + (s !== 1 ? ` scale(${s})` : '');
    v.note.style.clipPath = c
      ? `inset(${(c.top - ny) / s}px ${(nx + w * s - c.right) / s}px ${(ny + nh * s - c.bottom) / s}px ${(c.left - nx) / s}px)`
      : '';
    v.leader.setAttribute('d', leaderPath(pts, nx, ny, w * s, nh * s));
  }

  // Where a note won't fit or can't be read, its loop gets a numbered badge that opens it large.
  // The badge sits on the loop's top right corner, on the image or the screen, and moves with the
  // loop: a carousel's edge cuts it off just as it does the image.
  const BADGE = 24;
  function placeBadge(a, v, pts, r, c) {
    const b = bounds(pts);
    // A listed badge stays on the image itself, since a phone's crop can hide the rest of the frame
    const img = v.badge.classList.contains('is-listed') && toPage(rectOf(v.el?.querySelector('img, video')), scrollX, scrollY);
    const area = img || (a.frameKey ? r : { left: scrollX, top: -1e6, right: scrollX + innerWidth, bottom: 1e9 });
    const x = Math.max(area.left + 2, Math.min(b.right - BADGE / 2, area.right - BADGE - 2));
    const y = Math.max(area.top + 2, Math.min(b.top - BADGE / 2, area.bottom - BADGE - 2));
    v.badge.style.transform = `translate(${x}px, ${y}px)`;
    v.badge.style.clipPath = c ? `inset(${c.top - y}px ${x + BADGE - c.right}px ${y + BADGE - c.bottom}px ${c.left - x}px)` : '';
    v.badge.textContent = v.n;
    v.badge.setAttribute('aria-label', `Note ${v.n} on ${subjectOf(a)}: ${a.note}`);
    if (sheetFor === a.id) sheet.querySelector('.ink-sheet__text').textContent = a.note;
  }

  let sheetFor = null;
  sheet.innerHTML = '<span class="ink-sheet__num"></span><span class="ink-sheet__text"></span>';
  function closeSheet() {
    if (!sheetFor) return;
    views.get(sheetFor)?.badge.setAttribute('aria-expanded', 'false');
    sheetFor = null;
    sheet.hidden = true;
  }
  function openSheet(a) {
    closeSheet();
    const v = views.get(a.id);
    sheetFor = a.id;
    sheet.querySelector('.ink-sheet__num').textContent = v.n;
    sheet.querySelector('.ink-sheet__text').textContent = a.note;
    v.badge.setAttribute('aria-expanded', 'true');
    sheet.hidden = false;
  }
  addEventListener('click', (e) => { if (!e.target.closest?.('.ink-badge')) closeSheet(); });

  // A thin line from the loop's nearest edge to the near side of the note, bowed slightly.
  function leaderPath(pts, nx, ny, w, nh) {
    const b = bounds(pts);
    const cy = ny + Math.min(nh / 2, 14);
    const right = nx + w / 2 > b.left + b.width / 2;
    const end = [right ? nx - 6 : nx + w + 6, cy];
    let best = pts[0], bd = Infinity;
    for (const p of pts) {
      const d = (p[0] - end[0]) ** 2 + (p[1] - end[1]) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    const len = Math.sqrt(bd);
    if (len < 12) return '';
    const ux = (end[0] - best[0]) / len, uy = (end[1] - best[1]) / len;
    const start = [best[0] + ux * 5, best[1] + uy * 5];
    const mid = [(start[0] + end[0]) / 2 - uy * len * 0.12, (start[1] + end[1]) / 2 + ux * len * 0.12];
    return `M${start[0].toFixed(1)},${start[1].toFixed(1)} Q${mid[0].toFixed(1)},${mid[1].toFixed(1)} ${end[0].toFixed(1)},${end[1].toFixed(1)}`;
  }

  function render(force) {
    pass = new Map();
    const here = items.filter((a) => a.page === page);
    for (const [id, v] of views) {
      if (!here.some((a) => a.id === id)) dropView(id, v);
    }
    const lost = [];
    const nums = numbering(here);
    here.forEach((a) => {
      let v = viewFor(a);
      if (!!a.frameKey !== !!v.clipRect) { // moved into or out of a frame: rebuild with or without a clip
        dropView(a.id, v);
        v = viewFor(a);
      }
      v.n = nums.get(a.id);
      const rect = anchorRect(a, v);
      if (v.state === 'gone') lost.push(a.id);
      if (v.state === 'hidden' || (v.state === 'gone' && !editable)) { if (sheetFor === a.id) closeSheet(); return hideView(v); }
      place(a, v, rect, force);
    });
    syncLists(here, nums);
    if (editable) showHealth(here.length, lost);
  }

  // Notes count up within their frame, top to bottom, so a frame's badges and list read 1, 2, 3
  function numbering(here) {
    const nums = new Map(), seen = new Map();
    const top = (a) => Math.min(...a.loop.map((p) => p[1]));
    const sorted = [...here].sort((a, b) => (a.frameKey && a.frameKey === b.frameKey ? top(a) - top(b) : 0));
    for (const a of sorted) {
      const k = a.frameKey || '';
      seen.set(k, (seen.get(k) || 0) + 1);
      nums.set(a.id, seen.get(k));
    }
    return nums;
  }

  // On a phone there's no room for a frame's notes beside it, so they're written out under it, in
  // the box the "listIn" setting names, with numbers that match the badges on the loops.
  let listsAt = 0;
  function syncLists(here, nums) {
    if (!cfg.listIn || innerWidth > PHONE) return;
    const t = performance.now();
    if (t - listsAt < 150) return; // a lightbox's copy of a frame shows up within a moment
    listsAt = t;
    document.documentElement.toggleAttribute('data-ink-off', mode === 'off');
    const groups = new Map();
    for (const a of here) {
      if (!a.frameKey) continue;
      if (!groups.has(a.frameKey)) groups.set(a.frameKey, []);
      groups.get(a.frameKey).push(a);
    }
    for (const f of document.querySelectorAll(FRAME)) {
      const box = f.closest(cfg.listIn);
      const list = groups.get(frameKey(f));
      if (!box || !list) continue;
      const rows = list.map((a) => [nums.get(a.id), a.note]).sort((a, b) => a[0] - b[0]);
      const sig = JSON.stringify(rows);
      let el = box.querySelector(':scope > .ink-list');
      if (!el) {
        el = document.createElement('ol');
        el.className = 'ink-list';
        el.setAttribute('aria-label', 'Notes on this design');
        box.append(el);
      }
      el.toggleAttribute('data-dark', root.hasAttribute('data-dark'));
      if (el.dataset.sig === sig) continue;
      el.dataset.sig = sig;
      el.replaceChildren(...rows.map(([n, note]) => {
        const li = document.createElement('li');
        const num = document.createElement('span');
        num.className = 'ink-list__num';
        num.setAttribute('aria-hidden', 'true');
        num.textContent = n;
        const text = document.createElement('span');
        text.textContent = note;
        li.append(num, text);
        return li;
      }));
    }
  }

  // The dock counts the notes and flags the lost ones; the server hears, so the checklist says too.
  let reported = null, reportTimer = 0;
  function showHealth(count, lost) {
    const label = dock.querySelector('.ink-count');
    const text = !count ? '' : lost.length ? `${count} · ${lost.length} lost` : `${count}`;
    if (label.textContent !== text) {
      label.textContent = text;
      label.dataset.lost = lost.length ? '1' : '';
      label.title = lost.length ? 'Notes whose target is gone: dashed on the page, hidden from visitors' : 'Notes on this page';
    }
    const state = lost.join();
    if (state === reported) return;
    reported = state;
    clearTimeout(reportTimer); // after a moment, so elements still mounting aren't reported
    reportTimer = setTimeout(() => {
      if (state === reported) fetch(`${API}/lost`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page, ids: lost }) }).catch(() => {});
    }, 2000);
  }

  // Follow the page every frame while visible: catches scroll, resize, fonts, and anything animating.
  function frame() {
    root.hidden = htmlMatches(cfg.hideWhen);
    const dark = htmlMatches(cfg.dark);
    root.toggleAttribute('data-dark', dark);
    dock.toggleAttribute('data-dark', dark);
    if (mode !== 'off' && !root.hidden && !document.hidden) render(false);
    requestAnimationFrame(frame);
  }

  function setMode(next) {
    mode = next;
    if (editable && mode !== 'draw') store.set('ink-mode', mode);
    root.dataset.mode = dock.dataset.mode = mode;
    render(true);
  }

  /* ---------- Drawing ---------- */
  let stroke = null;
  capture.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || composing) return;
    try { capture.setPointerCapture(e.pointerId); } catch {}
    stroke = [[e.clientX, e.clientY]];
    draft.setAttribute('d', '');
  });
  capture.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    const coalesced = e.getCoalescedEvents?.();
    for (const ev of coalesced?.length ? coalesced : [e]) {
      const [lx, ly] = stroke[stroke.length - 1];
      if (Math.hypot(ev.clientX - lx, ev.clientY - ly) >= 2.5) stroke.push([ev.clientX, ev.clientY]);
    }
    draft.setAttribute('d', pathOf(stroke.map(([x, y]) => [x + scrollX, y + scrollY])));
  });
  capture.addEventListener('pointerup', () => {
    if (!stroke) return;
    const pts = stroke;
    stroke = null;
    const b = bounds(pts);
    if (pts.length < 6 || Math.max(b.width, b.height) < 14) { draft.setAttribute('d', ''); return; }
    compose(pts);
  });

  // Note goes beside the loop: right if there is room, else left, else below.
  // In a frame it stays inside the frame, since anything outside is cut off.
  function notePlacement(b) {
    const f = frameAt(b);
    const area = f ? f.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const pad = f ? 16 : 8, w = Math.min(220, (area.right - area.left) * 0.4), gap = f ? 28 : 48;
    const y = Math.min(Math.max(area.top + pad, b.top + b.height / 2 - 14), area.bottom - 40);
    if (b.right + gap + w < area.right - pad) return [b.right + gap, y];
    if (b.left - gap - w > area.left + pad) return [b.left - gap - w, y];
    const x = Math.min(Math.max(area.left + pad, b.left), area.right - w - pad);
    return [x, b.bottom + 24 < area.bottom - 40 ? b.bottom + 24 : Math.max(area.top + pad, b.top - 48)];
  }

  let composing = false;
  function compose(pts) {
    composing = true;
    const b = bounds(pts);
    const [nx, ny] = notePlacement(b);
    // Placed in viewport terms, drawn in the page layer
    const note = h('div', 'ink-note is-editing is-draft', notes);
    note.style.transform = `translate(${nx + scrollX}px, ${ny + scrollY}px)`;
    const leader = h('svg:path', 'ink-leader', svg);
    leader.setAttribute('d', leaderPath(pts.map(([x, y]) => [x + scrollX, y + scrollY]), nx + scrollX, ny + scrollY, 160, 24));
    const text = h('span', 'ink-text', note);
    editText(text, '', async (value) => {
      composing = false;
      if (value) {
        const payload = capturePayload(pts, [nx, ny]);
        payload.page = page;
        payload.url = location.href;
        payload.note = value;
        payload.viewport = { w: innerWidth, h: innerHeight, scrollY: Math.round(scrollY) };
        try {
          const saved = await api('POST', null, strip(payload));
          items.push(saved);
          views.set(saved.id, Object.assign(viewFor(saved), { el: payload._anchor }));
          console.info('[ink] saved', saved);
        } catch (err) {
          console.warn('[ink] save failed', err);
        }
      }
      note.remove();
      leader.remove();
      draft.setAttribute('d', '');
      render(true);
    });
  }

  // Inline editor: Enter saves, Shift+Enter breaks a line, Esc cancels. Blur saves.
  function editText(text, initial, done) {
    const note = text.closest('.ink-note');
    note.classList.add('is-editing');
    text.contentEditable = 'plaintext-only';
    text.textContent = initial;
    text.dataset.placeholder = 'Note…';
    text.focus();
    getSelection().selectAllChildren(text); // editing: the old text starts selected, so typing replaces it
    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      text.contentEditable = 'false';
      note.classList.remove('is-editing');
      text.removeEventListener('keydown', onKey);
      text.removeEventListener('blur', onBlur);
      done(value);
    };
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(text.innerText.trim()); }
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    };
    const onBlur = () => finish(text.innerText.trim());
    text.addEventListener('keydown', onKey);
    text.addEventListener('blur', onBlur);
  }

  /* ---------- Edit, move, delete ---------- */
  const byId = (id) => items.find((a) => a.id === id);

  async function update(a, patch) {
    Object.assign(a, patch);
    try {
      Object.assign(a, await api('PUT', a.id, strip(patch)));
    } catch (err) {
      console.warn('[ink] update failed', err);
    }
    render(true);
  }

  notes.addEventListener('click', async (e) => {
    const badge = e.target.closest('.ink-badge');
    if (badge) {
      const open = sheetFor === badge.dataset.id;
      closeSheet();
      if (!open) openSheet(byId(badge.dataset.id));
      return;
    }
    if (!editable) return;
    const note = e.target.closest('.ink-note');
    const a = note && byId(note.dataset.id);
    if (!a) return;
    if (e.target.closest('.ink-x')) {
      items = items.filter((x) => x !== a);
      render(true);
      api('DELETE', a.id).catch((err) => console.warn('[ink] delete failed', err));
      return;
    }
    if (note.dataset.dragged) { delete note.dataset.dragged; return; }
    if (note.classList.contains('is-editing')) return;
    editText(note.querySelector('.ink-text'), a.note, (value) => {
      if (value === null || value === a.note) return render(true);
      if (!value) return render(true);
      update(a, { note: value });
    });
  });

  // Dragging a note moves only the note; dragging a loop moves the loop and re-reads what is under it.
  function drag(e, a, kind) {
    const v = views.get(a.id);
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    const target = kind === 'note' ? v.note : v.hit;
    try { target.setPointerCapture(e.pointerId); } catch {}
    const onMove = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      root.classList.add('is-dragging');
      if (kind === 'note') { a._nx = dx; a._ny = dy; } else { a._dx = dx; a._dy = dy; a._nx = dx; a._ny = dy; }
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      root.classList.remove('is-dragging');
      if (!moved) return;
      v.note.dataset.dragged = '1';
      setTimeout(() => delete v.note.dataset.dragged, 0);
      const r = anchorRect(a, v);
      const nm = v.note.getBoundingClientRect();
      const { _dx = 0, _dy = 0 } = a;
      delete a._dx; delete a._dy; delete a._nx; delete a._ny;
      if (kind === 'note') {
        update(a, { notePos: norm(nm.left, nm.top, r) });
      } else {
        const pts = a.loop.map((p) => denorm(p, r)).map(([x, y]) => [x + _dx, y + _dy]);
        const next = capturePayload(pts, [nm.left, nm.top]);
        v.el = next._anchor;
        update(a, strip(next));
      }
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  notes.addEventListener('pointerdown', (e) => {
    if (!editable) return;
    const note = e.target.closest('.ink-note');
    const a = note && byId(note.dataset.id);
    if (!a || e.button !== 0 || note.classList.contains('is-editing') || e.target.closest('.ink-x')) return;
    drag(e, a, 'note');
  });
  svg.addEventListener('pointerdown', (e) => {
    const a = e.target.classList.contains('ink-hit') && byId(e.target.dataset.id);
    if (!a || e.button !== 0) return;
    e.preventDefault();
    drag(e, a, 'loop');
  });

  /* ---------- Controls ---------- */
  dock.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'draw') setMode(mode === 'draw' ? 'view' : 'draw');
    if (act === 'eye') setMode(mode === 'off' ? 'view' : 'off');
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheetFor) { e.preventDefault(); return closeSheet(); }
    if (!editable) return;
    if (e.altKey && e.code === 'KeyA' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (e.shiftKey) setMode(mode === 'off' ? 'view' : 'off');
      else setMode(mode === 'draw' ? 'view' : 'draw');
    } else if (e.key === 'Escape' && mode === 'draw' && !composing) {
      e.preventDefault(); // so a page lightbox stays open
      setMode('view');
    }
  });

  // This page's notes: from the server when editing, otherwise the file ink.json lists for the page.
  // A page with none fetches nothing more.
  async function loadNotes() {
    let list = [];
    try {
      const r = editable
        ? await fetch(`${API}/annotations?page=${encodeURIComponent(page)}`, { cache: 'no-store' })
        : cfg.pages?.[page] && await fetch(inHome(`notes/${cfg.pages[page]}`));
      if (r && r.ok) list = await r.json();
    } catch {}
    // In page order, which is also the order they're numbered and read out
    return list.sort((a, b) => (a.box?.y ?? 0) - (b.box?.y ?? 0) || (a.box?.x ?? 0) - (b.box?.x ?? 0));
  }

  // The layer goes in the first time there's something to show
  let started = false;
  function start() {
    if (started) return;
    started = true;
    const css = h('link');
    css.rel = 'stylesheet';
    css.href = inHome('ink.css');
    document.head.append(css);
    document.body.append(root);
    if (editable) document.body.append(dock);
    setMode(mode === 'draw' ? 'view' : mode);
    frame();
  }

  // Single-page apps change page without reloading this script
  let routing = false;
  async function followRoute() {
    if (routing || pageKey() === page) return;
    routing = true;
    page = pageKey();
    closeSheet();
    items = await loadNotes();
    routing = false;
    if (items.length) start();
    if (started) render(true);
  }

  // The editor needs the notes server, and the server has to be this project's. Without it (the live
  // site, or a page on a plain local server) the saved notes are only drawn.
  async function boot() {
    try {
      const r = await fetch(inHome('ink.json'), local ? { cache: 'no-store' } : undefined);
      if (r.ok) cfg = await r.json();
    } catch {}
    if (cfg.frames) FRAME = `${cfg.frames}, ${FRAME}`;
    if (cfg.ignore) OWN = `${OWN}, ${cfg.ignore}`;
    page = pageKey();
    if (local && cfg.id) {
      const base = cfg.port ? `http://127.0.0.1:${cfg.port}/__ink` : '/__ink';
      try {
        const r = await fetch(`${base}/info`, { cache: 'no-store' });
        if (r.ok && (await r.json()).id === cfg.id) { API = base; editable = true; }
      } catch {}
    }
    if (!editable) {
      mode = 'view';
      root.dataset.readonly = '';
      capture.remove();
    }
    items = await loadNotes();
    if (editable || items.length) start();
    setInterval(followRoute, 400);
  }
  boot();
})();
