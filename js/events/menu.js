/**
 * Обработчики меню и общих модалок: «об авторе», сброс игры.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['author-links-open'] = function () {
    if (app.showAuthorLinksModal) app.showAuthorLinksModal();
  };
  app.uiActionHandlers['author-links-close'] = function () {
    if (app.hideAuthorLinksModal) app.hideAuthorLinksModal();
  };

  app.uiActionHandlers['reset-game-confirm-open'] = function () {
    if (app.showResetGameConfirmModal) app.showResetGameConfirmModal();
  };
  app.uiActionHandlers['reset-game-confirm-cancel'] = function () {
    if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
  };
  app.uiActionHandlers['reset-game-confirm-apply'] = function () {
    if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
    if (app.resetGameState) app.resetGameState();
  };
  app.uiActionHandlers['reset-game-confirm-apply-with-nicks'] = function () {
    if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
    if (app.resetGameState) app.resetGameState({ resetNicknames: true });
  };
})(window.MafiaApp);
