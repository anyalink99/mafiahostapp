/* Niokit v0.3.0 — bundled · https://github.com/anyalink99/niokit · MIT */
/* =========================================================================
   KIT — core helpers + namespace bootstrap (plain script, runs from file://)
   window.Kit is the single namespace every module attaches to.
   ========================================================================= */
window.Kit = window.Kit || {};
(function (K) {
  'use strict';
  K.version = '0.3.0';

  K.$  = (sel, root) => (root || document).querySelector(sel);
  K.$$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* el('button.k-btn.k-btn--primary#go', {text, on:{click}}, ...children)
     tag may carry #id and .classes; opts maps to props/attrs/style/dataset/on. */
  K.el = function (tag, opts) {
    opts = opts || {};
    let id = null; const classes = [];
    let name = String(tag || 'div').replace(/[#.][^#.]+/g, (m) => {
      if (m[0] === '#') id = m.slice(1); else classes.push(m.slice(1));
      return '';
    });
    const node = document.createElement(name || 'div');
    if (id) node.id = id;
    if (classes.length) node.className = classes.join(' ');
    for (const key in opts) {
      const v = opts[key];
      if (v == null) continue;
      if (key === 'class' || key === 'className') node.className = (node.className ? node.className + ' ' : '') + v;
      else if (key === 'html') node.innerHTML = v;
      else if (key === 'text') node.textContent = v;
      else if (key === 'style' && typeof v === 'object') {
        for (const sk in v) {
          // CSS custom properties (--foo) НЕ выставляются через style[key]=value
          // (CSSOM их игнорирует — остаются обычным JS-свойством на объекте,
          // в computed style не попадают). Нужен setProperty.
          if (sk.length > 1 && sk[0] === '-' && sk[1] === '-') node.style.setProperty(sk, v[sk]);
          else node.style[sk] = v[sk];
        }
      }
      else if (key === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
      else if (key === 'on' && typeof v === 'object') for (const ev in v) node.addEventListener(ev, v[ev]);
      else if (key in node) { try { node[key] = v; } catch (e) { node.setAttribute(key, v); } }
      else node.setAttribute(key, v);
    }
    const kids = Array.prototype.slice.call(arguments, 2).flat(Infinity);
    for (const c of kids) { if (c == null || c === false) continue; node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))); }
    return node;
  };

  /* direct listener: on(el,'click',fn) ; delegated: on(el,'click','.sel',(e,match)=>{}) */
  K.on = function (target, type, sel, handler) {
    if (typeof sel === 'function') { target.addEventListener(type, sel); return () => target.removeEventListener(type, sel); }
    const fn = (e) => { const t = e.target.closest(sel); if (t && target.contains(t)) handler(e, t); };
    target.addEventListener(type, fn); return () => target.removeEventListener(type, fn);
  };

  K.reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  K.raf2 = (cb) => requestAnimationFrame(() => requestAnimationFrame(cb));

  /* resolve when the element's CSS animation ends (safety-timeout + reduced-motion aware) */
  K.afterAnim = function (el, fallbackMs) {
    return new Promise((resolve) => {
      if (!el || K.reduceMotion()) { resolve(); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; el.removeEventListener('animationend', onEnd); clearTimeout(t); resolve(); };
      const onEnd = (e) => { if (e.target === el) finish(); };
      el.addEventListener('animationend', onEnd);
      const t = setTimeout(finish, fallbackMs || 900);
    });
  };

  /* read a CSS <time> custom property as milliseconds, e.g. cssMs('--k-dur-2') */
  K.cssMs = function (varName, el) {
    const v = getComputedStyle(el || document.documentElement).getPropertyValue(varName).trim();
    if (!v) return 0;
    return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000;
  };

  /* theme helper */
  K.setTheme = (name) => { if (name) document.documentElement.setAttribute('data-theme', name); else document.documentElement.removeAttribute('data-theme'); };

  /* scroll lock with scrollbar-width compensation (no layout shift), ref-counted
     so nested/stacked overlays (modal + sheet) don't unlock each other early. */
  let lockN = 0, lockPad = '';
  K.lockScroll = function () {
    if (++lockN > 1) return;
    const sw = window.innerWidth - document.documentElement.clientWidth;
    lockPad = document.documentElement.style.paddingRight;
    if (sw > 0) document.documentElement.style.paddingRight = sw + 'px';
    document.documentElement.classList.add('k-scroll-locked');
  };
  K.unlockScroll = function () {
    if (lockN > 0) lockN--;
    if (lockN > 0) return;
    document.documentElement.classList.remove('k-scroll-locked');
    document.documentElement.style.paddingRight = lockPad;
  };
})(window.Kit);

/* =========================================================================
   KIT — storage: a small typed localStorage wrapper (already library-grade).
   Kit.storage (unprefixed) or Kit.createStorage('myapp.') for a namespace.
   ========================================================================= */
(function (K) {
  'use strict';
  function make(prefix) {
    prefix = prefix || '';
    const key = (k) => prefix + k;
    const api = {
      get(k, fallback) { try { const v = localStorage.getItem(key(k)); return v == null ? (fallback != null ? fallback : null) : v; } catch (e) { return fallback != null ? fallback : null; } },
      set(k, v) { try { localStorage.setItem(key(k), String(v)); } catch (e) {} return v; },
      remove(k) { try { localStorage.removeItem(key(k)); } catch (e) {} },
      getInt(k, fallback) { const v = parseInt(api.get(k), 10); return Number.isNaN(v) ? (fallback != null ? fallback : 0) : v; },
      getBool(k, fallback) { const v = api.get(k); return v == null ? !!fallback : (v === 'true' || v === '1'); },
      getJSON(k, fallback) { try { const v = api.get(k); return v == null ? (fallback != null ? fallback : null) : JSON.parse(v); } catch (e) { return fallback != null ? fallback : null; } },
      setJSON(k, v) { return api.set(k, JSON.stringify(v)); },
      scoped(p) { return make(prefix + p); },
    };
    return api;
  }
  K.storage = make('');
  K.createStorage = make;
})(window.Kit);

