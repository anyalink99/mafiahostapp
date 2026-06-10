/**
 * Обработчики правой панели game-screen в host-режиме (роли / заметки)
 * и открытия модалки игрока для редактирования итогов прямо во время игры.
 * Логика — modes/host/side.js.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  // Обработчики game-side-toggle-roles/notes живут в events/host/player.js
  // (раньше были продублированы здесь, но затирались поздней регистрацией).

  app.uiActionHandlers['summary-player-open-from-game'] = function (el, _event, ui) {
    if (!ui.isScreenActive('game-screen')) return;
    var spid = ui.getIntAttr(el, 'data-player-id');
    if (spid !== null && app.showSummaryPlayerModal) app.showSummaryPlayerModal(spid);
  };
})(window.MafiaApp);
