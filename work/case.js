/* Case study page: the hero phone and its camera → loading → results sequence, scaled media and reveals. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- Media canvases ----------
     Each canvas is the Figma frame at its true size; it scales to whatever width the column gives it. */
  const canvases = [...document.querySelectorAll('[data-canvas]')];
  for (const canvas of canvases) {
    const [w, h] = canvas.dataset.canvas.split('x').map(Number);
    canvas.style.aspectRatio = `${w} / ${h}`;
    const inner = canvas.querySelector('.canvas__inner');
    inner.style.width = `${w}px`;
    inner.style.height = `${h}px`;
    canvas.dataset.w = w;
  }
  const fitCanvas = (canvas) => canvas.style.setProperty('--fit', canvas.clientWidth / Number(canvas.dataset.w));
  canvases.forEach(fitCanvas);
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver((entries) => entries.forEach((e) => fitCanvas(e.target))) : null;
  canvases.forEach((c) => resizeObserver && resizeObserver.observe(c));

  /* ---------- Hero phone ----------
     The phone peeks up from the bottom of the first screen and stays in the page's normal flow, so
     scrolling is always the visitor's. It grows slightly as it rises, and once it's fully in view it
     runs through its screens by itself. */
  const hero = document.querySelector('.cs-hero');
  const holder = hero.querySelector('.cs-hero__device');
  const device = holder.querySelector('.device');
  const states = [...device.querySelectorAll('[data-state]')];

  const PEEK = 132;          // how much of the phone shows above the fold on arrival (design px)
  const START_SCALE = 0.885; // 355.7 / 402, from the design

  let fit = 1;
  let pad = 0; // the grey panel's padding around the phone
  function measure() {
    pad = parseFloat(getComputedStyle(holder).getPropertyValue('--pad')) || 0;
    fit = Math.min(1, (window.innerHeight - 150) / 874, (holder.clientWidth - 2 * pad) / 402);
    holder.style.setProperty('--fit', fit.toFixed(4));
    hero.style.setProperty('--peek', `${Math.round(pad + PEEK * fit)}px`);
  }

  // Growth follows how far the phone has risen into the window, eased a little each frame
  let target = 1;
  let current = 1;
  let ticking = false;
  const progress = () => clamp((window.innerHeight - holder.getBoundingClientRect().top - pad) / (874 * fit), 0, 1);
  const render = () => device.style.setProperty('--grow', (START_SCALE + (1 - START_SCALE) * smooth(current)).toFixed(4));
  function frame() {
    current += (target - current) * 0.14;
    if (Math.abs(target - current) < 0.0005) current = target;
    render();
    if (current !== target) requestAnimationFrame(frame);
    else ticking = false;
  }
  function onScroll() {
    target = progress();
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  /* ---------- Loading spinner (Lottie) ----------
     Each spinner plays only while it's on screen; the one in the phone also waits for its screen. */
  const spinners = window.lottie ? [...document.querySelectorAll('[data-lottie]')].map((el) => {
    const anim = lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: false, path: el.dataset.lottie });
    if (reduceMotion) anim.addEventListener('DOMLoaded', () => anim.goToAndStop(200, true)); // a still with the sparkles out
    return { el, anim, state: el.closest('.device__state'), visible: false };
  }) : [];
  function syncSpinner(spinner) {
    if (reduceMotion) return;
    const shown = spinner.visible && (!spinner.state || spinner.state.classList.contains('is-active'));
    if (shown) spinner.anim.play();
    else spinner.anim.pause();
  }
  if (spinners.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const spinner = spinners.find((s) => s.el === entry.target);
        spinner.visible = entry.isIntersecting;
        syncSpinner(spinner);
      });
    });
    spinners.forEach((s) => io.observe(s.el));
  }

  /* ---------- Loading status ----------
     The status line moves to the next message every few seconds; the phone's runs once, the
     screenshot's loops while it's on screen. */
  const STATUS_STEP = 2000;
  function statusCycler(el, loop) {
    const lines = [...el.querySelectorAll('.loading__line')];
    let index = 0;
    let timer;
    const show = (next) => {
      lines.forEach((line, i) => {
        line.classList.toggle('is-leaving', i === index && next !== index);
        line.classList.toggle('is-active', i === next);
        line.setAttribute('aria-hidden', String(i !== next));
      });
      index = next;
    };
    return {
      start() {
        clearInterval(timer);
        show(0);
        lines.forEach((line) => line.classList.remove('is-leaving'));
        timer = setInterval(() => {
          if (index === lines.length - 1 && !loop) { clearInterval(timer); return; }
          show((index + 1) % lines.length);
        }, STATUS_STEP);
      },
      stop() { clearInterval(timer); },
    };
  }
  const deviceStatus = statusCycler(device.querySelector('[data-status]'), false);
  const shotStatusEl = document.querySelector('.canvas__app--loading [data-status]');
  if (shotStatusEl && 'IntersectionObserver' in window) {
    const shotStatus = statusCycler(shotStatusEl, true);
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) shotStatus.start();
      else shotStatus.stop();
    }).observe(shotStatusEl);
  }

  /* ---------- Camera → loading → results ---------- */
  let sequenceStarted = false;
  function showState(name) {
    states.forEach((s) => s.classList.toggle('is-active', s.dataset.state === name));
    spinners.forEach((spinner) => {
      if (spinner.state && spinner.state.dataset.state === 'loading' && name === 'loading') spinner.anim.goToAndStop(0, true);
      syncSpinner(spinner);
    });
    if (name === 'loading') deviceStatus.start();
    else deviceStatus.stop();
    if (reduceMotion) return;
    const el = device.querySelector(`[data-state="${name}"]`);
    if (name === 'loading') {
      el.querySelector('.loading__message').animate(
        [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: 800, delay: 120, easing: EASE_OUT, fill: 'both' }
      );
    }
    if (name === 'results') {
      [el.querySelector('.results__intro'), ...el.querySelectorAll('.match'), el.querySelector('.app__footer')].forEach((node, i) => {
        node.animate(
          [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
          { duration: 800, delay: 140 + i * 70, easing: EASE_OUT, fill: 'both' }
        );
      });
    }
  }

  async function startSequence() {
    if (sequenceStarted) return;
    sequenceStarted = true;
    await wait(250); // a brief beat on the camera before the photo

    const camera = device.querySelector('[data-state="camera"]');
    if (!reduceMotion) {
      camera.querySelector('.camera__shutter').animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.86)', offset: 0.35 }, { transform: 'scale(1)' }],
        { duration: 360, easing: EASE_OUT }
      );
      camera.querySelector('.camera__photo').animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.015)', offset: 0.3 }, { transform: 'scale(1)' }],
        { duration: 520, easing: EASE_OUT }
      );
      await camera.querySelector('.camera__flash').animate(
        [{ opacity: 0 }, { opacity: 0.9, offset: 0.22 }, { opacity: 0 }],
        { duration: 560, easing: 'ease-out' }
      ).finished;
    }
    showState('loading');
    await wait(STATUS_STEP * 2 + 2000); // all three status messages, with a moment on the last
    showState('results');
  }

  /* ---------- Shopping list dataset ----------
     Each tile shows a different list from the dataset, picked at random on every visit: mostly
     handwritten, with a few digital screenshots mixed in. */
  const LIST_COUNT = 49; // assets/work/scan-your-list/lists/shopping-list-001.jpg to -049.jpg
  const DIGITAL = [2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 15, 17, 20, 27, 28, 29, 37, 40, 44, 45];
  const DIGITAL_TILES = 5;
  const tiles = [...document.querySelectorAll('.dataset span')];
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  const handwritten = Array.from({ length: LIST_COUNT }, (_, i) => i + 1).filter((n) => !DIGITAL.includes(n));
  const picks = shuffle([
    ...shuffle([...DIGITAL]).slice(0, DIGITAL_TILES),
    ...shuffle(handwritten).slice(0, tiles.length - DIGITAL_TILES),
  ]);
  tiles.forEach((tile, i) => {
    const img = document.createElement('img');
    img.src = `/assets/work/scan-your-list/lists/shopping-list-${String(picks[i]).padStart(3, '0')}.jpg`;
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    tile.append(img);
  });

  /* ---------- Live copies of a canvas ----------
     The lightbox and the explorations sheet both show copies of a canvas. A copy keeps scaling to
     wherever it's placed, and a loading screen keeps its spinner and status messages running. */
  function copyCanvas(canvas) {
    const copy = canvas.cloneNode(true);
    ['tabindex', 'role', 'aria-label'].forEach((attr) => copy.removeAttribute(attr));
    copy.classList.remove('is-expanded');
    return copy;
  }
  function liven(copy) {
    const running = [];
    if (resizeObserver) resizeObserver.observe(copy);
    copy.querySelectorAll('[data-lottie]').forEach((el) => {
      el.replaceChildren();
      if (window.lottie) running.push(lottie.loadAnimation({ container: el, renderer: 'svg', loop: true, autoplay: !reduceMotion, path: el.dataset.lottie }));
    });
    copy.querySelectorAll('[data-status]').forEach((el) => {
      const status = statusCycler(el, true);
      status.start();
      running.push(status);
    });
    return () => {
      if (resizeObserver) resizeObserver.unobserve(copy);
      running.forEach((item) => (item.destroy ? item.destroy() : item.stop()));
    };
  }

  /* ---------- Expand on click ---------- */
  canvases.forEach((canvas) => {
    const figure = canvas.closest('figure');
    const caption = canvas.dataset.caption || (figure && figure.querySelector('figcaption').textContent) || '';
    let release = null;
    window.lightbox.attach(canvas, {
      caption,
      radius: () => 40 * Number(canvas.style.getPropertyValue('--fit') || 1),
      art: () => copyCanvas(canvas),
      onOpen: (copy) => { release = liven(copy); },
      onClose: () => { if (release) release(); release = null; },
    });
  });

  /* ---------- See what I explored ----------
     Opens a sheet: the section's screen as the hero, then the notes and explorations from its template. */
  document.querySelectorAll('[data-explore]').forEach((button) => {
    const template = document.getElementById(button.dataset.explore);
    const canvas = button.closest('.cs-section').querySelector('.canvas');
    button.addEventListener('click', () => {
      const content = document.createElement('div');
      const hero = document.createElement('div');
      hero.className = 'explore__hero';
      const copy = copyCanvas(canvas);
      hero.append(copy);
      content.append(hero, template.content.cloneNode(true));
      const release = liven(copy);
      window.sheet.open({ content, label: template.dataset.label, onClose: release });
    });
  });

  /* ---------- Section reveals ---------- */
  function observeReveals() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }

  // Start the sequence once the whole phone is on screen, wherever the visitor scrolls from
  function observeDevice() {
    if (!('IntersectionObserver' in window)) { startSequence(); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      startSequence();
    }, { threshold: 0.98 });
    io.observe(device);
  }

  /* ---------- Start (after the password gate, if it was shown) ---------- */
  function start() {
    measure();
    if (!reduceMotion) {
      target = current = progress();
      render();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', () => { measure(); if (!reduceMotion) onScroll(); });
    if (!reduceMotion) {
      // Title and phone settle in when the page opens
      const intro = document.querySelector('.cs-hero__intro');
      intro.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 1000, easing: EASE_OUT });
      device.animate(
        [{ opacity: 0, translate: '0 60px', scale: '0.94' }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: 1200, delay: 150, easing: EASE_OUT, fill: 'backwards' }
      );
    }
    observeDevice();
    observeReveals();
  }

  if (!root.classList.contains('case-locked')) start();
  else document.addEventListener('case:unlocked', start, { once: true });
})();
