(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['urban-night-close'] = function () {
    if (app.closeUrbanNightActions) app.closeUrbanNightActions();
  };
  app.uiActionHandlers['urban-night-open-target'] = function (el) {
    if (app.showUrbanNightTargetModal)
      app.showUrbanNightTargetModal(el.getAttribute('data-night-action'));
  };
  app.uiActionHandlers['urban-night-target-pick'] = function (el, _event, ui) {
    var id = ui.getIntAttr(el, 'data-player-id');
    if (id !== null && app.pickUrbanNightTarget) app.pickUrbanNightTarget(id);
  };
  app.uiActionHandlers['urban-night-skip'] = function () {
    if (app.skipUrbanNightAction) app.skipUrbanNightAction();
  };
  app.uiActionHandlers['urban-night-target-cancel'] = function () {
    if (app.hideUrbanNightTargetModal) app.hideUrbanNightTargetModal();
  };
  app.uiActionHandlers['urban-night-finish'] = function () {
    if (app.finishUrbanNight) app.finishUrbanNight();
  };
})(window.MafiaApp);
