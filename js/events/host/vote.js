(function (app) {
  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['go-voting'] = function () {
    if (app.goToVoting) app.goToVoting();
  };

  app.uiActionHandlers['vote-open-count'] = function (el, _event, ui) {
    var cix = ui.getIntAttr(el, 'data-candidate-index');
    if (cix !== null && app.showVoteCountModal) app.showVoteCountModal(cix);
  };

  app.uiActionHandlers['vote-count-pick'] = function (el, _event, ui) {
    var vv = ui.getIntAttr(el, 'data-value');
    if (vv !== null && app.applyVoteCountPick) app.applyVoteCountPick(vv);
  };

  app.uiActionHandlers['raise-all-pick'] = function (el, _event, ui) {
    var rv = ui.getIntAttr(el, 'data-value');
    if (rv !== null && app.applyRaiseAllPick) app.applyRaiseAllPick(rv);
  };

  app.uiActionHandlers['vote-count-cancel'] = function () {
    if (app.hideVoteCountModal) app.hideVoteCountModal();
  };
})(window.MafiaApp);
