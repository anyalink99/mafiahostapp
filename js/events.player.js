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
    if (roleCode) app.pickPrepareModalRole(roleCode);
  };

  app.uiActionHandlers['player-modal-foul'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var player = app.players.find(function (x) {
        return x.id === pid;
      });
      if (!player || player.eliminationReason) return;
      if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      app.addFoul(pid);
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
})(window.MafiaApp);
