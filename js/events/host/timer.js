/**
 * Обработчики таймера host-режима и тогглера фоновой музыки на game-screen.
 * Логика таймера — modes/host/timer.js.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['toggle-timer'] = function () { app.toggleTimer(); };
  app.uiActionHandlers['toggle-music'] = function () { app.toggleMusicPlayback(); };

  app.uiActionHandlers['reset-timer'] = function (el, _event, ui) {
    var sec = ui.getIntAttr(el, 'data-seconds');
    if (sec !== null) app.resetTimer(sec);
  };
})(window.MafiaApp);
