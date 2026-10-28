/* Shared by every page: the theme toggle and the case study password gate. */
(() => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

  /* ---------- Theme ---------- */
  const toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    const options = [...toggle.querySelectorAll('[data-theme-value]')];
    let transitionTimer;

    const syncToggle = () => {
      options.forEach((btn) => {
        const active = btn.dataset.themeValue === root.dataset.theme;
        btn.setAttribute('aria-checked', String(active));
        btn.tabIndex = active ? 0 : -1;
      });
    };

    const setTheme = (theme) => {
      if (theme === root.dataset.theme) return;
      if (!reduceMotion) {
        root.classList.add('theme-transition');
        clearTimeout(transitionTimer);
        transitionTimer = setTimeout(() => root.classList.remove('theme-transition'), 650);
      }
      root.dataset.theme = theme;
      try { localStorage.setItem('theme', theme); } catch (e) {}
      syncToggle();
    };

    options.forEach((btn) => btn.addEventListener('click', () => setTheme(btn.dataset.themeValue)));
    toggle.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      setTheme(next);
      toggle.querySelector(`[data-theme-value="${next}"]`).focus();
    });
    syncToggle();
  }

  /* ---------- Case study gate ----------
     A light gate for a static site: only a SHA-256 hash of the password is shipped, and a correct
     entry is remembered in this browser so every case study opens from then on. The pages
     themselves are still public files, so this keeps casual visitors out rather than securing them. */
  const ACCESS_KEY = 'case-access';
  const PASSWORD_HASH = '184713e42b7a88ff777846701a47ae4b68d85b191544d07156acb8212520914e';

  const isUnlocked = () => {
    try { return localStorage.getItem(ACCESS_KEY) === PASSWORD_HASH; } catch (e) { return false; }
  };
  const remember = () => {
    try { localStorage.setItem(ACCESS_KEY, PASSWORD_HASH); } catch (e) {}
  };
  async function sha256(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let gate = null;
  function buildGate() {
    gate = document.createElement('div');
    gate.className = 'gate';
    gate.hidden = true;
    gate.innerHTML = `
      <div class="gate__backdrop"></div>
      <form class="gate__panel" role="dialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-text" novalidate>
        <span class="gate__icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3.75" y="8.25" width="10.5" height="7.5" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M6 8.25V6a3 3 0 0 1 6 0v2.25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </span>
        <h2 class="gate__title" id="gate-title">Case studies are password protected</h2>
        <p class="gate__text" id="gate-text">Enter the password to view my work. You’ll only need to do this once.</p>
        <label class="gate__field">
          <span class="visually-hidden">Password</span>
          <input class="gate__input" type="password" name="password" autocomplete="current-password" placeholder="Password" required>
        </label>
        <p class="gate__error" role="alert"></p>
        <div class="gate__actions">
          <a class="gate__cancel" href="/">Cancel</a>
          <button class="gate__submit" type="submit">Unlock</button>
        </div>
      </form>`;
    document.body.append(gate);
    return gate;
  }

  function lockScroll(lock) {
    if (lock) root.style.setProperty('--scrollbar-width', `${window.innerWidth - root.clientWidth}px`);
    root.classList.toggle('is-locked', lock);
  }

  /** Ask for the password. Resolves once it's correct; rejects if the visitor cancels. */
  function openGate({ dismissible = true } = {}) {
    if (!gate) buildGate();
    const panel = gate.querySelector('.gate__panel');
    const input = gate.querySelector('.gate__input');
    const error = gate.querySelector('.gate__error');
    const cancel = gate.querySelector('.gate__cancel');
    const submit = gate.querySelector('.gate__submit');
    const backdrop = gate.querySelector('.gate__backdrop');
    const previousFocus = document.activeElement;

    cancel.textContent = dismissible ? 'Cancel' : 'Back to home';
    input.value = '';
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    submit.disabled = false;

    lockScroll(true);
    gate.hidden = false;
    if (!reduceMotion) {
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE_OUT });
      panel.animate(
        [{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
        { duration: 480, easing: EASE_OUT }
      );
    }
    requestAnimationFrame(() => input.focus({ preventScroll: true }));

    return new Promise((resolve, reject) => {
      const close = async (unlocked) => {
        cleanup();
        if (!reduceMotion) {
          const out = { duration: unlocked ? 360 : 240, easing: EASE_OUT, fill: 'forwards' };
          backdrop.animate([{ opacity: 1 }, { opacity: 0 }], out);
          await panel.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px) scale(0.99)' }], out).finished;
        }
        gate.hidden = true;
        gate.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        lockScroll(false);
        if (unlocked) resolve();
        else { if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true }); reject(new Error('cancelled')); }
      };

      const onSubmit = async (event) => {
        event.preventDefault();
        if (!input.value) { input.focus(); return; }
        submit.disabled = true;
        const ok = (await sha256(input.value)) === PASSWORD_HASH;
        if (ok) {
          remember();
          submit.textContent = 'Unlocked';
          close(true);
          return;
        }
        submit.disabled = false;
        error.textContent = 'That password isn’t right. Please try again.';
        input.setAttribute('aria-invalid', 'true');
        input.select();
        if (!reduceMotion) {
          panel.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' },
              { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }],
            { duration: 420, easing: 'ease-out' }
          );
        }
      };
      const onCancel = (event) => {
        if (!dismissible) return; // the link takes the visitor home
        event.preventDefault();
        close(false);
      };
      const onKey = (event) => {
        if (event.key === 'Escape' && dismissible) close(false);
        if (event.key === 'Tab') {
          // Keep focus inside the dialog
          const focusables = [input, cancel, submit];
          const i = focusables.indexOf(document.activeElement);
          const next = (i + (event.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
          event.preventDefault();
          focusables[next].focus();
        }
      };
      const onBackdrop = () => { if (dismissible) close(false); };
      function cleanup() {
        panel.removeEventListener('submit', onSubmit);
        cancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        backdrop.removeEventListener('click', onBackdrop);
        submit.textContent = 'Unlock';
      }

      panel.addEventListener('submit', onSubmit);
      cancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      backdrop.addEventListener('click', onBackdrop);
    });
  }

  // Links into case studies ask for the password the first time.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-case-link]');
    if (!link || isUnlocked() || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    openGate().then(() => { window.location.href = link.href; }, () => {});
  });

  // A case study page opened directly asks first, and only then reveals itself.
  if (document.body.hasAttribute('data-case-page')) {
    const reveal = () => {
      root.classList.remove('case-locked');
      document.dispatchEvent(new CustomEvent('case:unlocked'));
    };
    if (isUnlocked()) reveal();
    else openGate({ dismissible: false }).then(reveal, () => {});
  }
})();
