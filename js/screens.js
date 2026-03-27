(function (app) {
  var MODAL_MS = 118;

  function blurFocusInside(el) {
    var ae = document.activeElement;
    if (ae && el.contains(ae) && typeof ae.blur === 'function') ae.blur();
  }

  app.modalSetOpen = function (el, open) {
    if (!el) return;
    if (open) {
      el._modalGen = (el._modalGen || 0) + 1;
      if (el._modalTransEnd) {
        el.removeEventListener('transitionend', el._modalTransEnd);
        el._modalTransEnd = null;
      }
      if (el._modalCloseTimer) {
        clearTimeout(el._modalCloseTimer);
        el._modalCloseTimer = null;
      }
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
      void el.offsetWidth;
      el.setAttribute('data-open', '');
    } else {
      if (!el.hasAttribute('data-open') && el.classList.contains('hidden')) return;
      blurFocusInside(el);
      if (!el.hasAttribute('data-open')) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
        return;
      }
      el._modalGen = (el._modalGen || 0) + 1;
      var closeGen = el._modalGen;
      el.removeAttribute('data-open');
      var done = function (ev) {
        if (el._modalGen !== closeGen) return;
        if (ev.target !== el || ev.propertyName !== 'opacity') return;
        if (el.hasAttribute('data-open')) return;
        el.removeEventListener('transitionend', done);
        if (el._modalTransEnd === done) el._modalTransEnd = null;
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      };
      el._modalTransEnd = done;
      el.addEventListener('transitionend', done);
      if (el._modalCloseTimer) clearTimeout(el._modalCloseTimer);
      el._modalCloseTimer = setTimeout(function () {
        el._modalCloseTimer = null;
        if (el._modalGen !== closeGen) return;
        if (el.hasAttribute('data-open')) return;
        el.removeEventListener('transitionend', done);
        if (el._modalTransEnd === done) el._modalTransEnd = null;
        if (!el.classList.contains('hidden')) {
          el.classList.add('hidden');
          el.setAttribute('aria-hidden', 'true');
        }
      }, MODAL_MS + 40);
    }
  };

  app.hideAuthorLinksModal = function () {
    var m = document.getElementById('modal-author-links');
    if (m) app.modalSetOpen(m, false);
  };

  app.showAuthorLinksModal = function () {
    var m = document.getElementById('modal-author-links');
    if (m) app.modalSetOpen(m, true);
  };

  app.hideResetGameConfirmModal = function () {
    var m = document.getElementById('modal-reset-game-confirm');
    if (m) app.modalSetOpen(m, false);
  };

  app.showResetGameConfirmModal = function () {
    var m = document.getElementById('modal-reset-game-confirm');
    if (m) app.modalSetOpen(m, true);
  };


  app.navigateToScreen = function (screenId) {
    if (screenId !== 'settings-screen' && app.stopMusicPreview) app.stopMusicPreview();
    if (screenId !== 'vote-screen' && app.hideVoteCountModal) app.hideVoteCountModal();
    if (screenId !== 'game-screen' && screenId !== 'prepare-screen' && app.hidePlayerActionsModal) {
      app.hidePlayerActionsModal();
    }
    if (screenId !== 'summary-screen' && app.hideSummaryPlayerModal) app.hideSummaryPlayerModal();
    if (screenId !== 'summary-screen' && app.hideSummaryLogModal) app.hideSummaryLogModal();
    if (screenId !== 'menu-screen') {
      if (app.hideAuthorLinksModal) app.hideAuthorLinksModal();
      if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
    }
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById(screenId);
    if (el) el.classList.add('active');
    if (screenId === 'vote-screen') {
      var gs = document.getElementById('game-screen');
      var ae = document.activeElement;
      if (ae && gs && gs.contains(ae) && typeof ae.blur === 'function') ae.blur();
    }
    if (screenId === 'menu-screen' && app.updateResetButtonVisibility) app.updateResetButtonVisibility();
    if (screenId === 'setup-screen') app.initCards(app.revealedIndices.length > 0);
    if (screenId === 'game-screen') {
      app.renderPlayers();
      const timerEl = document.getElementById('timer');
      if (timerEl) timerEl.textContent = app.timeLeft;
      if (app.syncTimerAppearance) app.syncTimerAppearance();
      app.refreshNomineeQueueUi();
    }
    if (screenId === 'prepare-screen' && app.renderPreparePlayers) app.renderPreparePlayers();
    if (screenId === 'vote-screen' && app.prepareVoteRoundScreen) app.prepareVoteRoundScreen();
    if (screenId === 'vote-screen' && app.renderVoteScreen) app.renderVoteScreen();
    if (screenId === 'summary-screen' && app.renderSummary) app.renderSummary();
    if (screenId === 'settings-screen') {
      if (app.renderMusicSettings) app.renderMusicSettings();
      if (app.syncTimerVoiceCheckbox) app.syncTimerVoiceCheckbox();
      if (app.syncTimerVoiceExtraControls) app.syncTimerVoiceExtraControls();
    }
  };

  app.initGameFromMenu = function () {
    app.renderPlayers();
    app.resetTimer(app.timeLeft);
    app.refreshNomineeQueueUi();
  };

  app.getAvailableCount = function () {
    return app.roles.length;
  };

  app.showToast = function (message) {
    var el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className =
        'fixed bottom-6 left-1/2 z-[100] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-lg border border-mafia-gold/45 bg-mafia-coal/95 px-4 py-2.5 text-center text-sm text-mafia-cream/95 shadow-lg transition-opacity duration-200 ease-out pointer-events-none opacity-0';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    void el.offsetWidth;
    el.classList.remove('opacity-0');
    el.classList.add('opacity-100');
    clearTimeout(el._toastHide);
    el._toastHide = setTimeout(function () {
      el.classList.remove('opacity-100');
      el.classList.add('opacity-0');
    }, 2400);
  };
})(window.MafiaApp);
