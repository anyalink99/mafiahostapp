(function (app) {
  'use strict';

  // Two-step confirmation modal for switching an in-progress autonomous game
  // to the regular host mode, then transferring the state.
  // Depends on app._autoInternals (set up by auto-mode.js).

  var switchHostStep = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function roleCodeToRussian(code) {
    if (code === 'don') return 'Дон';
    if (code === 'sheriff') return 'Шериф';
    if (code === 'mafia') return 'Мафия';
    return 'Мирный';
  }

  function renderSwitchHostModal() {
    var titleEl = el('modal-auto-switch-host-title');
    var bodyEl = el('modal-auto-switch-host-body');
    var primaryEl = el('modal-auto-switch-host-primary');
    if (switchHostStep === 1) {
      if (titleEl) titleEl.textContent = 'Передать обычному ведущему?';
      if (bodyEl)
        bodyEl.textContent =
          'Прогресс автономной партии перенесётся в обычный режим. Дальше игру будет вести живой ведущий.';
      if (primaryEl) primaryEl.textContent = 'Продолжить';
    } else if (switchHostStep === 2) {
      if (titleEl) titleEl.textContent = 'Точно передать?';
      if (bodyEl) bodyEl.textContent = 'Вернуться в автономный режим в этой партии нельзя.';
      if (primaryEl) primaryEl.textContent = 'Да, передать';
    }
  }

  app.showAutoSwitchHostModal = function () {
    var s = app.autoState;
    var anyOut =
      s.seats &&
      s.seats.some(function (x) {
        return !x.alive;
      });
    if (!anyOut) return;
    switchHostStep = 1;
    renderSwitchHostModal();
    var modal = el('modal-auto-switch-host');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  app.hideAutoSwitchHostModal = function () {
    var modal = el('modal-auto-switch-host');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, false);
    switchHostStep = 0;
  };

  app.handleAutoSwitchHostPrimary = function () {
    if (switchHostStep === 1) {
      switchHostStep = 2;
      renderSwitchHostModal();
      return;
    }
    if (switchHostStep === 2) {
      app.hideAutoSwitchHostModal();
      migrateAutoToHost();
    }
  };

  function migrateAutoToHost() {
    var s = app.autoState;
    if (!s.active || !Array.isArray(s.seats) || !s.seats.length) return;
    var I = app._autoInternals || {};
    if (I.clearAllAutoTimers) I.clearAllAutoTimers();

    var hostPlayers = [];
    var hostRoles = [];
    var n = s.seats.length;
    for (var i = 0; i < 10; i++) {
      if (i < n && s.seats[i]) {
        var seat = s.seats[i];
        hostPlayers.push({
          id: seat.id,
          fouls: seat.fouls || 0,
          eliminationReason: seat.eliminationReason || null,
          nick: seat.nick || '',
        });
        hostRoles.push(roleCodeToRussian(seat.role));
      } else {
        hostPlayers.push({ id: i + 1, fouls: 0, eliminationReason: 'shot', nick: '' });
        hostRoles.push('Мирный');
      }
    }

    app.players = hostPlayers;
    app.roles = hostRoles;
    app.revealedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    app.nomineeQueue = s.day && Array.isArray(s.day.nominees) ? s.day.nominees.slice() : [];
    app.activeVoteRound = null;
    app.timeLeft = s.day && typeof s.day.timeLeft === 'number' ? s.day.timeLeft : 60;
    app.playerRoleOverrides = {};
    app.winningTeam = null;
    app.bonusPointsByPlayerId = {};
    app.bonusNoteByPlayerId = {};
    app.bestMoveByPlayerId = {};
    app.summaryHostName = '';
    app.summarySyntheticFirstDayLine = null;
    app.summarySkipLineOverrides = {};

    if (app.rolesApi) {
      app.rolesApi.commitDeal({
        source: 'auto-migration',
        save: false,
        emit: false,
      });
    }

    var baseTs = Date.now() - 1000;
    app.gameLog = [];
    for (var m = 0; m < hostPlayers.length; m++) {
      var pp = hostPlayers[m];
      if (pp.eliminationReason) {
        app.gameLog.push({
          type: 'elimination',
          ts: baseTs + m,
          playerId: pp.id,
          reason: pp.eliminationReason,
        });
      }
    }

    if (app.saveState) app.saveState();

    app.autoState = I.makeFreshState ? I.makeFreshState() : { active: false };
    if (I.saveAuto) I.saveAuto();

    app.prepareConfig.mode = 'host';
    if (I.savePrepareConfig) I.savePrepareConfig();

    if (app.initGameFromMenu) app.initGameFromMenu();
    app.navigateToScreen('game-screen');
  }
})(window.MafiaApp);
