/* AI-assisted search results: the title and the hero settle in when the page opens, and later
   sections rise in as they come into view. The hero is a promo of the H-E-B home page: while it's
   on screen, the view zooms into the empty search bar and types a search like a shopper would. The
   search is sent, the camera pulls back, and the results page slides in: each AI-generated section
   writes its heading over a skeleton row, the products fill in, and the view moves down through
   them while the shopper adds three items to the cart, before it all starts over. */
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
  const searchIcon = media.querySelector('.heb-search__icon');
  const results = media.querySelector('.heb-results');
  const shelves = [...media.querySelectorAll('.heb-shelf')];
  const tap = media.querySelector('.heb-tap');
  const cartTotal = media.querySelector('.heb-cart__total');
  const cartCount = media.querySelector('.heb-cart__count');
  const page = media.querySelector('.heb-results__page');
  const CART = { total: 9.28, count: 2 };
  // What the shopper adds: [section, product] in each of the first three sections
  const PICKS = [[0, 0], [1, 2], [2, 1]];
  const ICON_TRASH = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 4.5h12M7 4.5V3h4v1.5M4.5 4.5l.75 10.5h7.5l.75-10.5M7.5 7.5v4.5M10.5 7.5v4.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_PLUS = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12M9 3v12" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>';
  let run = 0;
  let timers = [];
  const wait = (ms) => new Promise((resolve) => timers.push(setTimeout(resolve, ms)));
  const reset = () => {
    browser.classList.remove('is-zoomed');
    heb.classList.remove('is-typing', 'has-query', 'has-results');
    searchIcon.classList.remove('is-pressed');
    query.textContent = '';
    // Clear the results instantly, so the next run starts from the top
    results.classList.add('is-resetting');
    page.style.setProperty('--drift', 0);
    tap.classList.remove('is-visible', 'is-pressing');
    media.querySelectorAll('.heb-result__button').forEach((button) => {
      button.classList.remove('is-pressed', 'is-loading', 'is-added');
      button.textContent = 'Add to cart';
    });
    cartTotal.textContent = `$${CART.total.toFixed(2)}`;
    cartCount.textContent = CART.count;
    shelves.forEach((shelf) => {
      shelf.classList.remove('is-shown', 'is-writing', 'is-filled');
      shelf.querySelector('[data-heading]').textContent = '';
    });
    void results.offsetWidth;
    results.classList.remove('is-resetting');
  };
  // Scrolls the results so a section sits just under the header
  const scrollTo = (shelf) => page.style.setProperty('--drift', Math.max(0, shelf.offsetTop - 24));
  // Places the finger on an element, in the page's own (unscaled) coordinates
  const aim = (el) => {
    const box = heb.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const scale = box.width / heb.offsetWidth || 1;
    tap.style.left = `${(r.left + r.width / 2 - box.left) / scale}px`;
    tap.style.top = `${(r.top + r.height / 2 - box.top) / scale}px`;
  };
  // Taps Add to cart: a press, a moment of loading, then a stepper (remove, count, add) and an updated cart
  async function addToCart(button, cart, id) {
    aim(button);
    tap.classList.add('is-visible');
    await wait(450); if (id !== run) return;
    tap.classList.add('is-pressing');
    button.classList.add('is-pressed');
    await wait(180); if (id !== run) return;
    tap.classList.remove('is-pressing', 'is-visible');
    button.classList.remove('is-pressed');
    button.classList.add('is-loading');
    await wait(550); if (id !== run) return;
    button.classList.remove('is-loading');
    button.classList.add('is-added');
    button.innerHTML = `<span class="heb-step">${ICON_TRASH}</span><span class="heb-step__count">1 added</span><span class="heb-step">${ICON_PLUS}</span>`;
    const price = parseFloat(button.closest('.heb-result').querySelector('.heb-result__price').textContent.replace('$', ''));
    cart.total += price;
    cart.count += 1;
    cartTotal.textContent = `$${cart.total.toFixed(2)}`;
    cartCount.textContent = cart.count;
    cartCount.classList.remove('is-bumping');
    void cartCount.offsetWidth;
    cartCount.classList.add('is-bumping');
  }
  // Writes a section heading a letter at a time
  async function write(shelf, id) {
    const heading = shelf.querySelector('[data-heading]');
    shelf.classList.add('is-shown', 'is-writing');
    for (const char of heading.dataset.heading) {
      heading.textContent += char;
      await wait(38); if (id !== run) return;
    }
    shelf.classList.remove('is-writing');
  }
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
      // Send the search, then pull back as the results page slides in
      await wait(700); if (id !== run) return;
      searchIcon.classList.add('is-pressed');
      await wait(180); if (id !== run) return;
      searchIcon.classList.remove('is-pressed');
      heb.classList.remove('is-typing');
      browser.classList.remove('is-zoomed');
      await wait(250); if (id !== run) return;
      heb.classList.add('has-results');
      await wait(900); if (id !== run) return;
      // The sections write in one by one over skeleton rows, then fill with products
      for (const shelf of shelves) {
        await write(shelf, id); if (id !== run) return;
        await wait(220); if (id !== run) return;
      }
      await wait(500); if (id !== run) return;
      for (const shelf of shelves) {
        shelf.classList.add('is-filled');
        await wait(350); if (id !== run) return;
      }
      // Browse down through the sections, adding one item from each of the first three
      await wait(900); if (id !== run) return;
      const cart = { ...CART };
      for (const [section, product] of PICKS) {
        if (section > 0) {
          scrollTo(shelves[section]);
          await wait(1900); if (id !== run) return;
        }
        const button = shelves[section].querySelectorAll('.heb-result__button')[product];
        await addToCart(button, cart, id); if (id !== run) return;
        await wait(900); if (id !== run) return;
      }
      scrollTo(shelves[shelves.length - 1]);
      await wait(3600); if (id !== run) return;
      heb.classList.remove('has-results', 'has-query');
      await wait(800); if (id !== run) return;
      reset();
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
  // The hero waits for the web fonts (at most 800ms) so its text fades in once, in the right face
  function whenFontsLoad(done) {
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 800))]).then(done);
  }

  function start() {
    fit();
    whenFontsLoad(() => {
      root.classList.add('cs-ready');
      if (reduceMotion) return;
      intro.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 1000, easing: EASE_OUT });
      media.animate(
        [{ opacity: 0, translate: '0 60px', scale: '0.97' }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: 1200, delay: 150, easing: EASE_OUT, fill: 'backwards' }
      );
    });
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
