(function (app) {
  app.uiActionHandlers = app.uiActionHandlers || {};

  function openModalAdapter() {
    var mode = app.getOpenPlayerTableMode ? app.getOpenPlayerTableMode() : 'host';
    return app.playerTable ? app.playerTable.getAdapter(mode) : null;
  }

  app.uiActionHandlers['player-table-open'] = function (el) {
    if (app.playerTable) app.playerTable.openFromElement(el);
  };

  // Подготовка пока использует отдельный renderer, но ту же модалку.
  app.uiActionHandlers['player-slot-open'] = function (el, _event, ui) {
    var sid = ui.getIntAttr(el, 'data-player-id');
    if (sid !== null && app.showPlayerActionsModal) app.showPlayerActionsModal(sid, 'host');
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
      var adapter = openModalAdapter();
      var player = adapter && adapter.getPlayer ? adapter.getPlayer(pid) : null;
      if (!player || player.eliminationReason) return;
      if (adapter.addFoul) adapter.addFoul(pid);
      if (player.eliminationReason) {
        if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      } else if (app.syncPlayerModalFoulControl) {
        app.syncPlayerModalFoulControl(pid);
      }
    });
  };

  app.uiActionHandlers['player-modal-foul-minus'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var adapter = openModalAdapter();
      var player = adapter && adapter.getPlayer ? adapter.getPlayer(pid) : null;
      if (!player || player.eliminationReason || player.fouls <= 0) return;
      if (adapter.removeFoul) adapter.removeFoul(pid);
      if (app.syncPlayerModalFoulControl) app.syncPlayerModalFoulControl(pid);
    });
  };

  app.uiActionHandlers['player-modal-vote'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var adapter = openModalAdapter();
      var player = adapter && adapter.getPlayer ? adapter.getPlayer(pid) : null;
      if (!player || player.eliminationReason) return;
      if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      if (adapter.toggleNominee) adapter.toggleNominee(pid);
    });
  };

  app.uiActionHandlers['player-modal-revive'] = function (_el, _event, ui) {
    ui.withModalPlayerId(function (pid) {
      var adapter = openModalAdapter();
      var player = adapter && adapter.getPlayer ? adapter.getPlayer(pid) : null;
      if (!player || !player.eliminationReason || !adapter.setElimination) return;
      var reason = player.eliminationReason;
      if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      adapter.setElimination(pid, reason);
    });
  };

  app.uiActionHandlers['player-modal-elim'] = function (el, _event, ui) {
    var reason = el.getAttribute('data-elim');
    ui.withModalPlayerId(function (pid) {
      var adapter = openModalAdapter();
      if (!reason || !adapter || !adapter.setElimination) return;
      if (adapter.canEliminate && !adapter.canEliminate(pid, reason)) return;
      if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
      adapter.setElimination(pid, reason);
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
