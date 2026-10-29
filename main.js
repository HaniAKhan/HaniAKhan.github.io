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

  // Theme switching lives in site.js; the toggle is animated in during the entrance.
  const toggle = document.querySelector('.theme-toggle');

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

  /* ---------- Image lightbox (shared, in site.js) ---------- */
  document.querySelectorAll('.case__media').forEach((media) => {
    window.lightbox.attach(media, {
      caption: media.closest('.case').querySelector('.case__title').textContent.trim(),
      radius: () => 6,
      // Copies the artwork currently on screen (phones and desktop show different crops).
      art: () => [...media.querySelectorAll('.case__art')].find((el) => el.getClientRects().length).cloneNode(true),
    });
  });

  /* ---------- Landing content entrance ---------- */
  function animateContent() {
    const animations = [];

    wordEls.forEach((word, i) => {
      animations.push(word.animate(
        // Start fully below the mask's extended clip area.
        [{ transform: 'translateY(145%)' }, { transform: 'translateY(0)' }],
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
  const skyImage = document.querySelector('.preloader__image');
  const introName = document.querySelector('.intro-name');
  const letters = [...introName.children];
  const wordmark = document.querySelector('.wordmark');

  function finish() {
    root.classList.remove('is-loading');
  }

  // The sky is a CSS background picked by theme; load the same URL to know when it's ready.
  const skyUrl = (getComputedStyle(skyImage).backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1];
  const imageReady = !skyUrl ? Promise.resolve() : new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = skyUrl;
  });
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const assetsReady = Promise.race([Promise.all([imageReady, fontsReady]), wait(2500)]);

  // Measure the scrollbar the page will get after the intro, so the locked layout can match it.
  root.classList.remove('is-loading');
  root.style.setProperty('--scrollbar-width', `${window.innerWidth - root.clientWidth}px`);
  root.classList.add('is-loading');

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // The intro plays once per visit; coming back from a case study shows the page straight away.
  const INTRO_KEY = 'intro-played';
  const introPlayed = (() => { try { return sessionStorage.getItem(INTRO_KEY) === '1'; } catch (e) { return false; } })();

  async function intro() {
    if (introPlayed) {
      finish();
      observeCases();
      return;
    }
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
    try { sessionStorage.setItem(INTRO_KEY, '1'); } catch (e) {}
  }

  intro().catch(finish);
  // Never leave the page locked if something goes wrong.
  setTimeout(() => {
    if (root.classList.contains('is-loading')) { finish(); observeCases(); }
  }, 8000);
})();
