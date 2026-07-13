(function (app) {
  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['player-slot-open'] = function (el, _event, ui) {
    if (app._lastGestureTs && Date.now() - app._lastGestureTs < 400) return;
    var sid = ui.getIntAttr(el, 'data-player-id');
    if (sid !== null && app.showPlayerActionsModal) app.showPlayerActionsModal(sid);
  };

  app.uiActionHandlers['player-modal-save'] = function () {
    if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
  };

  app.uiActionHandlers['player-prepare-role-pick'] = function (el) {
    if (!app.pickPrepareModalRole) return;
    var roleCode = el.getAttribute('data-role-code');
    if (!roleCode) return;
    app.pickPrepareModalRole(roleCode);
    // Десктоп-панель игрока автосейвит роль и пересинхронизирует radio-группы.
    app.emit('player-role-picked', 'modal-player-prepare-role-icons');
  };

  app.uiActionHandlers['player-modal-foul-plus'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var player = app.players.find(function (x) {
        return x.id === pid;
      });
      if (!player || player.eliminationReason) return;
      app.addFoul(pid);
      if (player.eliminationReason) {
        if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      } else if (app.syncPlayerModalFoulControl) {
        app.syncPlayerModalFoulControl(pid);
      }
    });
  };

  app.uiActionHandlers['player-modal-foul-minus'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var player = app.players.find(function (x) {
        return x.id === pid;
      });
      if (!player || player.eliminationReason || player.fouls <= 0) return;
      app.removeFoul(pid);
      if (app.syncPlayerModalFoulControl) app.syncPlayerModalFoulControl(pid);
    });
  };

  app.uiActionHandlers['player-modal-vote'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var player = app.players.find(function (x) {
        return x.id === pid;
      });
      if (!player || player.eliminationReason) return;
      var inQueue = app.nomineeQueue.indexOf(pid) !== -1;
      if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      if (inQueue) {
        if (app.removePlayerFromNomineeQueue) app.removePlayerFromNomineeQueue(pid);
      } else {
        app.addPlayerToNomineeQueue(pid);
      }
    });
  };

  app.uiActionHandlers['player-modal-revive'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var player = app.players.find(function (x) {
        return x.id === pid;
      });
      if (!player || !player.eliminationReason || !app.setPlayerEliminationState) return;
      var reason = player.eliminationReason;
      if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      app.setPlayerEliminationState(pid, reason);
    });
  };

  app.uiActionHandlers['player-modal-elim'] = function (el, _event, ui) {
    var reason = el.getAttribute('data-elim');
    ui.withModalPlayerId(function (pid) {
      if (!reason || !app.setPlayerEliminationState) return;
      if (reason === 'hang' && app.nomineeQueue && app.nomineeQueue.indexOf(pid) === -1) return;
      if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      app.setPlayerEliminationState(pid, reason);
    });
  };

  app.uiActionHandlers['game-side-toggle-roles'] = function () {
    if (app.toggleGameSideRoles) app.toggleGameSideRoles();
    // Десктоп-панель игрока гейтит секции по видимости ролей.
    app.emit('roles-visibility-changed');
  };

  app.uiActionHandlers['game-side-toggle-notes'] = function () {
    if (app.toggleGameSideNotes) app.toggleGameSideNotes();
  };

  app.uiActionHandlers['summary-player-open-from-game'] = function (el, _event, ui) {
    var spid = ui.getIntAttr(el, 'data-player-id');
    if (spid !== null && app.showSummaryPlayerModal) app.showSummaryPlayerModal(spid);
  };
})(window.MafiaApp);
