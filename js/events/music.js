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

  app.uiActionHandlers['music-add-zip-slot'] = function (el) {
    var slot = el.getAttribute('data-slot');
    var inputId = slot === '2' ? 'music-zip-slot-2' : 'music-zip-slot-1';
    var inp = document.getElementById(inputId);
    if (inp) inp.click();
  };

  app.uiActionHandlers['music-control-close'] = function () {
    if (app.hideMusicControlModal) app.hideMusicControlModal();
  };

  app.uiActionHandlers['music-control-stop'] = function () {
    if (app.stopMusic) app.stopMusic();
    if (app.hideMusicControlModal) app.hideMusicControlModal();
  };

  app.uiActionHandlers['music-control-pause'] = function () {
    if (app.toggleMusicPause) app.toggleMusicPause();
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

  /* ── Spotify action handlers ── */

  app.uiActionHandlers['spotify-connect'] = function () {
    if (app.spotifyStartAuth) app.spotifyStartAuth();
  };

  app.uiActionHandlers['spotify-disconnect'] = function () {
    if (app.spotifyLogout) app.spotifyLogout();
    if (app.renderSpotifyGlobalSettings) app.renderSpotifyGlobalSettings();
    if (app.renderMusicSettings) app.renderMusicSettings();
  };

  app.uiActionHandlers['spotify-paste-playlist'] = function (el) {
    var slot = el.getAttribute('data-slot') || '1';
    var k = slot === '2' ? '2' : '1';
    var input = document.querySelector('[data-spotify-playlist-input][data-slot="' + k + '"]');
    if (!input) return;
    var url = input.value.trim();
    if (!url) return;

    var playlistId = app.spotifyParsePlaylistUrl ? app.spotifyParsePlaylistUrl(url) : null;
    if (!playlistId) {
      var errEl = document.getElementById('spotify-slot-' + k + '-error');
      if (errEl) {
        errEl.textContent = 'Неверная ссылка на плейлист Spotify';
        errEl.classList.remove('hidden');
      }
      return;
    }

    el.disabled = true;
    el.textContent = '...';

    app.spotifyFetchPlaylistInfo(playlistId).then(function (info) {
      app.spotifySetSlotPlaylist(slot, {
        playlistId: playlistId,
        playlistName: info.playlistName,
        playlistImageUrl: info.playlistImageUrl,
        trackCount: info.trackCount,
      });
      if (app.renderSpotifySlotSettings) app.renderSpotifySlotSettings(slot);
    }).catch(function (err) {
      var msg = 'Не удалось загрузить плейлист';
      if (err && err.message === 'playlist not found') msg = 'Плейлист не найден';
      if (err && err.message === 'not authenticated') msg = 'Сначала подключите Spotify';
      var errEl = document.getElementById('spotify-slot-' + k + '-error');
      if (errEl) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
      }
      el.disabled = false;
      el.textContent = 'Добавить';
    });
  };

  app.uiActionHandlers['spotify-clear-playlist'] = function (el) {
    var slot = el.getAttribute('data-slot') || '1';
    if (app.spotifyClearSlotPlaylist) app.spotifyClearSlotPlaylist(slot);
    if (app.renderSpotifySlotSettings) app.renderSpotifySlotSettings(slot);
  };
})(window.MafiaApp);