/* =========================================================================
   KIT — store: a tiny reactive state container.
   Replaces the "flat global + manual save/load + manual re-render" pattern.

     const s = Kit.createStore({ angle: 45, theme: 'dark' },
                               { persist: { key: 'app.state', keys: ['theme'] } });
     s.subscribe((state, changed) => render());     // any change
     s.on('angle', (v) => paint(v));                // one key
     s.set('angle', 50);  s.set({ a: 1, b: 2 });    // single or batch
   Notifications coalesce within a microtask, so a burst of sets = one render.
   ========================================================================= */
(function (K) {
  'use strict';
  K.createStore = function (initial, opts) {
    opts = opts || {};
    const persist = opts.persist || null;
    let state = Object.assign({}, initial);
    const subs = new Set();
    const keySubs = new Map();

    if (persist && persist.key) {
      const saved = K.storage.getJSON(persist.key, null);
      if (saved && typeof saved === 'object') state = Object.assign(state, saved);
    }
    const pick = (o, keys) => keys.reduce((r, k) => (k in o && (r[k] = o[k]), r), {});
    function save() {
      if (!persist || !persist.key) return;
      K.storage.setJSON(persist.key, persist.keys ? pick(state, persist.keys) : state);
    }

    let pending = null;
    function notify(changed) {
      if (!pending) pending = new Set();
      changed.forEach((c) => pending.add(c));
      Promise.resolve().then(() => {
        if (!pending) return;
        const ch = pending; pending = null;
        subs.forEach((fn) => fn(state, ch));
        ch.forEach((k) => { const set = keySubs.get(k); if (set) set.forEach((fn) => fn(state[k], state)); });
      });
    }

    const api = {
      get(k) { return k == null ? state : state[k]; },
      set(k, v) {
        let changed;
        if (k && typeof k === 'object') {
          changed = Object.keys(k).filter((key) => state[key] !== k[key]);
          if (!changed.length) return state;
          Object.assign(state, k);
        } else {
          if (state[k] === v) return v;
          changed = [k]; state[k] = v;
        }
        save(); notify(changed);
        return v;
      },
      update(fn) { const patch = fn(Object.assign({}, state)); if (patch) api.set(patch); return state; },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
      on(key, fn) { if (!keySubs.has(key)) keySubs.set(key, new Set()); keySubs.get(key).add(fn); return () => keySubs.get(key).delete(fn); },
      reset(next) { state = Object.assign({}, initial, next || {}); save(); notify(Object.keys(state)); },
    };
    return api;
  };
})(window.Kit);

/* =========================================================================
   KIT — dispatch: one delegated click listener for the whole app.
     Kit.dispatch.init();                       // once, after DOM ready
     Kit.dispatch.action('save', (el, e, h) => {...});
     Kit.dispatch.actions({ save: fn, cancel: fn });
   Markup: <button data-action="save">  ·  <button data-goto="settings">
   data-goto routes through Kit.nav (push) or Kit.screens (go) if present.
   ========================================================================= */
(function (K) {
  'use strict';
  const actions = {};
  const helpers = {
    intAttr: (el, name, d) => { const v = parseInt(el.getAttribute(name), 10); return Number.isNaN(v) ? (d != null ? d : 0) : v; },
    attr: (el, name) => el.getAttribute(name),
    closest: (el, sel) => el.closest(sel),
  };
  let inited = false;

  const D = {
    action(name, fn) { actions[name] = fn; return D; },
    actions(map) { Object.assign(actions, map); return D; },
    has(name) { return !!actions[name]; },
    init(opts) {
      if (inited) return D; inited = true;
      const root = (opts && opts.root) || document.body;
      root.addEventListener('click', (e) => {
        const a = e.target.closest('[data-action]');
        if (a && root.contains(a)) {
          const name = a.getAttribute('data-action');
          if (actions[name]) { e.preventDefault(); actions[name](a, e, helpers); return; }
        }
        const g = e.target.closest('[data-goto]');
        if (g && root.contains(g)) {
          e.preventDefault();
          const id = g.getAttribute('data-goto');
          const mode = g.getAttribute('data-goto-mode'); // 'push' | 'go'
          if (mode === 'push' && K.nav) K.nav.push(id);
          else if (K.screens && K.screens.has && K.screens.has(id)) K.screens.go(id);
          else if (K.nav) K.nav.push(id);
        }
        const b = e.target.closest('[data-back]');
        if (b && root.contains(b)) { e.preventDefault(); if (K.nav) K.nav.back(); }
      });
      return D;
    },
  };
  K.dispatch = D;
})(window.Kit);

/* =========================================================================
   KIT — history router (lifted from geometric.games). Path + query routing
   with a graceful file:// fallback (keeps an in-memory path when the History
   API is unavailable, so the same code works opened as a file).

     Kit.router.init({ onRoute: (r) => render(r) });   // r = {path, segments, query}
     Kit.router.push('/cut/half?daily=1');
     Kit.router.replace('/');
   ========================================================================= */
(function (K) {
  'use strict';
  function canPush() { try { return location.protocol !== 'file:' && !!window.history && typeof history.pushState === 'function'; } catch (e) { return false; } }
  let mem = location.pathname + location.search;
  let onRoute = null;

  function parse() {
    const full = canPush() ? (location.pathname + location.search) : mem;
    const path = full.split('?')[0];
    const search = full.indexOf('?') >= 0 ? full.slice(full.indexOf('?')) : '';
    const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const query = {}; new URLSearchParams(search).forEach((v, k) => { query[k] = v; });
    return { path, segments, query };
  }
  function go(url, replace) {
    if (canPush()) history[replace ? 'replaceState' : 'pushState']({}, '', url);
    else mem = url;
    if (onRoute) onRoute(parse());
  }
  const R = {
    init(opts) {
      opts = opts || {}; onRoute = opts.onRoute || null;
      if (canPush()) window.addEventListener('popstate', () => { if (onRoute) onRoute(parse()); });
      if (opts.fire !== false && onRoute) onRoute(parse());
      return R;
    },
    parse,
    push: (url) => go(url, false),
    replace: (url) => go(url, true),
    canPush,
  };
  K.router = R;
})(window.Kit);

