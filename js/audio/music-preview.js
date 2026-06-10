/**
 * Музыка — превью трека в настройках (кнопка ▶ у трека/плейлиста):
 * отдельный <audio id="music-preview">, играет с секунды дропа.
 */
(function (app) {
  'use strict';

  var M = (app._music = app._music || {});

  var previewPlayingKey = null;
  var previewRevokeUrl = null;

  function getPreviewAudio() {
    return document.getElementById('music-preview');
  }

  function syncMusicPreviewButtons() {
    var screen = document.getElementById('settings-screen');
    if (!screen) return;
    var btns = screen.querySelectorAll('.music-preview-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var sid = b.getAttribute('data-slot');
      var iid = b.getAttribute('data-item-id');
      var tid = b.getAttribute('data-track-id');
      var key = (sid === '2' ? '2' : '1') + ':' + iid + (tid ? ':' + tid : '');
      b.classList.toggle('is-playing', previewPlayingKey !== null && previewPlayingKey === key);
    }
  }

  app.stopMusicPreview = function () {
    var a = getPreviewAudio();
    if (previewRevokeUrl) {
      try {
        if (previewRevokeUrl.indexOf('blob:') === 0) URL.revokeObjectURL(previewRevokeUrl);
      } catch (e) {}
      previewRevokeUrl = null;
    }
    previewPlayingKey = null;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    syncMusicPreviewButtons();
  };

  app.musicPreviewToggle = function (slot, itemId, trackId) {
    app.primeMusicAudio();
    var k = String(slot) === '2' ? '2' : '1';
    var key = k + ':' + itemId + (trackId ? ':' + trackId : '');
    var items = app.getMusicSlotItems(slot);
    var item = null;
    for (var ii = 0; ii < items.length; ii++) {
      if (items[ii].id === itemId) {
        item = items[ii];
        break;
      }
    }
    if (!item) return;
    if (trackId) {
      if (item.type !== 'playlist' || !Array.isArray(item.tracks)) return;
      var tr = null;
      for (var ti = 0; ti < item.tracks.length; ti++) {
        if (item.tracks[ti] && item.tracks[ti].id === trackId) {
          tr = item.tracks[ti];
          break;
        }
      }
      if (!tr || !tr.blobId) return;
      var plVol = typeof item.volumeMul === 'number' ? item.volumeMul : 1;
      var trVol = typeof tr.volumeMul === 'number' ? tr.volumeMul : 1;
      var effVol = plVol * trVol;
      if (effVol > 4) effVol = 4;
      item = {
        id: itemId + ':' + trackId,
        name: tr.name || item.name,
        offsetSec: typeof tr.offsetSec === 'number' ? tr.offsetSec : 0,
        volumeMul: effVol,
        source: { type: 'idb', blobId: tr.blobId },
      };
    }
    var a = getPreviewAudio();
    if (!a) return;
    if (previewPlayingKey === key && !a.paused) {
      app.stopMusicPreview();
      return;
    }
    app.stopMusicPreview();
    previewPlayingKey = key;
    syncMusicPreviewButtons();
    app.musicResolvePlaySource(item).then(function (resolved) {
      if (!resolved || !resolved.url) {
        app.stopMusicPreview();
        return;
      }
      if (previewPlayingKey !== key) return;
      previewRevokeUrl = resolved.revoke ? resolved.url : null;
      a.playsInline = true;
      M.applyVolume(a, item);
      a.src = resolved.url;
      var settled = false;
      function onReady() {
        if (settled) return;
        if (previewPlayingKey !== key) return;
        settled = true;
        a.removeEventListener('loadedmetadata', onReady);
        a.removeEventListener('canplay', onReady);
        M.seekToItemOffset(a, item);
        var p = a.play();
        if (p && typeof p.then === 'function') {
          p.catch(function () {
            app.stopMusicPreview();
          });
        }
        syncMusicPreviewButtons();
      }
      a.addEventListener('loadedmetadata', onReady);
      a.addEventListener('canplay', onReady);
      a.addEventListener(
        'error',
        function () {
          app.stopMusicPreview();
        },
        { once: true }
      );
      a.load();
    });
  };

  // Вызывается из app.initMusic (music-player.js).
  M.initPreview = function () {
    var pa = getPreviewAudio();
    if (pa) {
      pa.addEventListener('ended', function () {
        if (app.stopMusicPreview) app.stopMusicPreview();
      });
    }
  };
})(window.MafiaApp);
