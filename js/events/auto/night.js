/**
 * Обработчики ночной фазы: переход хода, выбор цели мафией, проверки дона/шерифа,
 * итоги ночи.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['auto-night-turn-start'] = function () { app.startNightTurn(); };
  app.uiActionHandlers['auto-night-turn-done'] = function () { app.handleNightTurnDone(); };
  app.uiActionHandlers['auto-night-result-continue'] = function () { app.continueAfterNightResult(); };

  app.uiActionHandlers['auto-mafia-pick'] = function (el) {
    var s = app.autoState;
    if (!s.night) return;
    var seatId = s.night.turnOrder[s.night.cursor];
    var targetId = parseInt(el.getAttribute('data-target-id'), 10);
    if (!isNaN(targetId)) app.handleMafiaPick(seatId, targetId);
  };

  app.uiActionHandlers['auto-don-check'] = function (el) {
    var s = app.autoState;
    if (!s.night) return;
    var seatId = s.night.turnOrder[s.night.cursor];
    var targetId = parseInt(el.getAttribute('data-target-id'), 10);
    if (!isNaN(targetId)) app.handleDonCheck(seatId, targetId);
  };

  app.uiActionHandlers['auto-sheriff-check'] = function (el) {
    var s = app.autoState;
    if (!s.night) return;
    var seatId = s.night.turnOrder[s.night.cursor];
    var targetId = parseInt(el.getAttribute('data-target-id'), 10);
    if (!isNaN(targetId)) app.handleSheriffCheck(seatId, targetId);
  };
})(window.MafiaApp);
