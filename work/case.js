/* Case study page: the hero phone and its camera → loading → results sequence, scaled media and reveals. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
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
     The phone stays in the page's normal flow, so scrolling is always the visitor's. It's sized to fit
     the window, eases in, and runs through its screens by itself once enough of it is in view. */
  const holder = document.querySelector('.cs-hero__device');
  const device = holder.querySelector('.device');
  const states = [...device.querySelectorAll('[data-state]')];

  function measure() {
    const fit = Math.min(1, (window.innerHeight - 150) / 874, (window.innerWidth - 48) / 402);
    holder.style.setProperty('--fit', fit.toFixed(4));
  }

  /* ---------- Camera → loading → results ---------- */
  let sequenceStarted = false;
  function showState(name) {
    states.forEach((s) => s.classList.toggle('is-active', s.dataset.state === name));
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
    await wait(700); // a beat on the camera before the photo

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
    await wait(5000);
    showState('results');
  }

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

  // Start the sequence once most of the phone is on screen, wherever the visitor scrolls from
  function observeDevice() {
    if (!('IntersectionObserver' in window)) { startSequence(); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      startSequence();
    }, { threshold: 0.6 });
    io.observe(device);
  }

  /* ---------- Start (after the password gate, if it was shown) ---------- */
  function start() {
    measure();
    window.addEventListener('resize', measure);
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
