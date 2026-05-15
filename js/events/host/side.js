/**
 * Обработчики правой панели game-screen в host-режиме (роли / заметки)
 * и открытия модалки игрока для редактирования итогов прямо во время игры.
 * Логика — modes/host/side.js.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['game-side-toggle-roles'] = function (_el, _event, ui) {
    if (!ui.isScreenActive('game-screen')) return;
    if (app.toggleGameSideRoles) app.toggleGameSideRoles();
  };
  app.uiActionHandlers['game-side-toggle-notes'] = function (_el, _event, ui) {
    if (!ui.isScreenActive('game-screen')) return;
    if (app.toggleGameSideNotes) app.toggleGameSideNotes();
  };

  app.uiActionHandlers['summary-player-open-from-game'] = function (el, _event, ui) {
    if (!ui.isScreenActive('game-screen')) return;
    var spid = ui.getIntAttr(el, 'data-player-id');
    if (spid !== null && app.showSummaryPlayerModal) app.showSummaryPlayerModal(spid);
  };
})(window.MafiaApp);