/* =========================================================================
   KIT — app skeletons. Two flavours, pick per project:

   Kit.screens — FLAT fade tabs (all screens in the DOM, crossfade between).
     <div class="k-stage">
       <section class="k-screen k-screen--fade" data-screen="home">…</section>
       <section class="k-screen k-screen--fade" data-screen="profile">…</section>
     </div>
     Kit.screens.init({ stage: '.k-stage', start: 'home',
       hooks: { profile: { onEnter(){…}, onLeave(){…} } } });
     Kit.screens.go('profile');

   Kit.nav — push/pop slide STACK (screens built on demand, iOS-style).
     Kit.nav.init({ stage: '.k-stage', start: 'home',
       screens: { home: () => buildHome(), detail: (p) => buildDetail(p) } });
     Kit.nav.push('detail', { id: 3 });   Kit.nav.back();
   ========================================================================= */
(function (K) {
  'use strict';
  const elOf = (s) => (typeof s === 'string' ? K.$(s) : s);

  /* ---------- flat fade tabs ---------- */
  const hooks = {};
  let stage = null, current = null;
  K.screens = {
    init(opts) {
      opts = opts || {};
      stage = elOf(opts.stage) || document.body;
      Object.assign(hooks, opts.hooks || {});
      K.$$('.k-screen', stage).forEach((s) => s.classList.add('k-screen--fade'));
      if (opts.start) this.go(opts.start, opts.params, true);
      return this;
    },
    register(id, h) { hooks[id] = h; return this; },
    has(id) { return !!(stage && K.$(`.k-screen[data-screen="${id}"]`, stage)); },
    current() { return current; },
    go(id, params, force) {
      if (!stage || (id === current && !force)) return;
      const target = K.$(`.k-screen[data-screen="${id}"]`, stage);
      if (!target) return;
      if (current) {
        const prev = K.$(`.k-screen[data-screen="${current}"]`, stage);
        if (prev) prev.classList.remove('is-active');
        if (hooks[current] && hooks[current].onLeave) hooks[current].onLeave();
      }
      target.classList.add('is-active');
      current = id;
      if (hooks[id] && hooks[id].onEnter) hooks[id].onEnter(params);
    },
  };

  /* ---------- push/pop slide stack ---------- */
  let nstage = null, builders = {}, stack = [], onChange = null;
  const topEl = () => (stack.length ? stack[stack.length - 1].el : null);
  function build(id, params) {
    const b = builders[id];
    if (!b) throw new Error('Kit.nav: no screen "' + id + '"');
    const el = b(params);
    el.classList.add('k-screen');
    el.dataset.screen = id;
    return el;
  }
  function emit() { if (onChange) onChange(stack.length ? stack[stack.length - 1].id : null, stack.length); }

  K.nav = {
    init(opts) {
      opts = opts || {};
      nstage = elOf(opts.stage) || document.body;
      builders = opts.screens || {};
      onChange = opts.onChange || null;
      stack = [];
      if (opts.start) this.mount(opts.start, opts.params);
      return this;
    },
    register(id, builder) { builders[id] = builder; return this; },
    depth() { return stack.length; },
    current() { return stack.length ? stack[stack.length - 1].id : null; },
    mount(id, params) { // first screen, no animation
      const el = build(id, params); nstage.appendChild(el); stack.push({ id, el }); emit(); return el;
    },
    push(id, params) {
      const below = topEl();
      const el = build(id, params);
      el.classList.add('k-screen--enter-fwd');
      nstage.appendChild(el);
      stack.push({ id, el });
      el.addEventListener('animationend', () => el.classList.remove('k-screen--enter-fwd'), { once: true });
      if (below) below.classList.add('k-screen--exit-fwd');
      emit(); return el;
    },
    back() {
      if (stack.length <= 1) return false;
      const leaving = stack.pop().el;
      const below = topEl();
      leaving.classList.remove('k-screen--enter-fwd');
      leaving.classList.add('k-screen--exit-back');
      leaving.addEventListener('animationend', () => leaving.remove(), { once: true });
      if (K.reduceMotion()) leaving.remove();
      if (below) {
        below.classList.remove('k-screen--exit-fwd');
        below.classList.add('k-screen--enter-back');
        below.addEventListener('animationend', () => below.classList.remove('k-screen--enter-back'), { once: true });
      }
      emit(); return true;
    },
    reset(id, params) {
      stack.forEach((s) => s.el.remove());
      stack = [];
      return this.mount(id, params);
    },
  };
})(window.Kit);

/* =========================================================================
   KIT — modal: accessible dialog with backdrop, scroll-lock, focus-trap,
   Escape, restore-focus and stacking. Closes on animationend (no magic ms).

   Pre-existing markup:
     <div class="k-modal" id="help"><div class="k-modal__backdrop"></div>
       <div class="k-modal__panel">…</div></div>
     Kit.modal.open('help');

   Built on the fly (auto-removed on close):
     Kit.modal.open({ html: '<h2>Hi</h2>' });
     Kit.modal.open(someContentEl, { dismissible: true, onClose() {} });
   ========================================================================= */
