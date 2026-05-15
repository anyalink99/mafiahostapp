/**
 * Обработчики модалки озвучки таймера и кнопки запуска ночных действий.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['timer-voice-modal-open'] = function () {
    if (app.showTimerVoiceModal) app.showTimerVoiceModal();
  };
  app.uiActionHandlers['timer-voice-modal-close'] = function () {
    if (app.hideTimerVoiceModal) app.hideTimerVoiceModal();
  };
  app.uiActionHandlers['night-actions-run'] = function () {
    if (app.runNightActions) app.runNightActions();
  };
})(window.MafiaApp);
