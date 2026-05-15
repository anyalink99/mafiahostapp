/**
 * Обработчики голосования и фазы последнего слова в авто-режиме.
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['auto-vote-back-to-day'] = function () {
    var I = app._autoInternals;
    var s = app.autoState;
    I.pushHistory();
    if (s.day && s.vote && s.vote.candidateIds) s.day.nominees = s.vote.candidateIds.slice();
    s.phase = 'day';
    s.vote = null;
    I.saveAuto();
    app.navigateToScreen('auto-day-screen');
  };

  app.uiActionHandlers['auto-vote-open-count'] = function (el) {
    var idx = parseInt(el.getAttribute('data-candidate-index'), 10);
    if (!isNaN(idx)) app.showAutoVoteCountModal(idx);
  };

  app.uiActionHandlers['auto-vote-count-cancel'] = function () { app.hideAutoVoteCountModal(); };

  app.uiActionHandlers['auto-vote-pick-count'] = function (el) {
    var c = parseInt(el.getAttribute('data-vote-count'), 10);
    if (!isNaN(c)) app.applyAutoVoteCount(c);
  };

  app.uiActionHandlers['auto-vote-raise-pick'] = function (el) {
    var v = parseInt(el.getAttribute('data-value'), 10);
    if (!isNaN(v)) app.applyAutoRaisePick(v);
  };

  app.uiActionHandlers['auto-last-words-finish'] = function () { app.handleLastWordsFinish(); };
  app.uiActionHandlers['auto-last-words-toggle-timer'] = function () { app.toggleAutoLastWordsTimer(); };

  app.uiActionHandlers['auto-last-words-reset-timer'] = function (el) {
    var sec = parseInt(el.getAttribute('data-seconds'), 10);
    if (!isNaN(sec)) app.resetAutoLastWordsTimer(sec);
  };
})(window.MafiaApp);