(function (K) {
  'use strict';
  const open = [];
  const baseZ = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--k-z-modal'), 10) || 900;
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function resolve(target, opts) {
    let overlay = null, created = false;
    if (typeof target === 'string') overlay = document.getElementById(target);
    else if (target instanceof HTMLElement && target.classList.contains('k-modal')) overlay = target;

    if (!overlay) {
      created = true;
      overlay = K.el('div.k-modal', { class: opts.className || '' });
      const backdrop = K.el('div.k-modal__backdrop');
      const panel = K.el('div.k-modal__panel');
      if (typeof target === 'string') panel.innerHTML = target;       // html string
      else if (opts.html) panel.innerHTML = opts.html;
      else if (target instanceof HTMLElement) panel.appendChild(target); // content node
      overlay.appendChild(backdrop); overlay.appendChild(panel);
      document.body.appendChild(overlay);
    } else if (!overlay.querySelector('.k-modal__backdrop')) {
      overlay.insertBefore(K.el('div.k-modal__backdrop'), overlay.firstChild);
    }
    return { overlay, created };
  }

  const M = {
    open(target, opts) {
      opts = opts || {};
      const dismissible = opts.dismissible !== false;
      const { overlay, created } = resolve(target, opts);
      const panel = overlay.querySelector('.k-modal__panel');
      const backdrop = overlay.querySelector('.k-modal__backdrop');

      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      panel.setAttribute('tabindex', '-1');
      overlay.style.zIndex = baseZ() + open.length * 2;

      const inst = { overlay, panel, created, onClose: opts.onClose, prevFocus: document.activeElement };

      const onKey = (e) => {
        if (e.key === 'Escape' && dismissible) { e.stopPropagation(); M.close(overlay); }
        else if (e.key === 'Tab') {
          const f = K.$$(FOCUSABLE, panel).filter((n) => n.offsetParent !== null);
          if (!f.length) { e.preventDefault(); return; }
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      inst.onKey = onKey;
      overlay.addEventListener('keydown', onKey);
      if (dismissible) backdrop.addEventListener('click', () => M.close(overlay));

      open.push(inst);
      K.lockScroll();
      overlay.classList.remove('is-closing');
      overlay.classList.add('is-open');

      K.raf2(() => { const f = K.$$(FOCUSABLE, panel).filter((n) => n.offsetParent !== null); (f[0] || panel).focus(); });
      if (opts.onOpen) opts.onOpen(panel, overlay);
      return inst;
    },

    close(target) {
      const overlay = typeof target === 'string' ? document.getElementById(target) : (target && target.overlay) || target;
      const i = open.findIndex((o) => o.overlay === overlay);
      if (i === -1) return;
      const inst = open.splice(i, 1)[0];
      inst.overlay.classList.add('is-closing');
      K.afterAnim(inst.panel, K.cssMs('--k-dur-2') + 80).then(() => {
        inst.overlay.classList.remove('is-open', 'is-closing');
        inst.overlay.removeEventListener('keydown', inst.onKey);
        if (inst.created) inst.overlay.remove();
        K.unlockScroll();
        if (inst.prevFocus && inst.prevFocus.focus) inst.prevFocus.focus();
        if (inst.onClose) inst.onClose();
      });
    },

    closeTop() { if (open.length) M.close(open[open.length - 1].overlay); },
    count() { return open.length; },
  };
  K.modal = M;
})(window.Kit);

/* =========================================================================
   KIT — bottom sheet: slides up, swipe-down (grip or content-at-top) to
   dismiss, backdrop + Escape + scroll-lock. Driven by inline transitions so
   the drag feels native.

     Kit.sheet.open('<h3>Filters</h3>…', { onClose() {} });
     Kit.sheet.open(contentEl, { grip: true });
     Kit.sheet.close();   // closes the top sheet
   ========================================================================= */
(function (K) {
  'use strict';
  const open = [];
  const baseZ = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--k-z-sheet'), 10) || 800;

  function build(content, opts) {
    const overlay = K.el('div.k-sheet', { class: opts.className || '' });
    const backdrop = K.el('div.k-sheet__backdrop');
    const panel = K.el('div.k-sheet__panel');
    if (opts.grip !== false) panel.appendChild(K.el('div.k-sheet__grip'));
    if (typeof content === 'string') panel.insertAdjacentHTML('beforeend', content);
    else if (opts.html) panel.insertAdjacentHTML('beforeend', opts.html);
    else if (content instanceof HTMLElement) panel.appendChild(content);
    overlay.appendChild(backdrop); overlay.appendChild(panel);
    document.body.appendChild(overlay);
    return { overlay, backdrop, panel };
  }

  function cleanup(inst) {
    inst.overlay.remove();
    document.removeEventListener('keydown', inst.onKey);
    K.unlockScroll();
    if (inst.prevFocus && inst.prevFocus.focus) inst.prevFocus.focus();
    if (inst.onClose) inst.onClose();
  }

  const S = {
    open(content, opts) {
      opts = opts || {};
      const inst = build(content, opts);
      inst.onClose = opts.onClose;
      inst.prevFocus = document.activeElement;
      inst.dismissible = opts.dismissible !== false;
      inst.overlay.setAttribute('role', 'dialog');
      inst.overlay.setAttribute('aria-modal', 'true');
      inst.overlay.style.zIndex = baseZ() + open.length * 2;
      open.push(inst);

      K.lockScroll();
      inst.overlay.classList.add('is-open');
      K.raf2(() => { inst.backdrop.style.opacity = '1'; inst.panel.style.transform = 'translateY(0)'; });

      if (inst.dismissible) inst.backdrop.addEventListener('click', () => S.close(inst.overlay));
      inst.onKey = (e) => { if (e.key === 'Escape' && inst.dismissible) S.close(inst.overlay); };
      document.addEventListener('keydown', inst.onKey);
      attachDrag(inst);
      if (opts.onOpen) opts.onOpen(inst.panel, inst.overlay);
      return inst;
    },

    close(target) {
      let inst;
      if (!target) inst = open[open.length - 1];
      else { const ov = target.overlay || target; inst = open.find((o) => o.overlay === ov); }
      if (!inst) return;
      open.splice(open.indexOf(inst), 1);
      inst.panel.style.transition = ''; inst.backdrop.style.transition = '';
      inst.panel.style.transform = 'translateY(100%)';
      inst.backdrop.style.opacity = '0';
      const ms = K.reduceMotion() ? 0 : K.cssMs('--k-dur-3') + 60;
      setTimeout(() => cleanup(inst), ms);
    },
    count() { return open.length; },
  };

  function attachDrag(inst) {
    const panel = inst.panel, backdrop = inst.backdrop;
    let dragging = false, allow = false, startY = 0, dy = 0, h = 0;
    panel.addEventListener('pointerdown', (e) => {
      allow = !!e.target.closest('.k-sheet__grip') || panel.scrollTop <= 0;
      dragging = true; startY = e.clientY; dy = 0; h = panel.offsetHeight;
    });
    panel.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const d = e.clientY - startY;
      if (!allow) return;
      if (d <= 0) { dragging = false; panel.style.transition = ''; panel.style.transform = 'translateY(0)'; return; }
      dy = d;
      panel.style.transition = 'none';
      panel.style.transform = `translateY(${dy}px)`;
      backdrop.style.opacity = String(Math.max(0, 1 - dy / (h * 1.1)));
      e.preventDefault();
      try { panel.setPointerCapture(e.pointerId); } catch (_) {}
    });
    const end = () => {
      if (!dragging) return; dragging = false;
      panel.style.transition = ''; backdrop.style.transition = '';
      if (dy > Math.min(160, h * 0.3)) S.close(inst.overlay);
      else { panel.style.transform = 'translateY(0)'; backdrop.style.opacity = '1'; }
      dy = 0;
    };
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
  }

  K.sheet = S;
})(window.Kit);

