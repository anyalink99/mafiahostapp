(function (app) {
  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['vote-open-count'] = function (el, _event, ui) {
    if (window.PointerEvent) return;
    var cix = ui.getIntAttr(el, 'data-candidate-index');
    if (cix !== null && app.showVoteCountModal) app.showVoteCountModal(cix);
  };

  app.uiActionHandlers['vote-count-pick'] = function (el, _event, ui) {
    if (app._voteModalOpenedAt && Date.now() - app._voteModalOpenedAt < 550) return;
    var vv = ui.getIntAttr(el, 'data-value');
    if (vv !== null && app.applyVoteCountPick) app.applyVoteCountPick(vv);
  };

  app.uiActionHandlers['raise-all-pick'] = function (el, _event, ui) {
    var rv = ui.getIntAttr(el, 'data-value');
    if (rv !== null && app.applyRaiseAllPick) app.applyRaiseAllPick(rv);
  };

  app.uiActionHandlers['vote-count-cancel'] = function () {
    if (app._voteModalOpenedAt && Date.now() - app._voteModalOpenedAt < 550) return;
    if (app.hideVoteCountModal) app.hideVoteCountModal();
  };
})(window.MafiaApp);
