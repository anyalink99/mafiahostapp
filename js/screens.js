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

  app.showScreen = function (screenId) {
    if (screenId !== 'vote-screen' && app.hideVoteCountModal) app.hideVoteCountModal();
    if (screenId !== 'game-screen' && app.hidePlayerActionsModal) app.hidePlayerActionsModal();
    if (screenId !== 'summary-screen' && app.hideSummaryPlayerModal) app.hideSummaryPlayerModal();
    if (screenId !== 'summary-screen' && app.hideSummaryLogModal) app.hideSummaryLogModal();
    if (screenId !== 'menu-screen' && app.hideAuthorLinksModal) app.hideAuthorLinksModal();
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
      app.updateVotingUI();
    }
    if (screenId === 'vote-screen' && app.prepareVoteScreen) app.prepareVoteScreen();
    if (screenId === 'vote-screen' && app.renderVoteScreen) app.renderVoteScreen();
    if (screenId === 'summary-screen' && app.renderSummary) app.renderSummary();
    if (screenId === 'settings-screen' && app.renderMusicSettings) app.renderMusicSettings();
    if (screenId === 'summary-screen' && app.renderSummary) app.renderSummary();
  };

  app.initGameFromMenu = function () {
    app.renderPlayers();
    app.resetTimer(app.timeLeft);
    app.updateVotingUI();
  };

  app.getAvailableCount = function () {
    return app.roles.length;
  };
})(window.MafiaApp);
