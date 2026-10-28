/* Case study page: scroll-driven phone, the camera → loading → results sequence, scaled media and reveals. */
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

  /* ---------- Hero phone ---------- */
  const hero = document.querySelector('.cs-hero');
  const intro = document.querySelector('.cs-hero__intro');
  const device = document.querySelector('.device');
  const states = [...device.querySelectorAll('[data-state]')];

  const GROW = 0.9;          // viewport heights of scrolling to rise and reach full size
  const PEEK = 132;          // how much of the phone peeks above the fold at the start (design px)
  const START_SCALE = 0.885; // 355.7 / 402, from the design

  let vw, vh, fit, startY, endY;
  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    fit = Math.min(1, (vh - 150) / 874, (vw - 48) / 402);
    endY = (vh - 874 * fit) / 2;
    startY = vh - PEEK * fit;
  }

  let target = 0;
  let current = 0;
  let ticking = false;

  function render(p) {
    const e = smooth(p);
    const scale = fit * (START_SCALE + (1 - START_SCALE) * e);
    const y = startY + (endY - startY) * e;
    device.style.transform = `translate(-50%, ${y}px) scale(${scale})`;
    intro.style.transform = `translate(-50%, calc(-50% - ${e * vh * 0.61}px))`;
    intro.style.opacity = String(1 - clamp((p - 0.45) / 0.4, 0, 1));
  }

  // Scroll sets a target; the phone eases toward it every frame, so wheel steps glide instead of jump.
  function frame() {
    current += (target - current) * (reduceMotion ? 1 : 0.14);
    if (Math.abs(target - current) < 0.0005) current = target;
    render(current);
    if (current >= 0.995) startSequence();
    if (current !== target) requestAnimationFrame(frame);
    else ticking = false;
  }
  function onScroll() {
    target = clamp(-hero.getBoundingClientRect().top / (vh * GROW), 0, 1);
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
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
    await wait(900); // let the phone settle before the photo

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

  /* ---------- Start (after the password gate, if it was shown) ---------- */
  function start() {
    measure();
    target = current = clamp(-hero.getBoundingClientRect().top / (vh * GROW), 0, 1);
    render(current);
    if (!reduceMotion) {
      // Title and phone settle in when the page opens
      intro.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 1000, easing: EASE_OUT });
      device.animate([{ opacity: 0, translate: '0 60px' }, { opacity: 1, translate: '0 0' }], { duration: 1200, delay: 150, easing: EASE_OUT, fill: 'backwards' });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { measure(); onScroll(); render(current); });
    observeReveals();
  }

  if (!root.classList.contains('case-locked')) start();
  else document.addEventListener('case:unlocked', start, { once: true });
})();
