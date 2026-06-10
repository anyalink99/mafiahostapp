/**
 * Обработчики жизненного цикла авто-игры:
 * старт/возобновление/рестарт, навигация на экран показа карты, выход в меню,
 * переключение ведущего на середине партии.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['auto-begin'] = function () {
    app.startFreshAutoGame();
  };
  app.uiActionHandlers['auto-resume'] = function () {
    app.resumeAutoGame();
  };
  app.uiActionHandlers['auto-restart'] = function () {
    app.restartAutoGame();
  };
  app.uiActionHandlers['auto-reveal-confirm'] = function () {
    app.advanceReveal();
  };

  app.uiActionHandlers['auto-back-to-menu'] = function () {
    app._autoInternals.clearAllAutoTimers();
    app._autoInternals.hideRevealOverlay();
    app.navigateToScreen('menu-screen');
  };

  app.uiActionHandlers['auto-switch-host-open'] = function () {
    app.showAutoSwitchHostModal();
  };
  app.uiActionHandlers['auto-switch-host-cancel'] = function () {
    app.hideAutoSwitchHostModal();
  };
  app.uiActionHandlers['auto-switch-host-primary'] = function () {
    app.handleAutoSwitchHostPrimary();
  };
})(window.MafiaApp);