/* =========================================================================
   KIT — slot: inline collapsible side panel for flex rows.

   The heavy lifting is in CSS (.k-slot in components.css — see comment
   there for the THREE setup requirements: parent flex+gap, --k-slot-cancel
   = parent_gap / 2, and content in a CHILD div, not directly on .k-slot).

   This module is just a thin class-toggle wrapper. The only smart bit is
   raf2 on open() — a slot that was JUST mounted with class added in the
   same tick would skip the transition and snap straight to its open width.
   Two requestAnimationFrame ticks ensure the browser has painted the
   initial width:0 state before we add .is-open.

     <aside class="k-slot" id="detail" style="--k-slot-w: 22rem">
       <div>your content with padding/bg/etc</div>
     </aside>
     Kit.slot.open('detail');
     Kit.slot.close('detail');
     Kit.slot.toggle('detail');           // flip current state
     Kit.slot.toggle('detail', true);     // force open (idempotent)
     Kit.slot.isOpen('detail') -> bool
   ========================================================================= */
(function (K) {
  'use strict';

  function resolve(target) {
    if (typeof target === 'string') return document.getElementById(target);
    if (target instanceof HTMLElement) return target;
    return null;
  }

  const S = {
    open(target) {
      const el = resolve(target);
      if (!el || el.classList.contains('is-open')) return;
      const tick = K.raf2 || ((cb) => requestAnimationFrame(() => requestAnimationFrame(cb)));
      tick(() => el.classList.add('is-open'));
    },
    close(target) {
      const el = resolve(target);
      if (el) el.classList.remove('is-open');
    },
    toggle(target, force) {
      if (typeof force === 'boolean') return force ? S.open(target) : S.close(target);
      const el = resolve(target);
      if (!el) return;
      if (el.classList.contains('is-open')) S.close(target);
      else S.open(target);
    },
    isOpen(target) {
      const el = resolve(target);
      return !!(el && el.classList.contains('is-open'));
    },
  };

  K.slot = S;
})(window.Kit);

/* =========================================================================
   KIT — accordion: vertical collapsible sections with measured max-height
   animation (no magic 99999px hack, no jump on close).

   The hard part is animating to/from auto-height. CSS can't transition to
   `height: auto`, so we measure the inner element's scrollHeight, write it
   as an explicit max-height (which CAN transition from 0), and switch to
   `max-height: none` after the transition finishes so the section can grow
   when its contents change later. On close we reverse: pin current height
   first, force reflow, then set to 0 — otherwise the transition from
   `none` is instant.

   Markup:
     <div class="k-accordion" id="acc" data-single>
       <section class="k-accordion__item is-expanded">
         <button class="k-accordion__header" type="button">Section 1</button>
         <div class="k-accordion__body">
           <div class="k-accordion__inner">…content…</div>
         </div>
       </section>
       <section class="k-accordion__item">…</section>
     </div>

   Init (auto-binds clicks on .k-accordion__header):
     Kit.accordion('#acc');                    // multi-open
     Kit.accordion('#acc', { single: true });  // accordion (one at a time)
     Kit.accordion(rootEl, { single: true });  // by element instead of selector

     `data-single` attribute on the root is equivalent to `{ single: true }`.

   Imperative API (operate on an item element):
     Kit.accordion.expand(item)              // opens, idempotent
     Kit.accordion.collapse(item)            // closes, idempotent
     Kit.accordion.toggle(item)              // flip current state
     Kit.accordion.toggle(item, true|false)  // force open / close
     Kit.accordion.isExpanded(item) -> bool
     Kit.accordion.recompute(item|root)      // after content changed inside
                                             // an open section, recalc maxh
   ========================================================================= */
