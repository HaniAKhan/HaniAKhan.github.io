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
  const media = document.querySelector('[data-stage]');

  /* ---------- Stage: built at its design size, scaled to the column ---------- */
  const [stageWidth] = media.dataset.stage.split('x').map(Number);
  const fit = () => media.style.setProperty('--fit', media.clientWidth / stageWidth);
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(media);
  else window.addEventListener('resize', fit);

  /* ---------- Section canvases: drawn at their design size, scaled to their column ---------- */
  document.querySelectorAll('.cs-section .canvas[data-canvas]').forEach((canvas) => {
    const [w, h] = canvas.dataset.canvas.split('x').map(Number);
    canvas.style.aspectRatio = `${w} / ${h}`;
    const inner = canvas.querySelector('.canvas__inner');
    inner.style.width = `${w}px`;
    inner.style.height = `${h}px`;
    const fitCanvas = () => canvas.style.setProperty('--fit', canvas.clientWidth / w);
    fitCanvas();
    if ('ResizeObserver' in window) new ResizeObserver(fitCanvas).observe(canvas);
    else window.addEventListener('resize', fitCanvas);
  });

  /* ---------- Concept demo: the iframe takes the height of the page inside it ---------- */
  const demoFrame = document.querySelector('.cs-demo__frame');
  if (demoFrame) {
    demoFrame.addEventListener('load', () => {
      const doc = demoFrame.contentDocument;
      if (!doc) return;
      const size = () => { demoFrame.style.height = `${doc.documentElement.scrollHeight}px`; };
      size();
      if ('ResizeObserver' in window) new ResizeObserver(size).observe(doc.body);
    });
  }

  /* ---------- Carousels: smooothy, nudged forward every frame so they drift on their own ---------- */
  // They pause while hovered or touched and pick up again after; on phones and with reduced motion they only move when dragged
  const CAROUSEL_SPEED = 0.12; // slides per second
  const phone = window.matchMedia('(max-width: 640px)'); // notes sit under the slides there, so they hold still to be read
  function startCarousels() {
    const tracks = document.querySelectorAll('[data-carousel]');
    if (!tracks.length) return;
    import('/assets/vendor/smooothy-0.0.35.esm.js').then(({ default: Slider }) => {
      tracks.forEach((track) => {
        // A phone shows one whole slide at a time, so a swipe settles squarely on the next one
        const slider = new Slider(track, { infinite: true, snap: phone.matches });
        let held = false;
        let resume = 0;
        const hold = () => { clearTimeout(resume); held = true; };
        const release = (delay) => { clearTimeout(resume); resume = setTimeout(() => { held = false; }, delay); };
        track.addEventListener('mouseenter', hold);
        track.addEventListener('mouseleave', () => release(0));
        track.addEventListener('touchstart', hold, { passive: true });
        track.addEventListener('touchend', () => release(2000));
        // A tap (not a drag) on a frame opens it large; the carousel waits until it's put back
        let open = false;
        let down = null;
        track.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
        track.addEventListener('click', (e) => {
          const frame = e.target.closest('.cs-carousel__frame');
          if (!frame || open || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
          open = true;
          expandFrame(frame).then(() => { open = false; });
        });
        track.querySelectorAll('.cs-carousel__frame').forEach((frame) => {
          frame.tabIndex = 0;
          frame.setAttribute('role', 'button');
          frame.setAttribute('aria-label', `Expand: ${frame.querySelector('img')?.alt || 'design'}`);
          frame.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !open) {
              e.preventDefault();
              open = true;
              expandFrame(frame).then(() => { open = false; frame.focus(); });
            }
          });
        });
        const tick = () => {
          // deltaTime jumps after the carousel was off screen, so it's capped
          if (!reduceMotion && !phone.matches && !held && !open && slider.isVisible && !slider.isDragging) {
            slider.target -= CAROUSEL_SPEED * Math.min(slider.deltaTime, 0.05);
          }
          slider.update();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });
  }

  /* ---------- Lightbox: tap a design to see it large ---------- */
  // The wash behind an opened design
  function makeShade(label) {
    const shade = document.createElement('div');
    shade.className = 'cs-lightbox';
    shade.setAttribute('role', 'dialog');
    shade.setAttribute('aria-modal', 'true');
    shade.setAttribute('aria-label', label);
    document.body.append(shade);
    return shade;
  }
  // The largest box of this shape that fits the middle of the screen
  function fitBox(ratio, maxWidth) {
    let w = Math.min(innerWidth * 0.92, maxWidth);
    let h = w / ratio;
    if (h > innerHeight * 0.86) { h = innerHeight * 0.86; w = h * ratio; }
    return { w, h, left: (innerWidth - w) / 2, top: (innerHeight - h) / 2 };
  }

  function stackedBox(from, shot) {
    const w = innerWidth * 0.92 * (from.width / shot.width);
    const h = w * (from.height / from.width);
    return { w, h, left: (innerWidth - w) / 2, top: 16 - (shot.top - from.top) * (w / from.width) };
  }

  // The frame grows out of its slide into the middle of the screen, and shrinks back to wherever
  // its slide is when closed. It's a copy: the slide keeps its place, and the original hides meanwhile.
  function expandFrame(frame) {
    return new Promise((resolve) => {
      const from = frame.getBoundingClientRect();
      const shade = makeShade(frame.querySelector('img')?.alt || 'Design');
      const big = frame.cloneNode(true);
      big.classList.add('cs-lightbox__frame');
      big.removeAttribute('role');
      big.removeAttribute('aria-label');
      big.tabIndex = -1;
      shade.append(big);

      // On a phone the screen itself fills the width, cropping the frame, and its notes sit below it
      const shot = frame.querySelector('img').getBoundingClientRect();
      const to = phone.matches ? stackedBox(from, shot) : fitBox(from.width / from.height, 1100);
      if (phone.matches) {
        const listTop = to.top + (shot.bottom - from.top) * (to.w / from.width) + 16;
        shade.style.setProperty('--list-top', `${listTop}px`); // room to scroll the screen clear of the notes
      }
      const w = to.w;
      Object.assign(big.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${w}px`, height: `${to.h}px` });
      const flip = (r) => `translate(${r.left - to.left}px, ${r.top - to.top}px) scale(${r.width / w})`;
      const time = reduceMotion ? 0 : 480;

      frame.style.visibility = 'hidden';
      big.animate([{ transform: flip(from) }, { transform: 'none' }], { duration: time, easing: EASE_OUT });
      shade.animate([{ backgroundColor: 'transparent' }, {}], { duration: time, easing: EASE_OUT });
      big.focus({ preventScroll: true });

      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        shade.scrollTop = 0;
        removeEventListener('keydown', onKey);
        const back = big.animate([{ transform: 'none' }, { transform: flip(frame.getBoundingClientRect()) }], { duration: time, easing: EASE_OUT, fill: 'forwards' });
        shade.animate([{}, { backgroundColor: 'transparent' }], { duration: time, easing: EASE_OUT, fill: 'forwards' });
        back.finished.then(() => {
          frame.style.visibility = '';
          shade.remove();
          resolve();
        });
      };
      // Another overlay handling Esc first (it calls preventDefault) keeps this open
      const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) close(); };
      addEventListener('keydown', onKey);
      shade.addEventListener('click', close);
    });
  }

  // The Building to learn figures zoom where they are instead: the promo is live and sized by
  // script, so a copy wouldn't play. The figure scales over the wash and keeps playing; tapping it
  // or the wash, Esc, or scrolling puts it back.
  function zoomInPlace(el, label) {
    return new Promise((resolve) => {
      const from = el.getBoundingClientRect();
      const shade = makeShade(label);
      const to = fitBox(from.width / from.height, 1400);
      const time = reduceMotion ? 0 : 480;
      el.classList.add('is-open');
      const grow = el.animate(
        [{ transform: 'none' }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.w / from.width})` }],
        { duration: time, easing: EASE_OUT, fill: 'forwards' }
      );
      shade.animate([{ backgroundColor: 'transparent' }, {}], { duration: time, easing: EASE_OUT });

      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        removeEventListener('keydown', onKey);
        removeEventListener('scroll', close);
        el.removeEventListener('click', close);
        grow.reverse();
        shade.animate([{}, { backgroundColor: 'transparent' }], { duration: time, easing: EASE_OUT, fill: 'forwards' });
        grow.finished.then(() => {
          grow.cancel();
          el.classList.remove('is-open');
          shade.remove();
          resolve();
        });
      };
      const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) close(); };
      addEventListener('keydown', onKey);
      addEventListener('scroll', close, { passive: true });
      shade.addEventListener('click', close);
      // The tap that opened it is still bubbling, so listen for the next one
      setTimeout(() => el.addEventListener('click', close), 0);
    });
  }

  document.querySelectorAll('.cs-build .cs-figure').forEach((figure) => {
    const el = figure.firstElementChild;
    const label = figure.querySelector('figcaption')?.textContent.trim() || 'Design';
    let open = false;
    const expand = () => {
      if (open) return;
      open = true;
      zoomInPlace(el, label).then(() => { open = false; });
    };
    el.classList.add('cs-zoomable');
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Expand: ${label}`);
    el.addEventListener('click', expand);
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !open) { e.preventDefault(); expand(); }
    });
  });

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
  const answer = media.querySelector('.heb-results__answer');
  // The answer's words, wrapped so they can stream in one after another in place
  const answerText = answer.querySelector('.heb-answer__text');
  const words = answerText.textContent.trim().split(/\s+/).map((word) => {
    const span = document.createElement('span');
    span.className = 'heb-word';
    span.textContent = word;
    return span;
  });
  answerText.replaceChildren(...words.flatMap((span, i) => (i ? [' ', span] : [span])));
  const debugButton = media.querySelector('.heb-debug-button');
  const debug = media.querySelector('.heb-debug');
  const promptField = media.querySelector('.heb-debug__field--prompt');
  const promptEdit = media.querySelector('[data-edit]');
  const save = media.querySelector('.heb-debug__save');
  // The rule typed into the system prompt before the results load again
  const PROMPT_EDIT = '\n- Favor snacks that pack light for the trail';
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
    clearResults();
    cartTotal.textContent = `$${CART.total.toFixed(2)}`;
    cartCount.textContent = CART.count;
    debugButton.classList.remove('is-pressed');
    debug.classList.remove('is-open');
    promptField.classList.remove('is-focused');
    promptEdit.textContent = '';
    save.classList.remove('is-pressed', 'is-saving');
    void results.offsetWidth;
    results.classList.remove('is-resetting');
  };
  // Empties the results back to their loading state; the cart keeps what was added
  function clearResults() {
    media.querySelectorAll('.heb-result__button').forEach((button) => {
      button.classList.remove('is-pressed', 'is-loading', 'is-added');
      button.textContent = 'Add to cart';
    });
    answer.classList.remove('is-loaded');
    words.forEach((word) => word.classList.remove('is-on'));
    shelves.forEach((shelf) => {
      shelf.classList.remove('is-shown', 'is-writing', 'is-filled');
      shelf.querySelector('[data-heading]').textContent = '';
    });
  }
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
  // The finger presses something: in, a beat, and out
  async function press(el, id) {
    aim(el);
    tap.classList.add('is-visible');
    await wait(450); if (id !== run) return;
    tap.classList.add('is-pressing');
    el.classList.add('is-pressed');
    await wait(180); if (id !== run) return;
    tap.classList.remove('is-pressing', 'is-visible');
    el.classList.remove('is-pressed');
  }
  // The answer, then the sections writing in one by one over skeleton rows, then the products
  async function loadResults(id) {
    answer.classList.add('is-loaded');
    await wait(300); if (id !== run) return;
    for (const word of words) {
      word.classList.add('is-on');
      await wait(55 + Math.random() * 35); if (id !== run) return;
    }
    await wait(300); if (id !== run) return;
    for (const shelf of shelves) {
      await write(shelf, id); if (id !== run) return;
      await wait(220); if (id !== run) return;
    }
    await wait(500); if (id !== run) return;
    for (const shelf of shelves) {
      shelf.classList.add('is-filled');
      await wait(350); if (id !== run) return;
    }
  }
  // Opens the debug panel, adds a rule to the system prompt, saves, and the results load again
  async function tunePrompt(id) {
    await press(debugButton, id); if (id !== run) return;
    debug.classList.add('is-open');
    await wait(900); if (id !== run) return;
    await press(promptEdit.nextElementSibling, id); if (id !== run) return;
    promptField.classList.add('is-focused');
    await wait(500); if (id !== run) return;
    for (const char of PROMPT_EDIT) {
      promptEdit.textContent += char;
      await wait(char === ' ' ? 120 : 45 + Math.random() * 50); if (id !== run) return;
    }
    await wait(800); if (id !== run) return;
    promptField.classList.remove('is-focused');
    await press(save, id); if (id !== run) return;
    save.classList.add('is-saving');
    await wait(900); if (id !== run) return;
    debug.classList.remove('is-open');
    save.classList.remove('is-saving');
    // Back to the top, and the results start over with the new prompt
    page.style.setProperty('--drift', 0);
    clearResults();
    await wait(1400); if (id !== run) return;
    await loadResults(id);
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
      await loadResults(id); if (id !== run) return;
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
      // Then into the debug tool, to tune the prompt and see the results again
      await tunePrompt(id); if (id !== run) return;
      await wait(3000); if (id !== run) return;
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
      // In the hero, the promo rises in with the title; elsewhere it reveals with its section
      if (media.closest('.cs-hero')) {
        media.animate(
          [{ opacity: 0, translate: '0 60px', scale: '0.97' }, { opacity: 1, translate: '0 0', scale: '1' }],
          { duration: 1200, delay: 150, easing: EASE_OUT, fill: 'backwards' }
        );
      }
    });
    // The promo plays while most of it is on screen, and starts over each time it comes back
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) promo.start();
        else promo.stop();
      }, { threshold: 0.6 }).observe(media);
    }
    observeReveals();
    startCarousels();
  }

  if (!root.classList.contains('case-locked')) start();
  else document.addEventListener('case:unlocked', start, { once: true });
})();
