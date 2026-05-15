/**
 * Обработчики экрана подведения итогов: модалка игрока, экспорт CSV/JSON,
 * редактирование лога. Содержимое логики — summary/summary.js и summary/export.js.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['export-copy-text'] = function (_el, _event, ui) {
    if (!ui.isScreenActive('summary-screen')) return;
    if (app.copyGameExportToClipboard) app.copyGameExportToClipboard();
  };
  app.uiActionHandlers['export-download-csv'] = function (_el, _event, ui) {
    if (!ui.isScreenActive('summary-screen')) return;
    if (app.downloadGameExportCsv) app.downloadGameExportCsv();
  };
  app.uiActionHandlers['export-copy-mu-json'] = function (_el, _event, ui) {
    if (!ui.isScreenActive('summary-screen')) return;
    if (app.copyMUJsonToClipboard) app.copyMUJsonToClipboard();
  };

  app.uiActionHandlers['summary-player-open'] = function (el, _event, ui) {
    if (!ui.isScreenActive('summary-screen')) return;
    var spid = ui.getIntAttr(el, 'data-player-id');
    if (spid !== null && app.showSummaryPlayerModal) app.showSummaryPlayerModal(spid);
  };
  app.uiActionHandlers['summary-modal-save'] = function () {
    if (app.applySummaryPlayerModal) app.applySummaryPlayerModal();
  };
  app.uiActionHandlers['summary-bonus-delta'] = function (el, _event, ui) {
    if (!ui.isScreenActive('summary-screen')) return;
    var dAttr = el.getAttribute('data-delta');
    var d = dAttr !== null ? parseFloat(dAttr) : NaN;
    if (!isNaN(d) && app.applySummaryBonusDelta) app.applySummaryBonusDelta(d);
  };

  app.uiActionHandlers['summary-log-open'] = function (el, _event, ui) {
    if (!ui.isScreenActive('summary-screen')) return;
    var lidx = el.getAttribute('data-summary-log-index');
    var skipK = el.getAttribute('data-summary-skip-key');
    var lidxNum = lidx !== null ? parseInt(lidx, 10) : NaN;
    if ((skipK === null || skipK === '') && lidxNum === -1) skipK = 'lead';
    if (skipK !== null && skipK !== '' && app.showSummaryLogModal) {
      app.showSummaryLogModal(lidxNum, skipK);
    } else if (lidx !== null && app.showSummaryLogModal) {
      app.showSummaryLogModal(lidxNum, null);
    }
  };
  app.uiActionHandlers['summary-modal-log-cancel'] = function () {
    if (app.hideSummaryLogModal) app.hideSummaryLogModal();
  };
  app.uiActionHandlers['summary-modal-log-save'] = function () {
    if (app.applySummaryLogModal) app.applySummaryLogModal();
  };
})(window.MafiaApp);
