/* AI-assisted search results: the title and the hero settle in when the page opens, and later
   sections rise in as they come into view. The hero is a promo of the H-E-B home page: while it's
   on screen, the view zooms into the empty search bar, types a search like a shopper would, holds,
   then zooms back out and starts over. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const QUERY = 'healthy snacks for a hike';
  const intro = document.querySelector('.cs-hero__intro');
  const media = document.querySelector('.cs-hero__media');

  /* ---------- Stage: built at its design size, scaled to the column ---------- */
  const [stageWidth] = media.dataset.stage.split('x').map(Number);
  const fit = () => media.style.setProperty('--fit', media.clientWidth / stageWidth);
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(media);
  else window.addEventListener('resize', fit);

  /* ---------- Promo: zoom in, type the search, zoom out ---------- */
  const browser = media.querySelector('.browser');
  const heb = media.querySelector('.heb');
  const query = media.querySelector('[data-query]');
  let run = 0;
  let timers = [];
  const wait = (ms) => new Promise((resolve) => timers.push(setTimeout(resolve, ms)));
  const reset = () => {
    browser.classList.remove('is-zoomed');
    heb.classList.remove('is-typing', 'has-query');
    query.textContent = '';
  };
  async function loop(id) {
    while (id === run) {
      await wait(1200); if (id !== run) return;
      browser.classList.add('is-zoomed');
      await wait(1100); if (id !== run) return;
      heb.classList.add('is-typing');
      await wait(600); if (id !== run) return;
      heb.classList.add('has-query');
      for (const char of QUERY) {
        query.textContent += char;
        // A little uneven, like real typing, with a beat between words
        await wait(char === ' ' ? 140 : 55 + Math.random() * 60); if (id !== run) return;
      }
      await wait(2200); if (id !== run) return;
      browser.classList.remove('is-zoomed');
      heb.classList.remove('is-typing');
      await wait(1200); if (id !== run) return;
      heb.classList.remove('has-query');
      query.textContent = '';
    }
  }
  const promo = {
    start() {
      if (reduceMotion) return;
      run++;
      timers.forEach(clearTimeout);
      timers = [];
      reset();
      loop(run);
    },
    stop() {
      run++;
      timers.forEach(clearTimeout);
      timers = [];
      reset();
    },
  };

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
    fit();
    if (!reduceMotion) {
      intro.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 1000, easing: EASE_OUT });
      media.animate(
        [{ opacity: 0, translate: '0 60px', scale: '0.97' }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: 1200, delay: 150, easing: EASE_OUT, fill: 'backwards' }
      );
    }
    // The promo plays while most of the hero is on screen, and starts over each time it comes back
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) promo.start();
        else promo.stop();
      }, { threshold: 0.6 }).observe(media);
    }
    observeReveals();
  }

  if (!root.classList.contains('case-locked')) start();
  else document.addEventListener('case:unlocked', start, { once: true });
})();
