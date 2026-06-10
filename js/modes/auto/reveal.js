/**
 * Автономный режим — раздача ролей (auto-reveal-screen).
 * Pass-and-hold: игрок удерживает круг — видит роль, отпускает — экран чистый,
 * телефон передаётся следующему.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;

  app.renderAutoReveal = function () {
    var s = app.autoState;
    // Skip phantom seats (Каспер) — no real player to view their card.
    while (s.reveal.cursor <= A.playerCount() && A.isPhantomSeat(A.seatById(s.reveal.cursor))) {
      s.reveal.cursor++;
    }
    var n = s.reveal.cursor;
    if (n > A.playerCount()) {
      A.transitionToNightIntro();
      return;
    }
    var numEl = el('auto-reveal-num');
    if (numEl) numEl.textContent = '№' + n;
    var holdBtn = el('auto-reveal-hold-btn');
    if (holdBtn) {
      holdBtn.classList.remove('auto-reveal-active');
      holdBtn.classList.remove('hidden');
    }
    var conf = el('auto-reveal-confirm');
    if (conf) conf.classList.add('hidden');
    var prompt = el('auto-reveal-prompt');
    if (prompt)
      prompt.textContent = 'Удерживай круг, чтобы увидеть свою роль. Отпустишь — экран очистится.';
    hideRevealOverlay();
    app._autoEphemeral.holdActive = false;
    app._autoEphemeral.holdViewed = false;
    app._autoEphemeral.holdPid = null;
  };

  function showRevealOverlay(role) {
    var ov = el('auto-reveal-overlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    ov.classList.add('is-open');
    var bg = el('auto-reveal-overlay-bg');
    if (bg)
      bg.className =
        'absolute inset-0 ' + (A.isMafiaSide(role) ? 'bg-mafia-black' : 'bg-mafia-blood');
    var iconWrap = el('auto-reveal-overlay-icon');
    if (iconWrap) {
      iconWrap.innerHTML = '';
      iconWrap.appendChild(A.roleIconEl(role, 'role-icon--large'));
    }
    var nameEl = el('auto-reveal-overlay-name');
    if (nameEl) nameEl.textContent = A.ROLE_NAMES[role] || role;
  }

  function hideRevealOverlay() {
    var ov = el('auto-reveal-overlay');
    if (!ov) return;
    ov.classList.add('hidden');
    ov.classList.remove('is-open');
  }
  A.hideRevealOverlay = hideRevealOverlay;

  function bindRevealHoldGestures() {
    var btn = el('auto-reveal-hold-btn');
    if (!btn || btn._autoBound) return;
    btn._autoBound = true;
    var startHold = function (e) {
      if (e && e.cancelable) e.preventDefault();
      var s = app.autoState;
      if (s.phase !== 'reveal') return;
      var seat = A.seatById(s.reveal.cursor);
      if (!seat) return;
      app._autoEphemeral.holdActive = true;
      app._autoEphemeral.holdPid = e && e.pointerId !== undefined ? e.pointerId : null;
      btn.classList.add('auto-reveal-active');
      showRevealOverlay(seat.role);
      if (e && e.pointerId !== undefined && btn.setPointerCapture) {
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (_) {}
      }
    };
    var endHold = function (e) {
      if (!app._autoEphemeral.holdActive) return;
      if (
        e &&
        e.pointerId !== undefined &&
        app._autoEphemeral.holdPid !== null &&
        e.pointerId !== app._autoEphemeral.holdPid
      )
        return;
      app._autoEphemeral.holdActive = false;
      app._autoEphemeral.holdViewed = true;
      btn.classList.remove('auto-reveal-active');
      hideRevealOverlay();
      btn.classList.add('hidden');
      var conf = el('auto-reveal-confirm');
      if (conf) conf.classList.remove('hidden');
      var prompt = el('auto-reveal-prompt');
      if (prompt) {
        var s = app.autoState;
        var next = (s.reveal.cursor || 1) + 1;
        // Skip phantom seats — they have no real player to pass to.
        while (next <= A.playerCount() && A.isPhantomSeat(A.seatById(next))) next++;
        if (next > A.playerCount()) {
          prompt.textContent = 'Запомнил? Кладите телефон в центр стола.';
        } else {
          prompt.textContent = 'Запомнил? Передавай дальше, игроку №' + next + '.';
        }
      }
    };
    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', startHold);
      btn.addEventListener('pointerup', endHold);
      btn.addEventListener('pointercancel', endHold);
      btn.addEventListener('pointerleave', endHold);
    } else {
      btn.addEventListener('mousedown', startHold);
      btn.addEventListener('mouseup', endHold);
      btn.addEventListener('mouseleave', endHold);
      btn.addEventListener(
        'touchstart',
        function (e) {
          startHold(e);
        },
        { passive: false }
      );
      btn.addEventListener('touchend', endHold);
      btn.addEventListener('touchcancel', endHold);
    }
  }
  A.bindRevealHoldGestures = bindRevealHoldGestures;

  app.advanceReveal = function () {
    A.pushHistory();
    var s = app.autoState;
    s.reveal.cursor = (s.reveal.cursor || 1) + 1;
    if (s.reveal.cursor > A.playerCount()) {
      s.reveal.cursor = A.playerCount();
      A.saveAuto();
      A.transitionToNightIntro();
      return;
    }
    A.saveAuto();
    app.renderAutoReveal();
  };

  app.registerScreenRenderer('auto-reveal-screen', function () {
    app.renderAutoReveal();
  });
})(window.MafiaApp);
