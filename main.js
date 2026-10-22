(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const EASE_IN_OUT = 'cubic-bezier(0.76, 0, 0.24, 1)';

  // Intro timing (ms)
  const LETTER_DURATION = 900;
  const LETTER_STAGGER = 90;
  const HOLD = 200;
  const CURTAIN_DURATION = 1300;
  const CONTENT_OFFSET = 520; // content starts this long after the curtain begins

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- Theme ---------- */
  const toggle = document.querySelector('.theme-toggle');
  const options = [...toggle.querySelectorAll('[data-theme-value]')];
  let transitionTimer;

  function syncToggle() {
    options.forEach((btn) => {
      const active = btn.dataset.themeValue === root.dataset.theme;
      btn.setAttribute('aria-checked', String(active));
      btn.tabIndex = active ? 0 : -1;
    });
  }

  function setTheme(theme) {
    if (theme === root.dataset.theme) return;
    if (!reduceMotion) {
      root.classList.add('theme-transition');
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 650);
    }
    root.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch (e) {}
    syncToggle();
  }

  options.forEach((btn) => btn.addEventListener('click', () => setTheme(btn.dataset.themeValue)));
  toggle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    toggle.querySelector(`[data-theme-value="${next}"]`).focus();
  });
  syncToggle();

  /* ---------- Headline word split ---------- */
  const title = document.querySelector('[data-split]');
  const words = title.textContent.trim().split(/\s+/);
  title.setAttribute('aria-label', title.textContent.trim());
  title.innerHTML = words
    .map((word) => `<span class="split-mask" aria-hidden="true"><span class="split-word">${word}</span></span>`)
    .join(' ');
  const wordEls = [...title.querySelectorAll('.split-word')];

  /* ---------- Case study scroll reveals ---------- */
  const cases = [...document.querySelectorAll('.case')];
  cases.forEach((item) => [...item.children].forEach((child, i) => child.style.setProperty('--i', i)));

  let observing = false;
  function observeCases() {
    if (observing) return;
    observing = true;
    if (!('IntersectionObserver' in window)) {
      cases.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    cases.forEach((item) => observer.observe(item));
  }

  /* ---------- Image lightbox ---------- */
  const LIGHTBOX_OPEN = { duration: 640, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
  const LIGHTBOX_CLOSE = { duration: 480, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' };
  const THUMB_RADIUS = 6;

  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <div class="lightbox__backdrop"></div>
    <div class="lightbox__frame"></div>
    <p class="lightbox__caption"></p>
    <button type="button" class="lightbox__close" aria-label="Close image"></button>`;
  document.body.append(lightbox);
  const lbBackdrop = lightbox.querySelector('.lightbox__backdrop');
  const lbFrame = lightbox.querySelector('.lightbox__frame');
  const lbCaption = lightbox.querySelector('.lightbox__caption');
  const lbClose = lightbox.querySelector('.lightbox__close');

  let active = null; // { media, ratio }
  let busy = false;

  const isSmall = () => window.innerWidth <= 640;
  const lightboxRadius = () => (isSmall() ? 0 : 10);

  // Copies the artwork currently on screen (phones and desktop show different crops).
  function buildArt(media) {
    const art = [...media.querySelectorAll('.case__art')].find((el) => el.getClientRects().length);
    const thumb = media.getBoundingClientRect();
    return {
      node: art.cloneNode(true),
      ratio: thumb.width / thumb.height,
    };
  }

  // Largest rect at the artwork's proportions that fits the viewport, leaving room for the close button and caption.
  function fittedRect({ ratio }) {
    const padX = isSmall() ? 0 : 24;
    const padTop = 68;
    const padBottom = 60;
    let width = window.innerWidth - padX * 2;
    let height = width / ratio;
    const availH = window.innerHeight - padTop - padBottom;
    if (height > availH) { height = availH; width = height * ratio; }
    return { left: (window.innerWidth - width) / 2, top: padTop + (availH - height) / 2, width, height };
  }

  const toFrame = (rect, radius) => ({
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    borderRadius: `${radius}px`,
  });

  function placeFrame(rect) {
    Object.assign(lbFrame.style, toFrame(rect, lightboxRadius()));
    lbCaption.style.top = `${rect.top + rect.height + 20}px`;
  }

  function lockScroll(lock) {
    if (lock) root.style.setProperty('--scrollbar-width', `${window.innerWidth - root.clientWidth}px`);
    root.classList.toggle('is-locked', lock);
  }

  async function openLightbox(media) {
    if (busy || active) return;
    busy = true;

    const built = buildArt(media);
    active = { media, ...built };
    lbFrame.replaceChildren(built.node);
    lbCaption.textContent = media.closest('.case').querySelector('.case__title').textContent;
    lightbox.setAttribute('aria-label', lbCaption.textContent);

    const thumb = media.getBoundingClientRect();
    const rect = fittedRect(active);
    // Let the copy pick its file for the enlarged size, not the thumbnail's.
    built.node.querySelectorAll('img[srcset]').forEach((img) => { img.sizes = `${Math.round(rect.width)}px`; });
    lockScroll(true);
    lightbox.hidden = false;
    placeFrame(rect);
    media.classList.add('is-expanded');

    if (!reduceMotion) {
      const opening = [
        lbFrame.animate([toFrame(thumb, THUMB_RADIUS), toFrame(rect, lightboxRadius())], LIGHTBOX_OPEN),
        lbBackdrop.animate([{ opacity: 0 }, { opacity: 1 }], { ...LIGHTBOX_OPEN, duration: 420 }),
        lbCaption.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { ...LIGHTBOX_OPEN, delay: 260 }),
        lbClose.animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }],
          { ...LIGHTBOX_OPEN, delay: 200 }),
      ];
      await Promise.all(opening.map((a) => a.finished));
      // End states match the inline styles and CSS, so hand control back to them (e.g. the close button's hover).
      opening.forEach((a) => a.cancel());
    }

    lbClose.focus({ preventScroll: true });
    busy = false;
  }

  async function closeLightbox() {
    if (busy || !active) return;
    busy = true;
    const { media } = active;

    if (!reduceMotion) {
      const thumb = media.getBoundingClientRect();
      const fadeOut = { ...LIGHTBOX_CLOSE, duration: 300 };
      const closing = [
        lbFrame.animate([toFrame(fittedRect(active), lightboxRadius()), toFrame(thumb, THUMB_RADIUS)], LIGHTBOX_CLOSE),
        lbBackdrop.animate([{ opacity: 1 }, { opacity: 0 }], LIGHTBOX_CLOSE),
        lbCaption.animate([{ opacity: 1 }, { opacity: 0 }], fadeOut),
        lbClose.animate([{ opacity: 1 }, { opacity: 0 }], fadeOut),
      ];
      await closing[0].finished;
      closing.forEach((a) => a.cancel());
    }

    media.classList.remove('is-expanded');
    lightbox.hidden = true;
    lbFrame.replaceChildren();
    lockScroll(false);
    active = null;
    busy = false;
    media.focus({ preventScroll: true });
  }

  document.querySelectorAll('.case__media').forEach((media) => {
    const title = media.closest('.case').querySelector('.case__title').textContent;
    media.tabIndex = 0;
    media.setAttribute('role', 'button');
    media.setAttribute('aria-label', `Expand image: ${title}`);
    media.addEventListener('click', () => openLightbox(media));
    media.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openLightbox(media);
    });
  });

  lightbox.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (event.key === 'Escape') closeLightbox();
    if (event.key === 'Tab') { event.preventDefault(); lbClose.focus(); } // only one control to focus
  });
  window.addEventListener('resize', () => {
    if (active && !busy) placeFrame(fittedRect(active));
  });

  /* ---------- Landing content entrance ---------- */
  function animateContent() {
    const animations = [];

    wordEls.forEach((word, i) => {
      animations.push(word.animate(
        // Start fully below the mask's extended clip area.
        [{ transform: 'translateY(130%)' }, { transform: 'translateY(0)' }],
        { duration: 1100, delay: i * 45, easing: EASE_OUT, fill: 'both' }
      ));
    });

    const riseIn = [
      { opacity: 0, transform: 'translateY(16px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ];
    document.querySelectorAll('[data-reveal]').forEach((el, i) => {
      animations.push(el.animate(riseIn, { duration: 1000, delay: 320 + i * 120, easing: EASE_OUT, fill: 'both' }));
    });

    animations.push(toggle.animate(
      [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 900, delay: 200, easing: EASE_OUT, fill: 'both' }
    ));

    // Release the fill so later hover / theme transitions own these properties again.
    Promise.all(animations.map((a) => a.finished)).then(() => {
      animations.forEach((a) => a.cancel());
    });

    setTimeout(observeCases, 450);
  }

  /* ---------- Pre-loader ---------- */
  const preloader = document.querySelector('.preloader');
  const sky = document.querySelector('.preloader__sky');
  const clouds = document.querySelector('.preloader__clouds');
  const introName = document.querySelector('.intro-name');
  const letters = [...introName.children];
  const wordmark = document.querySelector('.wordmark');

  function finish() {
    root.classList.remove('is-loading');
  }

  const imageReady = clouds.complete
    ? Promise.resolve()
    : new Promise((resolve) => { clouds.onload = clouds.onerror = resolve; });
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const assetsReady = Promise.race([Promise.all([imageReady, fontsReady]), wait(2500)]);

  // Measure the scrollbar the page will get after the intro, so the locked layout can match it.
  root.classList.remove('is-loading');
  root.style.setProperty('--scrollbar-width', `${window.innerWidth - root.clientWidth}px`);
  root.classList.add('is-loading');

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  async function intro() {
    await assetsReady;

    if (reduceMotion || !introName.animate) {
      finish();
      observeCases();
      return;
    }

    // Centre the large name in the viewport.
    const startX = (window.innerWidth - introName.offsetWidth) / 2;
    const startY = (window.innerHeight - introName.offsetHeight) / 2;
    const start = `translate(${startX}px, ${startY}px) scale(1)`;
    introName.style.transform = start;

    // 1. Letters stagger into view.
    const letterAnims = letters.map((letter, i) => letter.animate(
      [
        { opacity: 0, transform: 'translateY(35%)', filter: 'blur(10px)' },
        { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
      ],
      { duration: LETTER_DURATION, delay: 120 + i * LETTER_STAGGER, easing: EASE_OUT, fill: 'both' }
    ));
    await Promise.all(letterAnims.map((a) => a.finished));

    // 2. Brief pause.
    await wait(HOLD);

    // 3. Curtain lifts while the name travels into the header.
    const target = wordmark.getBoundingClientRect();
    const scale = parseFloat(getComputedStyle(wordmark).fontSize) / parseFloat(getComputedStyle(introName).fontSize);
    const end = `translate(${target.left}px, ${target.top}px) scale(${scale})`;
    const endColor = getComputedStyle(wordmark).color;

    const curtain = { duration: CURTAIN_DURATION, easing: EASE_IN_OUT, fill: 'forwards' };
    preloader.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], curtain);
    sky.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(35%)' }], curtain);
    const travel = introName.animate(
      [
        { transform: start, color: getComputedStyle(introName).color },
        { transform: end, color: endColor },
      ],
      curtain
    );

    // 4. Landing content follows the curtain.
    setTimeout(animateContent, CONTENT_OFFSET);

    await travel.finished;
    // The intro name now sits exactly on the header wordmark: swap them.
    finish();
  }

  intro().catch(finish);
  // Never leave the page locked if something goes wrong.
  setTimeout(() => {
    if (root.classList.contains('is-loading')) { finish(); observeCases(); }
  }, 8000);
})();
