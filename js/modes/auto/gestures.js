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
    var pmodal = el('modal-player-actions');
    if (
      pmodal &&
      pmodal.dataset.tableMode === 'auto' &&
      pmodal.hasAttribute('data-open') &&
      app.hidePlayerActionsModal
    ) {
      app.hidePlayerActionsModal();
    }
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
    if (target.closest('[data-player-table-mode="auto"][data-player-id]')) return true;
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

  // Жесты игрового стола общие для host/auto и работают через Pointer Events.
  // Этот совместимый хук оставлен для старых init-путей auto-режима.
  A.bindAutoPlayerGestures = function () {
    if (app.playerTable) app.playerTable.bindGestures();
  };
})(window.MafiaApp);
