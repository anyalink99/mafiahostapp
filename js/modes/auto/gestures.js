/**
 * Автономный режим — глобальные жесты:
 *   • откат на шаг назад (5-сек удержание в любом месте экрана + Backspace);
 *   • жесты на слотах игроков дня (long-press = выставить, свайп = фол).
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;

  function goBackOneStep() {
    A.clearAllAutoTimers();
    A.hideRevealOverlay();
    var pmodal = el('modal-auto-player-actions');
    if (pmodal && app.modalSetOpen) app.modalSetOpen(pmodal, false);
    if (app.hideAutoVoteCountModal) app.hideAutoVoteCountModal();
    var snap = A.popHistory();
    if (!snap) return;
    A.saveAuto();
    var s = app.autoState;
    app.navigateToScreen(A.resolvePendingPhase(s.phase));
  }

  function ensureBackHoldIndicator() {
    var ind = el('auto-back-hold-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'auto-back-hold-indicator';
      document.body.appendChild(ind);
    }
    return ind;
  }

  function isAutoScreenActive() {
    var s = app.autoState;
    if (!s.active) return false;
    var ids = [
      'auto-setup-screen',
      'auto-reveal-screen',
      'auto-night-intro-screen',
      'auto-night-pass-screen',
      'auto-night-action-screen',
      'auto-night-result-screen',
      'auto-day-screen',
      'auto-vote-screen',
      'auto-last-words-screen',
      'auto-end-screen',
    ];
    for (var i = 0; i < ids.length; i++) {
      var e = el(ids[i]);
      if (e && e.classList.contains('active')) return true;
    }
    return false;
  }

  function shouldBlockBackHold(target) {
    if (!target || !target.closest) return false;
    if (target.closest('#auto-reveal-hold-btn')) return true;
    if (target.closest('[data-action="auto-day-player-slot-open"]')) return true;
    if (target.closest('input,textarea,select,[contenteditable="true"]')) return true;
    if (target.closest('.modal-overlay[data-open]')) return true;
    return false;
  }

  function startBackHold(e) {
    if (!isAutoScreenActive()) return;
    if (shouldBlockBackHold(e.target)) return;
    if (app._autoEphemeral.backHold) cancelBackHold();
    var x =
      e.clientX !== undefined ? e.clientX : e.touches && e.touches[0] ? e.touches[0].clientX : 0;
    var y =
      e.clientY !== undefined ? e.clientY : e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    var pid = e.pointerId !== undefined ? e.pointerId : -1;
    var ind = ensureBackHoldIndicator();
    var startTs = Date.now();
    app._autoEphemeral.backHold = { pid: pid, x0: x, y0: y, startTs: startTs };
    var raf = function () {
      if (!app._autoEphemeral.backHold || app._autoEphemeral.backHold.startTs !== startTs) return;
      var elapsed = Date.now() - startTs;
      var ratio = Math.min(1, elapsed / A.BACK_HOLD_MS);
      if (elapsed >= 300) {
        ind.classList.add('is-active');
        ind.style.transform = 'scaleX(' + ratio + ')';
      }
      if (ratio >= 1) {
        finishBackHold();
        return;
      }
      app._autoEphemeral.backHold.raf = requestAnimationFrame(raf);
    };
    app._autoEphemeral.backHold.raf = requestAnimationFrame(raf);
  }

  function moveBackHold(e) {
    if (!app._autoEphemeral.backHold) return;
    var x =
      e.clientX !== undefined ? e.clientX : e.touches && e.touches[0] ? e.touches[0].clientX : 0;
    var y =
      e.clientY !== undefined ? e.clientY : e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    var dx = x - app._autoEphemeral.backHold.x0;
    var dy = y - app._autoEphemeral.backHold.y0;
    if (Math.abs(dx) > A.BACK_MOVE_THRESHOLD_PX || Math.abs(dy) > A.BACK_MOVE_THRESHOLD_PX)
      cancelBackHold();
  }

  function cancelBackHold() {
    if (!app._autoEphemeral.backHold) return;
    if (app._autoEphemeral.backHold.raf) cancelAnimationFrame(app._autoEphemeral.backHold.raf);
    app._autoEphemeral.backHold = null;
    var ind = el('auto-back-hold-indicator');
    if (ind) {
      ind.classList.remove('is-active');
      ind.style.transform = 'scaleX(0)';
    }
  }

  function finishBackHold() {
    cancelBackHold();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(80);
      } catch (_) {}
    }
    goBackOneStep();
  }

  A.bindBackGestures = function () {
    if (app._autoEphemeral._backBound) return;
    app._autoEphemeral._backBound = true;
    if (window.PointerEvent) {
      document.addEventListener('pointerdown', startBackHold);
      document.addEventListener('pointermove', moveBackHold);
      document.addEventListener('pointerup', cancelBackHold);
      document.addEventListener('pointercancel', cancelBackHold);
    } else {
      document.addEventListener('mousedown', startBackHold);
      document.addEventListener('mousemove', moveBackHold);
      document.addEventListener('mouseup', cancelBackHold);
      document.addEventListener('touchstart', startBackHold, { passive: true });
      document.addEventListener('touchmove', moveBackHold, { passive: true });
      document.addEventListener('touchend', cancelBackHold);
      document.addEventListener('touchcancel', cancelBackHold);
    }
    document.addEventListener('keydown', function (e) {
      if (!isAutoScreenActive()) return;
      if (e.key === 'Backspace') {
        var t = e.target;
        if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
        e.preventDefault();
        goBackOneStep();
      }
    });
  };

  // ============ Auto-day player slot gestures (long-press / swipe / tap) ============

  A.bindAutoPlayerGestures = function () {
    if (app._autoEphemeral._autoGesturesBound) return;
    app._autoEphemeral._autoGesturesBound = true;
    var LONG_PRESS_MS = 450;
    var SWIPE_Y_MIN = 30;
    var TAP_MOVE_MAX = 15;
    var g = { active: false, pid: null, touchId: -1, x0: 0, y0: 0, timer: null, fired: false };

    function pidFromEl(target) {
      var btn =
        target && target.closest
          ? target.closest('[data-action="auto-day-player-slot-open"]')
          : null;
      if (!btn) return null;
      var v = btn.getAttribute('data-player-id');
      return v ? parseInt(v, 10) : null;
    }

    function reset() {
      if (g.timer) {
        clearTimeout(g.timer);
        g.timer = null;
      }
      g.active = false;
      g.pid = null;
      g.touchId = -1;
      g.fired = false;
    }

    function findTouch(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }

    document.body.addEventListener(
      'touchstart',
      function (e) {
        if (g.active) return;
        var ds = el('auto-day-screen');
        if (!ds || !ds.classList.contains('active')) return;
        var pid = pidFromEl(e.target);
        if (pid === null) return;
        var t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        g.active = true;
        g.pid = pid;
        g.touchId = t.identifier;
        g.x0 = t.clientX;
        g.y0 = t.clientY;
        g.fired = false;
        var capturedPid = pid;
        g.timer = setTimeout(function () {
          g.timer = null;
          if (!g.active || g.fired) return;
          var changed = A.toggleAutoNominee(capturedPid, { skipRender: true });
          if (!changed) return;
          g.fired = true;
          A.patchAutoPlayerSlotStatus(capturedPid);
          if (navigator.vibrate) navigator.vibrate(40);
        }, LONG_PRESS_MS);
      },
      { passive: true }
    );

    document.body.addEventListener(
      'touchmove',
      function (e) {
        if (!g.active || g.fired) return;
        var t = findTouch(e.touches, g.touchId);
        if (!t) {
          reset();
          return;
        }
        var dy = t.clientY - g.y0;
        var dx = t.clientX - g.x0;
        if (Math.abs(dy) > TAP_MOVE_MAX || Math.abs(dx) > TAP_MOVE_MAX) {
          if (g.timer) {
            clearTimeout(g.timer);
            g.timer = null;
          }
        }
      },
      { passive: true }
    );

    document.body.addEventListener(
      'touchend',
      function (e) {
        if (!g.active) return;
        var t = findTouch(e.changedTouches, g.touchId);
        if (!t) {
          var wasFired = g.fired;
          reset();
          if (wasFired) A.renderAutoDayPlayers();
          return;
        }
        if (g.timer) {
          clearTimeout(g.timer);
          g.timer = null;
        }
        var pid = g.pid;
        var fired = g.fired;
        var dy = t.clientY - g.y0;
        var dx = t.clientX - g.x0;
        reset();
        if (fired) {
          app._autoLastGestureTs = Date.now();
          A.renderAutoDayPlayers();
          e.preventDefault();
          return;
        }
        if (Math.abs(dy) >= SWIPE_Y_MIN && Math.abs(dy) > Math.abs(dx)) {
          app._autoLastGestureTs = Date.now();
          e.preventDefault();
          if (dy < 0) A.addAutoFoul(pid);
          else A.removeAutoFoul(pid);
          if (navigator.vibrate) navigator.vibrate(25);
          return;
        }
      },
      { passive: false }
    );

    document.body.addEventListener(
      'touchcancel',
      function () {
        var wasFired = g.fired;
        reset();
        if (wasFired) A.renderAutoDayPlayers();
      },
      { passive: true }
    );
  };
})(window.MafiaApp);
