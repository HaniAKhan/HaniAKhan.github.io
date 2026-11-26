/* Meal planning assistant: the phone's meal planning flow, and the RecipeBot, workshop and data journey demos.
   Runs before case.js, which sizes the canvases, plays the hero phone in on scroll and tells this script when
   the whole phone is in view. Each canvas demo is registered in window.caseDemos so its lightbox copy plays too. */
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const ASSETS = '/assets/work/meal-planning';
  const demos = (window.caseDemos = window.caseDemos || {});

  /* A demo that plays on a loop and can be stopped at any point. Stopping clears every pending wait,
     so the script simply never resumes; start() resets the scene and plays from the top. */
  function looper({ reset, play }) {
    let timers = [];
    const wait = (ms) => new Promise((resolve) => timers.push(setTimeout(resolve, ms)));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    return {
      start() { clear(); reset(); if (!reduceMotion) play(wait); },
      stop() { clear(); reset(); },
    };
  }

  // Plays a demo while its element is on screen
  function playWhileVisible(el, demo, threshold = 0.35) {
    if (!('IntersectionObserver' in window)) { demo.start(); return; }
    let playing = false;
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !playing) { playing = true; demo.start(); }
      else if (!entry.isIntersecting && playing) { playing = false; demo.stop(); }
    }, { threshold }).observe(el);
  }

  // How much an element's box is scaled on screen (the phone, a canvas, the lightbox all scale)
  const scaleOf = (el) => el.getBoundingClientRect().width / el.offsetWidth || 1;

  // Types text into an element, a character at a time
  async function type(el, text, wait, speed = 55) {
    for (let i = 1; i <= text.length; i++) {
      el.textContent = text.slice(0, i);
      await wait(speed + (text[i - 1] === ' ' ? 30 : Math.random() * 30));
    }
  }

  // The visitor's finger: it lands on an element, presses it and lifts (in the root's own, unscaled coordinates)
  async function pressOn(root, tap, el, wait) {
    const box = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const scale = scaleOf(root);
    tap.style.left = `${(r.left + r.width / 2 - box.left) / scale}px`;
    tap.style.top = `${(r.top + r.height / 2 - box.top) / scale}px`;
    tap.classList.add('is-visible');
    await wait(420);
    tap.classList.add('is-pressing');
    el.classList.add('is-pressed');
    await wait(170);
    tap.classList.remove('is-pressing', 'is-visible');
    el.classList.remove('is-pressed');
    await wait(120);
  }

  /* ---------- The meal planning flow ---------- */
  const RECIPES = [
    { name: 'Beef stir fry with crispy vegetables', time: '15 min', count: 5, img: 'beef-stir-fry' },
    { name: 'Chicken fajitas', time: '30 min', count: 5, img: 'chicken-fajitas' },
    { name: 'Honey glazed almond salmon', time: '30 min', count: 4, img: 'almond-salmon' },
    { name: 'Quick butter chicken', time: '30 min', count: 4, img: 'butter-chicken' },
    { name: 'Chipotle marinated tofu kabobs', time: '30 min', count: 3, img: 'tofu-kabobs' },
  ];
  // The two recipes the demo swaps in, by card
  const REPLACEMENTS = {
    1: { name: 'Breakfast tacos with peppers', time: '20 min', count: 5, img: 'breakfast-tacos' },
    3: { name: 'Turkey sausage sheet pan dinner', time: '35 min', count: 6, img: 'sheet-pan-sausage' },
  };

  function cardContent(recipe) {
    return `
      <div class="mp-card__image"><img src="${ASSETS}/recipes/${recipe.img}.jpg" width="216" height="216" alt=""></div>
      <div class="mp-card__text">
        <p class="mp-card__title">${recipe.name}</p>
        <div class="mp-card__metas">
          <p class="mp-card__meta"><img src="${ASSETS}/clock.svg" width="16" height="16" alt="">${recipe.time}</p>
          <p class="mp-card__meta"><img src="${ASSETS}/ingredients.svg" width="16" height="16" alt="">${recipe.count} ingredients</p>
        </div>
        <div class="mp-card__actions">
          <span class="mp-card__replace" data-replace><i><img src="${ASSETS}/replace.svg" width="12" height="16" alt=""></i>Replace</span>
          <span class="mp-card__remove"><img src="${ASSETS}/close-sm.svg" width="16.135" height="16.135" alt=""></span>
        </div>
      </div>
      <div class="mp-card__skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>`;
  }
  const fillCard = (card, recipe) => { card.innerHTML = cardContent(recipe); };

  // Moves chips to their new places (or styles) and glides each one there from where it was
  function flipChips(scope, mutate) {
    const chips = () => [...scope.querySelectorAll('.mp-chip')];
    const before = new Map(chips().map((chip) => [chip, chip.getBoundingClientRect()]));
    mutate();
    const scale = scaleOf(scope.closest('.mp'));
    chips().forEach((chip) => {
      const from = before.get(chip);
      if (!from) { chip.animate([{ opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1 }], { duration: 450, easing: EASE_OUT }); return; }
      const to = chip.getBoundingClientRect();
      const dx = (from.left - to.left) / scale;
      const dy = (from.top - to.top) / scale;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        chip.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 550, easing: EASE_OUT });
      }
    });
  }
  const chipNamed = (screen, name) => [...screen.querySelectorAll('.mp-chip')].find((chip) => chip.textContent === name);
  // Picks, tapped or typed, go up into their own row above the rest
  function pickChip(screen, name) {
    const picked = screen.querySelector('[data-picked]');
    let chip = chipNamed(screen, name);
    if (!chip) { chip = document.createElement('span'); chip.className = 'mp-chip'; chip.dataset.added = ''; chip.textContent = name; }
    picked.append(chip);
    chip.classList.add('is-picked');
  }

  const app = document.querySelector('[data-mp-demo]');
  const screens = [...app.querySelectorAll('.mp-screen')];
  const screen = (name) => app.querySelector(`[data-screen="${name}"]`);

  // The guided experience section shows the two selection steps, picked, cut from the phone before it plays
  function copyScreens() {
    document.querySelectorAll('[data-copy-screen]').forEach((holder) => {
      const name = holder.dataset.copyScreen;
      holder.classList.add('mp');
      holder.append(app.querySelector('.mp-status').cloneNode(true));
      const copy = screen(name).cloneNode(true);
      copy.classList.add('is-active');
      holder.append(copy);
      if (name === 'proteins') ['Turkey', 'Chicken', 'bell pepper'].forEach((item) => pickChip(copy, item));
      if (name === 'prefs') ['Quick and easy', 'Mexican'].forEach((item) => pickChip(copy, item));
    });
  }

  function mealPlanDemo() {
    const tap = app.querySelector('.swap-tap');
    const wipe = app.querySelector('.mp-wipe');
    const proteins = screen('proteins');
    const prefs = screen('prefs');
    const plan = screen('plan');
    const field = proteins.querySelector('.mp-field');
    const typed = proteins.querySelector('[data-typed]');
    const track = plan.querySelector('[data-track]');
    const cards = [...plan.querySelectorAll('[data-card]')];
    // Each step's chips in their first order, to put them back between loops
    const pools = [proteins, prefs].map((s) => { const pool = s.querySelector('[data-pool]'); return [pool, [...pool.children]]; });
    const stepper = proteins.querySelector('.mp-stepper');

    const show = (name) => {
      const index = screens.findIndex((s) => s.dataset.screen === name);
      screens.forEach((s, i) => {
        s.classList.toggle('is-active', i === index);
        s.classList.toggle('is-past', i < index);
      });
    };
    const reset = () => {
      app.classList.add('is-resetting');
      show(reduceMotion ? 'plan' : 'landing');
      pools.forEach(([pool, order]) => order.forEach((chip) => { chip.classList.remove('is-picked'); pool.append(chip); }));
      proteins.querySelectorAll('[data-added]').forEach((chip) => chip.remove());
      field.classList.remove('is-typing');
      typed.textContent = '';
      track.style.transform = '';
      cards.forEach((card, i) => { fillCard(card, RECIPES[i]); card.classList.remove('is-loading', 'is-arriving'); });
      tap.classList.remove('is-visible', 'is-pressing');
      app.querySelectorAll('.is-pressed').forEach((el) => el.classList.remove('is-pressed'));
      void app.offsetWidth;
      app.classList.remove('is-resetting');
    };

    return looper({
      reset,
      async play(wait) {
        const press = (el) => pressOn(app, tap, el, wait);
        const replace = async (index) => {
          const card = cards[index];
          await press(card.querySelector('[data-replace]'));
          card.classList.add('is-loading');
          await wait(1300);
          fillCard(card, REPLACEMENTS[index]);
          card.classList.remove('is-loading');
          card.classList.add('is-arriving');
        };

        for (;;) {
          await wait(1400);
          await press(screen('landing').querySelector('[data-start]'));
          stepper.style.setProperty('--progress', '0%');
          show('proteins');
          requestAnimationFrame(() => stepper.style.setProperty('--progress', '33.33%'));
          await wait(1100);

          // Proteins, then an ingredient of their own
          for (const name of ['Turkey', 'Chicken']) {
            const chip = chipNamed(proteins, name);
            await press(chip);
            flipChips(proteins, () => pickChip(proteins, name));
            await wait(550);
          }
          await press(proteins.querySelector('[data-add]'));
          field.classList.add('is-typing');
          await type(typed, 'bell pepper', wait, 65);
          await wait(450);
          field.classList.remove('is-typing');
          typed.textContent = '';
          flipChips(proteins, () => pickChip(proteins, 'bell pepper'));
          await wait(1000);
          await press(proteins.querySelector('[data-next]'));
          show('prefs');
          await wait(1100);

          // Preferences
          for (const name of ['Quick and easy', 'Mexican']) {
            const chip = chipNamed(prefs, name);
            await press(chip);
            flipChips(prefs, () => pickChip(prefs, name));
            await wait(500);
          }
          await wait(500);
          await press(prefs.querySelector('[data-next]'));

          // The plan: recipes load in one after another
          cards.forEach((card) => card.classList.add('is-loading'));
          show('plan');
          await wait(1300);
          for (const card of cards) {
            card.classList.remove('is-loading');
            card.classList.add('is-arriving');
            await wait(180);
          }
          await wait(1600);

          // Swipe along and replace two recipes
          track.style.transform = 'translateX(-130px)';
          await wait(1200);
          await replace(1);
          await wait(1300);
          track.style.transform = 'translateX(-630px)';
          await wait(1300);
          await replace(3);
          await wait(2600);
          track.style.transform = 'translateX(-130px)';
          await wait(2200);

          // Fade to white, and start over
          wipe.classList.add('is-on');
          await wait(500);
          reset();
          await wait(100);
          wipe.classList.remove('is-on');
        }
      },
    });
  }

  copyScreens();
  const planDemo = mealPlanDemo();
  if (reduceMotion) planDemo.stop(); // shows the finished plan
  else {
    // case.js says when the whole phone first comes into view; from then on it plays while it's visible
    const device = app.closest('.device');
    device.addEventListener('device:in-view', () => playWhileVisible(device, planDemo, 0.5), { once: true });
    planDemo.stop();
  }

  /* ---------- The results page: replace a recipe, remove one, swipe to the end and add another ---------- */
  const ADDED = { name: 'Turkey sausage sheet pan dinner', time: '35 min', count: 6, img: 'sheet-pan-sausage' };
  const SWAPPED = { name: 'Breakfast tacos with peppers', time: '20 min', count: 5, img: 'breakfast-tacos' };

  demos.plan = (el) => {
    let tap = el.querySelector('.swap-tap');
    if (!tap) { tap = document.createElement('span'); tap.className = 'swap-tap'; tap.setAttribute('aria-hidden', 'true'); el.append(tap); }
    const track = el.querySelector('[data-track]');
    const addCard = el.querySelector('.mp-card--add');
    const cards = () => [...el.querySelectorAll('[data-card]')];
    // Slides the row so its last card sits against the right edge of the screen
    const toEnd = () => { track.style.transform = `translateX(${-(addCard.offsetLeft + addCard.offsetWidth + 16 - 390)}px)`; };

    const reset = () => {
      el.querySelectorAll('[data-card][data-added]').forEach((card) => card.remove());
      cards().forEach((card, i) => {
        fillCard(card, RECIPES[i]);
        card.classList.remove('is-loading', 'is-arriving', 'is-removing', 'is-entering');
      });
      track.style.transition = 'none';
      track.style.transform = '';
      void track.offsetWidth;
      track.style.transition = '';
      tap.classList.remove('is-visible', 'is-pressing');
      el.querySelectorAll('.is-pressed').forEach((node) => node.classList.remove('is-pressed'));
    };

    return looper({
      reset,
      async play(wait) {
        const press = (node) => pressOn(el, tap, node, wait);
        const load = async (card, recipe) => {
          card.classList.add('is-loading');
          await wait(1300);
          fillCard(card, recipe);
          card.classList.remove('is-loading');
          card.classList.add('is-arriving');
        };
        for (;;) {
          await wait(1200);
          // Replace the first recipe
          const [first, second] = cards();
          await press(first.querySelector('[data-replace]'));
          await load(first, SWAPPED);
          await wait(1400);

          // Remove the second: it folds away and the row closes up
          await press(second.querySelector('.mp-card__remove'));
          second.classList.add('is-removing');
          await wait(1100);

          // Swipe to the end and add another recipe
          toEnd();
          await wait(1300);
          await press(addCard.querySelector('.mp-card__add'));
          const added = document.createElement('article');
          added.className = 'mp-card is-entering';
          added.dataset.card = '';
          added.dataset.added = '';
          fillCard(added, ADDED);
          added.classList.add('is-loading');
          addCard.before(added);
          void added.offsetWidth;
          // The new card opens up where the add card was; slide so it shows in full, the add card peeking after it
          const slot = addCard.offsetLeft;
          added.classList.remove('is-entering');
          track.style.transform = `translateX(${-(slot - 16)}px)`;
          await wait(500);
          await load(added, ADDED);
          await wait(3200);

          // Back to the start, and around again
          track.style.transform = '';
          await wait(1400);
          el.animate([{ opacity: 1 }, { opacity: 0.0 }, { opacity: 1 }], { duration: 900 });
          await wait(450);
          reset();
          await wait(450);
        }
      },
    });
  };

  /* ---------- RecipeBot: a question typed and sent, and a recipe streamed back ---------- */
  const QUESTION = 'Give me a recipe for chicken pasta';
  const ANSWER = [
    ['p', 'Sure, here’s a recipe for “Chicken Spaghetti” from H-E-B:'],
    ['strong', 'Chicken Spaghetti'],
    ['p', 'Prep Time: 15 min | Cook Time: 15 min | Serves: 4'],
    ['strong', 'Ingredients'],
    ['ul', [
      'Hill Country Fare Olive Oil No-Stick Cooking Spray, 1 ct',
      'H-E-B Broccoli Normandy Blend, 16 oz, frozen',
      'H-E-B Fancy Shredded Cheese Pizza Blend, 1 cup(s)',
      'H-E-B 100% Whole Wheat Spaghetti, 8 oz',
      'H-E-B Natural Boneless, Skinless Chicken Breasts, 1 lb, fat trimmed and cubed',
      'H-E-B Select Ingredients Healthy Marinara Pasta Sauce, 2 cup(s)',
    ]],
    ['strong', 'Instructions'],
    ['ol', [
      'Heat oven to 425°F.',
      'Spray an 8 x 8 inch baking dish or pan with nonstick cooking spray; set aside.',
      'In a large skillet over medium heat, combine pasta sauce and chicken.',
      'Cook until chicken is no longer pink in the center, about 7 minutes.',
      'Meanwhile, cook pasta according to package directions, but after 6 minutes, add the frozen vegetables and cook 3 more minutes.',
      'Drain pasta and vegetables; add to chicken mixture and stir.',
      'Evenly fill prepared pan, cover with foil and bake 10 minutes.',
      'Remove foil, top with shredded cheese and bake until cheese melts, about 3 minutes. Serve warm.',
    ]],
    ['p', 'Enjoy your meal!'],
  ];
  const USER_AVATAR = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10" cy="10" r="7.5"/><path d="M6.8 12.2c.8 1 1.9 1.6 3.2 1.6s2.4-.6 3.2-1.6" stroke-linecap="round"/><circle cx="7.5" cy="8.5" r=".6" fill="currentColor"/><circle cx="12.5" cy="8.5" r=".6" fill="currentColor"/><path d="M4.5 6.5C6 4.5 8 4 10 4.6c1.5.4 3 0 4.6-1"/></svg>';

  demos.recipebot = (el) => {
    const thread = el.querySelector('[data-thread]');
    const input = el.querySelector('[data-input]');
    const field = input.parentElement;
    const composer = el.querySelector('.rb__composer');
    const send = el.querySelector('.rb__send');
    const message = (who, html) => {
      const msg = document.createElement('div');
      msg.className = `rb__msg rb__msg--${who}`;
      msg.innerHTML = who === 'user'
        ? `<span class="rb__avatar">${USER_AVATAR}</span><div class="rb__body">${html}</div>`
        : `<img class="rb__avatar rb__avatar--bot" src="/assets/work/ai-search/home/heb-small.svg" width="34" height="34" alt=""><div class="rb__body">${html}</div>`;
      thread.append(msg);
      return msg.querySelector('.rb__body');
    };
    // The finished answer, for a still (reduced motion)
    const answerHtml = () => ANSWER.map(([tag, content]) => {
      if (tag === 'strong') return `<p><strong>${content}</strong></p>`;
      if (tag === 'p') return `<p>${content}</p>`;
      return `<${tag}>${content.map((item) => `<li>${item}</li>`).join('')}</${tag}>`;
    }).join('');

    const reset = () => {
      thread.replaceChildren();
      thread.style.opacity = '';
      input.textContent = '';
      field.classList.remove('has-text');
      composer.classList.remove('is-ready');
      if (reduceMotion) {
        message('user', QUESTION);
        message('bot', answerHtml());
      }
    };

    return looper({
      reset,
      async play(wait) {
        // Streams text into an element a few characters at a time, like the model writing it
        const stream = async (target, text) => {
          for (let i = 0; i < text.length;) {
            i += 2 + Math.floor(Math.random() * 4);
            target.textContent = text.slice(0, i);
            await wait(22);
          }
        };
        for (;;) {
          await wait(900);
          field.classList.add('has-text');
          await type(input, QUESTION, wait, 45);
          composer.classList.add('is-ready');
          await wait(450);
          send.classList.add('is-pressed');
          await wait(150);
          send.classList.remove('is-pressed');
          input.textContent = '';
          field.classList.remove('has-text');
          composer.classList.remove('is-ready');
          message('user', QUESTION);
          await wait(600);
          const body = message('bot', '<div class="rb__typing"><i></i><i></i><i></i></div>');
          await wait(1500);
          body.replaceChildren();
          for (const [tag, content] of ANSWER) {
            if (tag === 'ul' || tag === 'ol') {
              const list = document.createElement(tag);
              body.append(list);
              for (const item of content) {
                const li = document.createElement('li');
                list.append(li);
                await stream(li, item);
              }
            } else {
              const p = document.createElement('p');
              const target = tag === 'strong' ? p.appendChild(document.createElement('strong')) : p;
              body.append(p);
              await stream(target, content);
            }
            await wait(120);
          }
          await wait(5000);
          thread.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
          await wait(450);
          reset();
          thread.getAnimations().forEach((a) => a.cancel());
        }
      },
    });
  };

  /* ---------- The workshop: three people adding sticky notes to a FigJam board ---------- */
  // Placeholder notes that echo the outcome of the workshop: the potential, and what made chat hard
  const NOTES = [
    ['good', 0, 'Recipes came back fast'],
    ['bad', 2, 'I didn’t know what to ask it'],
    ['good', 1, 'Love that it uses H-E-B products'],
    ['bad', 0, 'Typing a whole prompt feels like work'],
    ['good', 2, 'Great when I already know what I want to make'],
    ['bad', 1, 'Took a lot of back and forth to get a recipe I liked'],
    ['good', 0, 'Felt like magic the first time'],
    ['bad', 2, 'Hard to plan a whole week this way'],
  ];
  // Where each cursor rests while the others work, in board coordinates
  const CURSOR_HOMES = [[120, 420], [330, 470], [480, 400]];

  demos.figjam = (el) => {
    const board = el.querySelector('.fj__board');
    const lists = { good: el.querySelector('[data-notes="good"]'), bad: el.querySelector('[data-notes="bad"]') };
    const cursors = [...el.querySelectorAll('[data-cursor]')];
    const moveTo = (cursor, x, y) => { cursor.style.translate = `${x}px ${y}px`; };
    const home = (i) => moveTo(cursors[i], ...CURSOR_HOMES[i]);
    const addNote = (where, text) => {
      const note = document.createElement('div');
      note.className = 'fj__note';
      note.textContent = text;
      lists[where].append(note);
      return note;
    };

    const reset = () => {
      Object.values(lists).forEach((list) => list.replaceChildren());
      cursors.forEach((cursor, i) => {
        cursor.style.transition = 'none';
        home(i);
        void cursor.offsetWidth;
        cursor.style.transition = '';
      });
      if (reduceMotion) NOTES.forEach(([where, , text]) => addNote(where, text));
    };

    return looper({
      reset,
      async play(wait) {
        for (;;) {
          await wait(600);
          for (const [where, who, text] of NOTES) {
            // Hold the note's place, bring its author's cursor over, then stick it down and write it
            const note = addNote(where, '');
            note.style.visibility = 'hidden';
            const section = note.offsetParent;
            const x = section.offsetLeft + note.offsetLeft + 30;
            const y = section.offsetTop + note.offsetTop + 40;
            moveTo(cursors[who], x, y);
            await wait(1150);
            note.style.visibility = '';
            note.classList.add('is-typing');
            note.style.animation = 'none';
            void note.offsetWidth;
            note.style.animation = '';
            await type(note, text, wait, 38);
            note.classList.remove('is-typing');
            moveTo(cursors[who], x + 60 + Math.random() * 40, y + 90 + Math.random() * 30);
            await wait(350);
          }
          cursors.forEach((_, i) => home(i));
          await wait(4500);
          board.querySelectorAll('.fj__note').forEach((note) => note.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }));
          await wait(450);
          reset();
        }
      },
    });
  };

  /* ---------- The data journey: the recipe recommendation API, step by step ---------- */
  const NEAR = [
    ['Chicken fajitas', 300, 168],
    ['Turkey taco skillet', 462, 176],
    ['Chicken mole', 236, 262],
    ['Turkey stuffed peppers', 470, 304],
    ['Chicken enchiladas', 318, 334],
    ['Turkey tamales', 528, 236],
    ['Chicken tinga tostadas', 392, 112],
  ];
  const FAR = [[120, 86], [158, 386], [86, 236], [604, 86], [626, 380], [566, 430], [196, 140], [646, 250], [140, 446], [430, 440], [252, 420], [536, 52], [80, 420], [292, 52], [600, 170]];
  const QUERY = [378, 238];
  const CUT = { 'Chicken mole': 'Too involved for quick and easy', 'Turkey tamales': 'Takes over 2 hours' };
  const KEPT = NEAR.map(([name]) => name).filter((name) => !CUT[name]);
  const RANKED = ['Turkey taco skillet', 'Chicken fajitas', 'Chicken enchiladas', 'Turkey stuffed peppers', 'Chicken tinga tostadas'];
  const JSON_OUT = `{
  "main ingredients": ["turkey", "chicken", "bell pepper"],
  "lifestyle": ["quick and easy"],
  "cuisine type": ["Mexican"],
  "meal type": ["dinner"],
  "cook time": ["under 30 min"]
}`;

  // A fixed scatter of recipes for the search space, the same on every visit
  function scatter() {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const points = [];
    for (let i = 0; i < 170; i++) points.push([40 + rand() * 611, 34 + rand() * 380]);
    return points;
  }
  const POINTS = scatter();
  const RING = [440, 216, 92];

  const STEPS = [
    {
      title: 'People make a few selections',
      text: 'Proteins and preferences are tapped in the interface. Anything people type, like an ingredient they already have, comes along too.',
      time: 4600,
      visual: () => `
        <div class="dj-inputs">
          <div class="dj-card dj-pop"><span class="dj-label">Selected in the interface</span><div class="dj-pills">
            ${['Turkey', 'Chicken', 'Quick and easy', 'Mexican'].map((t, i) => `<span class="dj-pill dj-pop" style="--d:${300 + i * 180}">${t}</span>`).join('')}
          </div></div>
          <div class="dj-card dj-pop" style="--d:150"><span class="dj-label">Typed by the customer</span><span class="dj-typed" data-type="bell pepper"></span></div>
        </div>
        <span class="dj-arrow dj-pop" style="--d:1400"></span>
        <pre class="dj-mono dj-pop" style="--d:1600">proteins: turkey, chicken
other ingredients: bell pepper
preferences: quick and easy, Mexican</pre>`,
    },
    {
      title: 'An LLM derives ingredients and preferences',
      text: 'The LLM reads the selections and anything typed, and turns them into structured ingredients and preferences.',
      time: 5600,
      visual: () => `
        <span class="dj-node dj-pop">LLM</span>
        <span class="dj-arrow dj-pop" style="--d:150"></span>
        <pre class="dj-mono dj-pop" style="--d:200; width: 560px; height: 172px; font-size: 14px; line-height: 22px" data-type-json></pre>`,
    },
    {
      title: 'The preferences become filters',
      text: 'Those preferences are turned into filters that the recipe catalog understands.',
      time: 4400,
      visual: () => `
        <span class="dj-label dj-pop">Filters</span>
        <div class="dj-pills" style="max-width: 520px">
          ${['protein: turkey', 'protein: chicken', 'ingredient: bell pepper', 'total time: 30 min or less', 'cuisine: Mexican', 'meal type: dinner'].map((t, i) => `<span class="dj-pill dj-pill--soft dj-pop" style="--d:${200 + i * 200}">${t}</span>`).join('')}
        </div>`,
    },
    {
      title: 'Merge and let people win',
      text: 'Filters from the interface and filters the AI suggests are merged. If any overlap or conflict, the person’s filters override the AI’s.',
      time: 5200,
      visual: () => `
        <div class="dj-venn dj-pop">
          <span class="dj-venn__circle"></span><span class="dj-venn__circle"></span>
          <span class="dj-venn__name" style="left: 150px">Person</span>
          <span class="dj-venn__name" style="left: 330px">AI</span>
          <span class="dj-pill dj-pop" style="left: 62px; top: 72px; --d:300">turkey</span>
          <span class="dj-pill dj-pop" style="left: 40px; top: 118px; --d:400">chicken</span>
          <span class="dj-pill dj-pop" style="left: 30px; top: 164px; --d:500">bell pepper</span>
          <span class="dj-pill dj-pop" style="left: 52px; top: 210px; --d:600">≤ 30 min</span>
          <span class="dj-pill dj-pop" style="left: 196px; top: 133px; --d:800">Mexican</span>
          <span class="dj-pill dj-pill--soft dj-pop" style="left: 336px; top: 96px; --d:900">dinner</span>
          <span class="dj-pill dj-pill--soft dj-pop dj-strike" style="left: 322px; top: 142px; --d:1000">≤ 45 min</span>
          <span class="dj-pill dj-pill--soft dj-pop" style="left: 334px; top: 188px; --d:1100">skillet</span>
        </div>
        <p class="dj-note dj-pop" style="--d:1800">The AI suggested 45 minutes, but the person asked for quick and easy</p>`,
    },
    {
      title: 'Filters narrow the search space',
      text: 'Applying the filters narrows the whole recipe catalog down to the recipes that could work.',
      time: 4600,
      visual: () => {
        const dots = POINTS.map(([x, y], i) => {
          const inside = Math.hypot(x - RING[0], y - RING[1]) < RING[2] - 6;
          return `<circle class="dj-dot${inside ? '' : ' dj-dot--out'}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${inside ? 5 : 4}" style="--d:${Math.round((x / 691) * 600)}"/>`;
        }).join('');
        return `<div class="dj-space"><svg viewBox="0 0 691 494">${dots}<circle class="dj-ring" cx="${RING[0]}" cy="${RING[1]}" r="${RING[2]}"/></svg>
          <p class="dj-caption dj-label">Every recipe → only the recipes that pass the filters</p></div>`;
      },
    },
    {
      title: 'Semantic search finds the closest recipes',
      text: 'A semantic search across the filtered recipes finds the ones closest in meaning to what the person asked for.',
      time: 5400,
      visual: () => {
        const [qx, qy] = QUERY;
        const far = FAR.map(([x, y]) => `<circle class="dj-point" cx="${x}" cy="${y}" r="5"/>`).join('');
        const near = NEAR.map(([, x, y], i) => `<line class="dj-link" x1="${qx}" y1="${qy}" x2="${x}" y2="${y}" style="--d:${i * 120}"/><circle class="dj-point dj-point--near" cx="${x}" cy="${y}" r="6"/>`).join('');
        const tags = NEAR.map(([name, x, y], i) => `<span class="dj-tag dj-pop" style="left:${x + 10}px; top:${y - 22}px; --d:${1100 + i * 120}">${name}</span>`).join('');
        return `<div class="dj-space"><svg viewBox="0 0 691 494">
            <line class="dj-axis" x1="40" y1="470" x2="40" y2="24"/><line class="dj-axis" x1="40" y1="470" x2="667" y2="470"/>
            ${far}${near}
            <circle class="dj-query-ring" cx="${qx}" cy="${qy}" r="9"/><circle class="dj-query" cx="${qx}" cy="${qy}" r="9"/>
          </svg>${tags}
          <span class="dj-tag dj-tag--query dj-pop" style="left:${qx - 140}px; top:${qy - 52}px; --d:300">quick Mexican turkey, chicken, bell pepper</span></div>`;
      },
    },
    {
      title: 'An LLM re-evaluates the results',
      text: 'The LLM checks each result against the person’s selections and refines the list, removing anything that doesn’t fit.',
      time: 5800,
      visual: () => `
        <span class="dj-node dj-pop" style="width: 64px; height: 40px; border-radius: 12px; font-size: 13px">LLM</span>
        <ul class="dj-list dj-pop" style="--d:200">
          ${NEAR.map(([name]) => `<li class="dj-item" data-check="${CUT[name] ? 'cut' : 'kept'}"><span class="dj-item__mark">${CUT[name] ? '✕' : '✓'}</span><span class="dj-item__name">${name}</span><span class="dj-item__why">${CUT[name] || ''}</span></li>`).join('')}
        </ul>`,
    },
    {
      title: 'Rank, apply business rules and send',
      text: 'Results are ranked, refined with business rules like promotions, and sent back to the app as the meal plan.',
      time: 6400,
      visual: () => `
        <ul class="dj-list dj-pop" data-rank>
          ${KEPT.map((name, i) => `<li class="dj-item" data-name="${name}"><span class="dj-item__rank">${i + 1}</span><span class="dj-item__name">${name}</span><span class="dj-item__badge">On promotion</span></li>`).join('')}
        </ul>
        <p class="dj-sent"><i>✓</i>Sent to the meal plan</p>`,
    },
  ];

  demos.journey = (el) => {
    const rail = el.querySelector('.dj__rail');
    const items = [...rail.children];
    const copy = el.querySelector('[data-copy]');
    const stage = el.querySelector('[data-visual]');
    stage.replaceChildren(); // a lightbox copy arrives with the page's visuals in it
    let current = -1;
    let timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const wait = (ms) => new Promise((resolve) => later(resolve, ms));

    // The scripted parts of each visual, once it's in place
    async function act(index, v) {
      if (reduceMotion) return finish(index, v);
      if (index === 0) {
        await wait(700);
        await type(v.querySelector('[data-type]'), 'bell pepper', wait, 70);
      }
      if (index === 1) {
        const out = v.querySelector('[data-type-json]');
        await wait(700);
        for (let i = 0; i <= JSON_OUT.length; i += 3) { out.textContent = JSON_OUT.slice(0, i); await wait(18); }
        out.textContent = JSON_OUT;
      }
      if (index === 6) {
        await wait(900);
        for (const item of v.querySelectorAll('[data-check]')) {
          item.classList.add(`is-${item.dataset.check}`);
          await wait(420);
        }
      }
      if (index === 7) {
        await wait(1200);
        const list = v.querySelector('[data-rank]');
        list.querySelector(`[data-name="${RANKED[0]}"]`).classList.add('has-badge');
        await wait(900);
        const before = new Map([...list.children].map((li) => [li, li.offsetTop]));
        RANKED.forEach((name, i) => {
          const li = list.querySelector(`[data-name="${name}"]`);
          li.querySelector('.dj-item__rank').textContent = i + 1;
          list.append(li);
        });
        [...list.children].forEach((li) => {
          const dy = before.get(li) - li.offsetTop;
          if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 700, easing: EASE_OUT });
        });
        await wait(1100);
        v.querySelector('.dj-sent').classList.add('is-on');
      }
    }
    // The end state of a visual, for reduced motion
    function finish(index, v) {
      if (index === 0) v.querySelector('[data-type]').textContent = 'bell pepper';
      if (index === 1) v.querySelector('[data-type-json]').textContent = JSON_OUT;
      if (index === 6) v.querySelectorAll('[data-check]').forEach((item) => item.classList.add(`is-${item.dataset.check}`));
      if (index === 7) v.querySelector('.dj-sent').classList.add('is-on');
    }

    function go(index) {
      timers.forEach(clearTimeout);
      timers = [];
      current = index;
      const step = STEPS[index];
      items.forEach((item, i) => {
        item.classList.toggle('is-active', i === index);
        item.classList.toggle('is-done', i < index);
      });
      rail.style.setProperty('--rail', index / (STEPS.length - 1));
      copy.innerHTML = `<p class="dj__eyebrow">Step ${index + 1} of ${STEPS.length}</p><h3 class="dj__title">${step.title}</h3><p class="dj__text">${step.text}</p>`;
      copy.classList.remove('is-changing');
      void copy.offsetWidth;
      copy.classList.add('is-changing');
      // The new visual fades in over the old one, which leaves once it's covered
      // (its removal isn't one of the step's timers, so jumping between steps can't leave it behind)
      stage.querySelectorAll('.dj-v').forEach((old) => {
        old.classList.remove('is-active');
        setTimeout(() => old.remove(), 600);
      });
      const v = document.createElement('div');
      v.className = 'dj-v';
      v.innerHTML = step.visual();
      stage.append(v);
      void v.offsetWidth;
      v.classList.add('is-active');
      act(index, v);
      schedule();
    }

    /* Moving on: the next step comes up on its own while the section is in view and the visitor hasn't
       paused it. Pausing only holds the current step; its own animation finishes. */
    let inView = false;
    let paused = false;
    let advance = null;
    function schedule() {
      clearTimeout(advance);
      if (inView && !paused && !reduceMotion) advance = setTimeout(() => go((current + 1) % STEPS.length), STEPS[current].time);
    }
    const toggle = el.querySelector('[data-pause]');
    function setPaused(value) {
      paused = value;
      toggle.classList.toggle('is-paused', paused);
      toggle.setAttribute('aria-label', paused ? 'Play the steps' : 'Pause the steps');
      toggle.querySelector('[data-label]').textContent = paused ? 'Play' : 'Pause';
      schedule();
    }
    toggle.hidden = reduceMotion; // nothing plays on its own then
    toggle.addEventListener('click', (event) => {
      event.stopPropagation(); // (and doesn't open the lightbox)
      setPaused(!paused);
    });

    // The steps are buttons: a press jumps to one (and doesn't open the lightbox)
    items.forEach((item, i) => item.querySelector('button').addEventListener('click', (event) => {
      event.stopPropagation();
      go(i);
    }));
    return {
      // Back in view: from the top, unless the visitor paused it, then where they left it
      start() { inView = true; go(paused && current !== -1 ? current : 0); },
      stop() {
        inView = false;
        clearTimeout(advance);
        timers.forEach(clearTimeout);
        timers = [];
        if (current === -1) go(0);
      },
    };
  };

  // Start each canvas demo on the page; it plays while it's in view
  document.querySelectorAll('[data-demo]').forEach((el) => {
    const demo = demos[el.dataset.demo](el);
    demo.stop(); // draws its first (or, with reduced motion, finished) state
    playWhileVisible(el.closest('.canvas') || el, demo);
  });
})();