(function (K) {
  'use strict';

  function bodyOf(item) { return item && item.querySelector(':scope > .k-accordion__body'); }
  function innerOf(item) {
    var b = bodyOf(item);
    return b && (b.querySelector(':scope > .k-accordion__inner') || b.firstElementChild);
  }

  function animateBodyTo(item, targetPx) {
    var body = bodyOf(item);
    if (!body) return;
    body.style.maxHeight = targetPx + 'px';
    var onEnd = function (e) {
      if (e && e.propertyName !== 'max-height') return;
      body.removeEventListener('transitionend', onEnd);
      // Только если секция всё ещё «open» к моменту окончания. Иначе быстрый
      // toggle во время transition оставил бы её с maxHeight: none на закрытой.
      if (item.classList.contains('is-expanded')) body.style.maxHeight = 'none';
    };
    body.addEventListener('transitionend', onEnd);
  }

  function expand(item) {
    if (!item || item.classList.contains('is-expanded')) return;
    var body = bodyOf(item);
    if (!body) return;
    item.classList.add('is-expanded');
    body.style.maxHeight = '0px';
    void body.offsetHeight; // force reflow — иначе transition стартует уже с целевой высоты
    var inner = innerOf(item);
    animateBodyTo(item, inner ? inner.scrollHeight : body.scrollHeight);
  }

  function collapse(item) {
    if (!item || !item.classList.contains('is-expanded')) return;
    var body = bodyOf(item);
    if (!body) return;
    // Текущая высота может быть `none` — transition с auto не пойдёт.
    // Фиксируем её в px, форсим reflow, потом ставим 0.
    var inner = innerOf(item);
    body.style.maxHeight = (inner ? inner.scrollHeight : body.scrollHeight) + 'px';
    void body.offsetHeight;
    item.classList.remove('is-expanded');
    body.style.maxHeight = '0px';
  }

  function toggle(item, force) {
    if (typeof force === 'boolean') return force ? expand(item) : collapse(item);
    if (!item) return;
    if (item.classList.contains('is-expanded')) collapse(item);
    else expand(item);
  }

  function isExpanded(item) {
    return !!(item && item.classList.contains('is-expanded'));
  }

  // Когда контент внутри открытой секции поменялся (показалось/скрылось
  // что-то, перерендерилось), её max-height (зафиксированный в `none`)
  // достаточен. Но если переход ещё идёт — перевыставляем actual scrollHeight.
  function recompute(target) {
    if (!target) return;
    var items;
    if (target.classList && target.classList.contains('k-accordion__item')) {
      items = [target];
    } else {
      items = K.$$('.k-accordion__item.is-expanded', target);
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item.classList.contains('is-expanded')) continue;
      var body = bodyOf(item);
      var inner = innerOf(item);
      if (body) animateBodyTo(item, inner ? inner.scrollHeight : body.scrollHeight);
    }
  }

  // Главная функция-инициализатор. Можно вызвать на root-элементе/селекторе,
  // дальше click'и по .k-accordion__header сами разводятся.
  function init(rootOrSelector, opts) {
    var root = typeof rootOrSelector === 'string' ? document.querySelector(rootOrSelector) : rootOrSelector;
    if (!root) return null;
    opts = opts || {};
    var single = opts.single === true || root.hasAttribute('data-single');

    // Секции, которые уже помечены .is-expanded в HTML, должны сразу иметь
    // max-height: none — без этого они закрыты (max-height из CSS = 0).
    var pre = K.$$('.k-accordion__item.is-expanded', root);
    for (var i = 0; i < pre.length; i++) {
      var b = bodyOf(pre[i]);
      if (b) b.style.maxHeight = 'none';
    }

    K.on(root, 'click', '.k-accordion__header', function (e, headerEl) {
      var item = headerEl.closest('.k-accordion__item');
      if (!item || !root.contains(item)) return;
      if (item.classList.contains('is-expanded')) {
        collapse(item);
      } else {
        if (single) {
          var open = K.$$('.k-accordion__item.is-expanded', root);
          for (var j = 0; j < open.length; j++) collapse(open[j]);
        }
        expand(item);
      }
    });

    return root;
  }

  // Экспортируем init как callable + методы на нём. Перекликается с Kit.toast
  // (можно вызвать Kit.toast(msg) или Kit.toast.show(...)).
  init.expand = expand;
  init.collapse = collapse;
  init.toggle = toggle;
  init.isExpanded = isExpanded;
  init.recompute = recompute;

  K.accordion = init;
})(window.Kit);

/* =========================================================================
   KIT — toast: stacked, auto-dismissing, tap-to-dismiss transient messages.
     Kit.toast('Saved');                         // default
     Kit.toast.good('Done ✓');  Kit.toast.danger('Failed');
     Kit.toast.show('Custom', { type: 'warn', duration: 4000 });
   ========================================================================= */
(function (K) {
  'use strict';
  let container = null;
  const ensure = () => (container || (container = document.body.appendChild(K.el('div.k-toasts'))));

  function show(msg, opts) {
    opts = opts || {};
    const cls = 'div.k-toast' + (opts.type && opts.type !== 'default' ? '.k-toast--' + opts.type : '');
    const el = K.el(cls, { text: msg, role: 'status', 'aria-live': 'polite' });
    ensure().appendChild(el);
    const hide = () => { clearTimeout(el._t); el.classList.add('is-out'); K.afterAnim(el, K.cssMs('--k-dur-2') + 80).then(() => el.remove()); };
    el._t = setTimeout(hide, opts.duration != null ? opts.duration : 2600);
    el.addEventListener('click', hide);
    return el;
  }
  const T = (msg, opts) => show(msg, opts);
  T.show = show;
  T.good = (m, o) => show(m, Object.assign({ type: 'good' }, o));
  T.warn = (m, o) => show(m, Object.assign({ type: 'warn' }, o));
  T.danger = (m, o) => show(m, Object.assign({ type: 'danger' }, o));
  K.toast = T;
})(window.Kit);

/* =========================================================================
   KIT — fx: small interaction/animation helpers.
     Kit.fx.animateHeight(el, () => { el.innerHTML = ... })   // FLIP height morph
     Kit.fx.press(el)                                         // robust pressed state
     Kit.fx.longpress(el, (e) => {}, { ms: 500 })
     Kit.fx.swipe(el, { onSwipe: (dir, info) => {}, threshold: 40 })
     Kit.fx.tilt(el)                                          // subtle pointer tilt
   ========================================================================= */
