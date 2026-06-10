/**
 * Обработчики модалки действий над игроком в авто-режиме: открытие, фолы,
 * номинация, отметка элиминации, оживление.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['auto-day-player-slot-open'] = function (el) {
    if (app._autoLastGestureTs && Date.now() - app._autoLastGestureTs < 400) return;
    var pid = parseInt(el.getAttribute('data-player-id'), 10);
    if (!isNaN(pid)) app.showAutoPlayerActionsModal(pid);
  };

  app.uiActionHandlers['auto-player-modal-save'] = function () {
    app.hideAutoPlayerActionsModal();
  };

  app.uiActionHandlers['auto-player-modal-foul'] = function () {
    var I = app._autoInternals;
    I.withAutoModalSeatId(function (pid) {
      var seat = I.seatById(pid);
      if (!seat) return;
      app.hideAutoPlayerActionsModal();
      I.addAutoFoul(pid);
    });
  };

  app.uiActionHandlers['auto-player-modal-vote'] = function () {
    var I = app._autoInternals;
    I.withAutoModalSeatId(function (pid) {
      var seat = I.seatById(pid);
      if (!seat || seat.eliminationReason) return;
      app.hideAutoPlayerActionsModal();
      I.toggleAutoNominee(pid);
    });
  };

  app.uiActionHandlers['auto-player-modal-elim'] = function (el) {
    var reason = el.getAttribute('data-elim');
    app._autoInternals.withAutoModalSeatId(function (pid) {
      if (!reason) return;
      var s = app.autoState;
      if (reason === 'hang' && s.day && s.day.nominees.indexOf(pid) === -1) return;
      app.hideAutoPlayerActionsModal();
      app._autoInternals.setAutoElim(pid, reason);
    });
  };

  app.uiActionHandlers['auto-player-modal-revive'] = function () {
    var I = app._autoInternals;
    I.withAutoModalSeatId(function (pid) {
      var seat = I.seatById(pid);
      if (!seat || !seat.eliminationReason) return;
      var reason = seat.eliminationReason;
      app.hideAutoPlayerActionsModal();
      I.setAutoElim(pid, reason);
    });
  };
})(window.MafiaApp);
