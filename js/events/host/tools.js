/**
 * Обработчики модалки «Инструменты ведущего» (гаечный ключ на game-screen).
 * Содержимое модалки (рендер, секции под Каспера) — modes/host/tools.js.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['host-tools-open'] = function () { app.showHostToolsModal(); };
  app.uiActionHandlers['host-tools-close'] = function () { app.hideHostToolsModal(); };
  app.uiActionHandlers['host-tools-roles'] = function () { app.toolsRevealRoles(); };
  app.uiActionHandlers['host-tools-sheriff-random'] = function () { app.toolsKasperSheriffRandom(); };
})(window.MafiaApp);