(function (K) {
  'use strict';
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  const fx = {
    _z: 20,
    /* smoothly morph height across a DOM mutation (Web Animations API) */
    animateHeight(el, mutate, opts) {
      const from = el.offsetHeight;
      if (mutate) mutate();
      const to = el.offsetHeight;
      if (K.reduceMotion() || from === to) return Promise.resolve();
      const dur = (opts && opts.duration) || 280;
      const prevOverflow = el.style.overflow;
      el.style.overflow = 'hidden';
      const anim = el.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: dur, easing: EASE });
      return anim.finished.catch(() => {}).then(() => { el.style.overflow = prevOverflow; });
    },

    /* adds/removes .is-pressed — avoids :active sticking after a swipe/drag */
    press(el) {
      const on = () => el.classList.add('is-pressed');
      const off = () => el.classList.remove('is-pressed');
      el.addEventListener('pointerdown', on);
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, off));
      return el;
    },

    longpress(el, fn, opts) {
      opts = opts || {}; const ms = opts.ms || 500; let t = null, sx = 0, sy = 0;
      const clear = () => { if (t) { clearTimeout(t); t = null; } };
      el.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; clear(); t = setTimeout(() => { t = null; fn(e); }, ms); });
      el.addEventListener('pointermove', (e) => { if (t && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) clear(); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((tp) => el.addEventListener(tp, clear));
      return () => clear();
    },

    swipe(el, opts) {
      opts = opts || {}; const thr = opts.threshold || 40; let sx = 0, sy = 0, down = false;
      el.addEventListener('pointerdown', (e) => { down = true; sx = e.clientX; sy = e.clientY; });
      const end = (e) => {
        if (!down) return; down = false;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < thr) return;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (opts.onSwipe) opts.onSwipe(dir, { dx, dy, event: e });
      };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { down = false; });
      return el;
    },

    /* make an absolutely-positioned element draggable by `handle` (or itself);
       updates left/top, lifts z-index. Powers moodboard-style canvases. */
    draggable(el, opts) {
      opts = opts || {};
      const handle = opts.handle ? (typeof opts.handle === 'string' ? el.querySelector(opts.handle) : opts.handle) : el;
      let down = false, sx = 0, sy = 0, ox = 0, oy = 0;
      const start = (e) => {
        if (e.button === 1 || e.button === 2) return;
        down = true; sx = e.clientX; sy = e.clientY;
        ox = parseFloat(el.style.left) || el.offsetLeft; oy = parseFloat(el.style.top) || el.offsetTop;
        el.style.zIndex = ++fx._z; el.classList.add('is-dragging');
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
      };
      const move = (e) => { if (!down) return; const x = ox + (e.clientX - sx), y = oy + (e.clientY - sy); el.style.left = x + 'px'; el.style.top = y + 'px'; if (opts.onMove) opts.onMove(x, y); };
      const end = () => { if (!down) return; down = false; el.classList.remove('is-dragging'); if (opts.onEnd) opts.onEnd(parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0); };
      handle.addEventListener('pointerdown', start);
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
      return () => { handle.removeEventListener('pointerdown', start); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); };
    },

    /* drag `handle` to resize `target` along an axis; persists to storage. */
    resizable(handle, opts) {
      opts = opts || {};
      const target = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
      const axis = opts.axis || 'x', dim = axis === 'x' ? 'width' : 'height';
      const min = opts.min || 200, max = opts.max || 4000;
      if (opts.storageKey) { const v = K.storage.getInt(opts.storageKey, 0); if (v) target.style[dim] = v + 'px'; }
      let down = false, s = 0, base = 0;
      handle.addEventListener('pointerdown', (e) => { down = true; s = axis === 'x' ? e.clientX : e.clientY; base = axis === 'x' ? target.offsetWidth : target.offsetHeight; try { handle.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
      handle.addEventListener('pointermove', (e) => { if (!down) return; const d = ((axis === 'x' ? e.clientX : e.clientY) - s) * (opts.invert ? -1 : 1); target.style[dim] = Math.max(min, Math.min(max, base + d)) + 'px'; if (opts.onResize) opts.onResize(); });
      const end = () => { if (!down) return; down = false; if (opts.storageKey) K.storage.set(opts.storageKey, parseInt(target.style[dim], 10)); };
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    },

    /* subtle 3D tilt toward the pointer; returns a disposer */
    tilt(el, opts) {
      opts = opts || {}; const max = opts.max || 8;
      if (K.reduceMotion()) return () => {};
      const move = (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(600px) rotateY(${px * max}deg) rotateX(${-py * max}deg)`;
      };
      const reset = () => { el.style.transform = ''; };
      el.addEventListener('pointermove', move); el.addEventListener('pointerleave', reset);
      return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', reset); reset(); };
    },
  };
  K.fx = fx;
})(window.Kit);

/* =========================================================================
   KIT — color picker (SV square + hue bar + hex), pointer & touch, no deps.
     const cp = Kit.ColorPicker.mount(containerEl, {
       value: '#c8ff5e', onChange: (hex) => {}
     });  // -> { get(), set(hex), destroy() }

     Kit.ColorPicker.open({ value, onChange, onDone });  // inside a kit modal
   ========================================================================= */
(function (K) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function hexToRgb(hex) {
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return { h, s: mx ? d / mx : 0, v: mx };
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  function mount(container, opts) {
    opts = opts || {};
    let h = 0, s = 1, v = 1;
    const root = K.el('div.k-cp', {},
      K.el('div.k-cp__sv', {}, K.el('div.k-cp__thumb.k-cp__sv-thumb')),
      K.el('div.k-cp__hue', {}, K.el('div.k-cp__thumb.k-cp__hue-thumb')),
      K.el('div.k-cp__row', {},
        K.el('input.k-field.k-cp__hex', { type: 'text', spellcheck: false, maxlength: 7 }),
        K.el('div.k-cp__swatch')
      )
    );
    container.appendChild(root);
    const sv = K.$('.k-cp__sv', root), hue = K.$('.k-cp__hue', root);
    const svThumb = K.$('.k-cp__sv-thumb', root), hueThumb = K.$('.k-cp__hue-thumb', root);
    const hex = K.$('.k-cp__hex', root), swatch = K.$('.k-cp__swatch', root);

    function current() { const c = hsvToRgb(h, s, v); return rgbToHex(c.r, c.g, c.b); }
    function paint(emit) {
      sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${h} 100% 50%)`;
      svThumb.style.left = s * 100 + '%';
      svThumb.style.top = (1 - v) * 100 + '%';
      hueThumb.style.left = (h / 360) * 100 + '%';
      const hexv = current();
      swatch.style.background = hexv;
      if (document.activeElement !== hex) hex.value = hexv.toUpperCase();
      if (emit && opts.onChange) opts.onChange(hexv);
    }
    function setHex(val) {
      const rgb = hexToRgb(val); if (!rgb) return false;
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b); h = hsv.h; s = hsv.s; v = hsv.v; return true;
    }

    function drag(el, onMove) {
      const handler = (e) => { const r = el.getBoundingClientRect(); onMove(clamp(e.clientX - r.left, 0, r.width) / r.width, clamp(e.clientY - r.top, 0, r.height) / r.height); paint(true); };
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); handler(e); const mv = (ev) => handler(ev); const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
    }
    drag(sv, (x, y) => { s = x; v = 1 - y; });
    drag(hue, (x) => { h = x * 360; });
    hex.addEventListener('input', () => { let val = hex.value.trim(); if (val[0] !== '#') val = '#' + val; if (setHex(val)) paint(true); });

    if (opts.value) setHex(opts.value);
    paint(false);
    return { get: current, set: (val) => { if (setHex(val)) paint(false); }, destroy: () => root.remove(), el: root };
  }

  function openModal(opts) {
    opts = opts || {};
    const wrap = K.el('div', { style: { display: 'grid', gap: '14px', placeItems: 'center' } });
    const cp = mount(wrap, { value: opts.value, onChange: opts.onChange });
    const actions = K.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } },
      K.el('button.k-btn.k-btn--block', { text: 'Отмена', on: { click: () => K.modal.close(inst.overlay) } }),
      K.el('button.k-btn.k-btn--primary.k-btn--block', { text: 'Готово', on: { click: () => { if (opts.onDone) opts.onDone(cp.get()); K.modal.close(inst.overlay); } } })
    );
    wrap.appendChild(actions);
    const inst = K.modal.open(wrap, { onClose: opts.onClose });
    return cp;
  }

  K.ColorPicker = { mount, open: openModal, hexToRgb, rgbToHex, rgbToHsv, hsvToRgb };
})(window.Kit);

