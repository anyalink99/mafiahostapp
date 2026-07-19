/** Обработчики локальной истории игр. */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  function idFrom(el) {
    return el && el.getAttribute ? el.getAttribute('data-history-id') || '' : '';
  }

  app.uiActionHandlers['history-save-current'] = function () {
    if (app.saveCurrentGameToHistory) app.saveCurrentGameToHistory();
  };
  app.uiActionHandlers['history-resume'] = function (el) {
    var id = idFrom(el);
    if (id && app.restoreGameFromHistory) app.restoreGameFromHistory(id, 'continue');
  };
  app.uiActionHandlers['history-open-summary'] = function (el) {
    var id = idFrom(el);
    if (id && app.restoreGameFromHistory) app.restoreGameFromHistory(id, 'summary');
  };
  app.uiActionHandlers['history-copy-text'] = function (el) {
    var id = idFrom(el);
    if (id && app.copyHistoryGameText) app.copyHistoryGameText(id);
  };
  app.uiActionHandlers['history-export-csv'] = function (el) {
    var id = idFrom(el);
    if (id && app.exportHistoryGameCsv) app.exportHistoryGameCsv(id);
  };
  app.uiActionHandlers['history-export-json'] = function (el) {
    var id = idFrom(el);
    if (id && app.exportHistoryGameJson) app.exportHistoryGameJson(id);
  };
  app.uiActionHandlers['history-delete-open'] = function (el) {
    var id = idFrom(el);
    if (id && app.showHistoryDeleteConfirm) app.showHistoryDeleteConfirm(id);
  };
  app.uiActionHandlers['history-delete-cancel'] = function () {
    if (app.hideHistoryDeleteConfirm) app.hideHistoryDeleteConfirm();
  };
  app.uiActionHandlers['history-delete-apply'] = function () {
    if (app.deletePendingHistoryGame) app.deletePendingHistoryGame();
  };
})((window.MafiaApp = window.MafiaApp || {}));
