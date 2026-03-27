(function (app) {
  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['music-pick-cancel'] = function () {
    app.hideMusicSlotModal();
  };

  app.uiActionHandlers['music-pick-slot'] = function (el) {
    var slot = el.getAttribute('data-slot');
    if (slot) app.musicStartSlot(slot);
  };

  app.uiActionHandlers['music-empty-cancel'] = function () {
    app.hideMusicEmptyModal();
  };

  app.uiActionHandlers['music-add-slot'] = function (el) {
    var slot = el.getAttribute('data-slot');
    var inputId = slot === '2' ? 'music-files-slot-2' : 'music-files-slot-1';
    var inp = document.getElementById(inputId);
    if (inp) inp.click();
  };

  app.uiActionHandlers['music-toggle-item-panel'] = function (el) {
    var sid = el.getAttribute('data-slot');
    var iid = el.getAttribute('data-item-id');
    if (sid && iid && app.toggleMusicItemExpanded) app.toggleMusicItemExpanded(sid, iid);
  };

  app.uiActionHandlers['music-preview'] = function (el) {
    var sid = el.getAttribute('data-slot');
    var iid = el.getAttribute('data-item-id');
    if (sid && iid && app.musicPreviewToggle) app.musicPreviewToggle(sid, iid);
  };

  app.uiActionHandlers['music-remove-item'] = function (el) {
    var sid = el.getAttribute('data-slot');
    var iid = el.getAttribute('data-item-id');
    if (!sid || !iid) return;

    if (app.expandedMusicItemIdBySlot) {
      if (app.expandedMusicItemIdBySlot['1'] === iid || app.expandedMusicItemIdBySlot['2'] === iid) {
        app.expandedMusicItemIdBySlot['1'] = '';
        app.expandedMusicItemIdBySlot['2'] = '';
      }
    }

    app.musicRemoveItem(sid, iid).then(function () {
      if (app.renderMusicSettings) app.renderMusicSettings();
    });
  };
})(window.MafiaApp);