/* =========================================================================
   KIT — keybind manager: capture/rebind/dedupe, layout-independent (uses
   event.code, so Cyrillic/QWERTY/etc. all work). Optional persistence.

     const kb = Kit.keybinds.create({
       binds: { shuffle: 'Space', reset: 'KeyR' },
       persist: 'app.binds',
       onChange: (binds) => renderKeys(),
     });
     kb.on('shuffle', () => doShuffle());   // fires when bound key pressed
     kb.start('shuffle');                   // arm rebinding; next key is captured
     kb.onCapture((action) => render());    // capture finished/cancelled
     Kit.keybinds.label('KeyR') // -> 'R'
   ========================================================================= */
(function (K) {
  'use strict';

  function label(code) {
    if (!code) return '—';
    return code
      .replace(/^Key/, '').replace(/^Digit/, '')
      .replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('ArrowUp', '↑').replace('ArrowDown', '↓')
      .replace('Backquote', '`').replace('Minus', '-').replace('Equal', '=')
      .replace('BracketLeft', '[').replace('BracketRight', ']')
      .replace('Semicolon', ';').replace('Quote', "'").replace('Comma', ',').replace('Period', '.').replace('Slash', '/')
      .replace('ControlLeft', 'Ctrl').replace('ControlRight', 'Ctrl')
      .replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift');
  }

  function create(opts) {
    opts = opts || {};
    const binds = Object.assign({}, opts.binds || {});
    const persist = opts.persist || null;
    const actionCbs = {};
    let capturing = null, captureCb = null;
    if (persist) { const saved = K.storage.getJSON(persist, null); if (saved) Object.assign(binds, saved); }
    const save = () => { if (persist) K.storage.setJSON(persist, binds); };

    const handler = (e) => {
      if (capturing) {
        e.preventDefault();
        if (e.code === 'Escape') { capturing = null; if (captureCb) captureCb(null, binds); return; }
        for (const a in binds) if (binds[a] === e.code) delete binds[a]; // dedupe
        binds[capturing] = e.code;
        const done = capturing; capturing = null; save();
        if (captureCb) captureCb(done, binds);
        if (opts.onChange) opts.onChange(binds);
        return;
      }
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      for (const a in binds) {
        if (binds[a] === e.code && actionCbs[a]) { e.preventDefault(); actionCbs[a](e); }
      }
    };
    document.addEventListener('keydown', handler);

    return {
      binds,
      get: (a) => binds[a],
      set: (a, code) => { binds[a] = code; save(); if (opts.onChange) opts.onChange(binds); },
      on: (a, cb) => { actionCbs[a] = cb; },
      start: (a) => { capturing = a; },
      cancel: () => { capturing = null; },
      capturing: () => capturing,
      onCapture: (cb) => { captureCb = cb; },
      match: (e) => { for (const a in binds) if (binds[a] === e.code) return a; return null; },
      label,
      destroy: () => document.removeEventListener('keydown', handler),
    };
  }

  K.keybinds = { create, label };
})(window.Kit);
