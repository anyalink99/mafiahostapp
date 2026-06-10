/**
 * Обработчики вступительной фазы: рассадка, пробуждение Мерлина в первую ночь.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['auto-intro-finish'] = function () {
    app.handleIntroFinish();
  };
  app.uiActionHandlers['auto-freesit-finish'] = function () {
    app.handleFreesitFinish();
  };
  app.uiActionHandlers['auto-merlin-pass-start'] = function () {
    app.handleMerlinPassStart();
  };
  app.uiActionHandlers['auto-merlin-action-done'] = function () {
    app.handleMerlinActionDone();
  };
})(window.MafiaApp);
