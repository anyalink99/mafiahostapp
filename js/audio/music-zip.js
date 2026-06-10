/**
 * Музыка — импорт/экспорт плейлистов через ZIP (JSZip):
 *   • импорт: zip с manifest.json (наш формат) восстанавливает настройки
 *     треков и плейлиста; обычный zip с аудио — плейлист по умолчанию;
 *   • экспорт: аудио + manifest.json с именами, дропами, громкостями.
 */
(function (app) {
  'use strict';

  var M = (app._music = app._music || {});

  function isAudioFileName(name) {
    if (!name) return false;
    if (name.charAt(name.length - 1) === '/') return false;
    var bn = name.replace(/^.*\//, '');
    if (!bn || bn.charAt(0) === '.') return false;
    return /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(bn);
  }

  function audioMimeForName(name) {
    var ext = (name.match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
    if (ext === 'ogg' || ext === 'oga') return 'audio/ogg';
    if (ext === 'opus') return 'audio/ogg';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'flac') return 'audio/flac';
    if (ext === 'webm') return 'audio/webm';
    return 'audio/mpeg';
  }

  function decodeZipEntryName(rawBytes) {
    if (!rawBytes) return '';
    try {
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8', { fatal: false }).decode(rawBytes);
      }
    } catch (e) {}
    var s = '';
    for (var i = 0; i < rawBytes.length; i++) s += String.fromCharCode(rawBytes[i]);
    return s;
  }

  app.MUSIC_PLAYLIST_MANIFEST = 'manifest.json';
  app.MUSIC_PLAYLIST_MANIFEST_TYPE = 'mafia-host-playlist';

  // Импорт плейлиста по манифесту из zip: восстанавливаем имена, секунды дропа,
  // громкости и enabled треков + настройки самого плейлиста.
  function importPlaylistFromManifest(key, zip, manifest) {
    var pl = manifest.playlist || {};
    var manTracks = Array.isArray(manifest.tracks) ? manifest.tracks : [];
    if (!manTracks.length) {
      var err = new Error('empty manifest');
      err.code = 'no_audio';
      return Promise.reject(err);
    }
    var tracks = [];
    var chain = Promise.resolve();
    manTracks.forEach(function (mt) {
      if (!mt || !mt.file) return;
      chain = chain.then(function () {
        var entry = zip.file(mt.file);
        if (!entry) return;
        return entry.async('blob').then(function (blob) {
          var mime = audioMimeForName(mt.file);
          var typed = blob;
          if (blob && blob.type !== mime) {
            try {
              typed = blob.slice(0, blob.size, mime);
            } catch (e) {
              typed = blob;
            }
          }
          var blobId = M.newId();
          return app.musicPutBlob(blobId, typed, mime).then(function () {
            tracks.push({
              id: M.newId(),
              name: String(mt.name || 'Трек'),
              blobId: blobId,
              offsetSec: typeof mt.offsetSec === 'number' ? Math.max(0, mt.offsetSec) : 0,
              volumeMul: M.clampVol(mt.volumeMul),
              enabled: mt.enabled === false ? false : true,
            });
          });
        });
      });
    });
    return chain.then(function () {
      if (!tracks.length) {
        var e2 = new Error('no audio in zip');
        e2.code = 'no_audio';
        throw e2;
      }
      var meta = app.loadMusicMeta();
      var playlist = M.normalizePlaylist({
        name: String(pl.name || 'Плейлист'),
        tracks: tracks,
        enabled: pl.enabled === false ? false : true,
        volumeMul: M.clampVol(pl.volumeMul),
      });
      meta.slots[key].push(playlist);
      app.saveMusicMeta(meta);
      return playlist;
    });
  }

  app.musicAddZipToSlot = function (slot, zipFile) {
    if (!zipFile) return Promise.reject(new Error('no file'));
    if (typeof JSZip === 'undefined') {
      return Promise.reject(new Error('JSZip not loaded'));
    }
    var key = String(slot) === '2' ? '2' : '1';
    var playlistName =
      String(zipFile.name || 'Плейлист').replace(/\.(mhzip|zip)$/i, '') || 'Плейлист';

    return JSZip.loadAsync(zipFile, {
      decodeFileName: function (bytes) {
        return decodeZipEntryName(bytes);
      },
    }).then(function (zip) {
      // Если в zip есть валидный manifest.json — восстанавливаем настройки из него.
      var manifestEntry = zip.file(app.MUSIC_PLAYLIST_MANIFEST);
      if (manifestEntry) {
        return manifestEntry.async('string').then(function (txt) {
          var manifest;
          try {
            manifest = JSON.parse(txt);
          } catch (e) {
            manifest = null;
          }
          if (manifest && manifest.type === app.MUSIC_PLAYLIST_MANIFEST_TYPE) {
            return importPlaylistFromManifest(key, zip, manifest);
          }
          return addPlainZip(zip, key, playlistName);
        });
      }
      return addPlainZip(zip, key, playlistName);
    });
  };

  // Старое поведение: папка с аудио → плейлист с настройками по умолчанию.
  function addPlainZip(zip, key, playlistName) {
    return Promise.resolve().then(function () {
      var entries = [];
      zip.forEach(function (path, entry) {
        if (entry.dir) return;
        if (!isAudioFileName(path)) return;
        entries.push({ path: path, entry: entry });
      });
      if (!entries.length) {
        var err = new Error('no audio in zip');
        err.code = 'no_audio';
        throw err;
      }
      entries.sort(function (a, b) {
        return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
      });

      var tracks = [];
      var chain = Promise.resolve();
      entries.forEach(function (rec) {
        chain = chain.then(function () {
          return rec.entry.async('blob').then(function (blob) {
            var bn = rec.path.replace(/^.*\//, '') || rec.path;
            var displayName = bn.replace(/\.[a-z0-9]+$/i, '') || bn;
            var mime = audioMimeForName(bn);
            var typed = blob;
            if (blob && blob.type !== mime) {
              try {
                typed = blob.slice(0, blob.size, mime);
              } catch (e) {
                typed = blob;
              }
            }
            var blobId = M.newId();
            return app.musicPutBlob(blobId, typed, mime).then(function () {
              tracks.push({ id: M.newId(), name: displayName, blobId: blobId });
            });
          });
        });
      });

      return chain.then(function () {
        if (!tracks.length) {
          var e2 = new Error('no audio in zip');
          e2.code = 'no_audio';
          throw e2;
        }
        var meta = app.loadMusicMeta();
        var playlist = M.normalizePlaylist({
          name: playlistName,
          tracks: tracks,
          enabled: true,
        });
        meta.slots[key].push(playlist);
        app.saveMusicMeta(meta);
        return playlist;
      });
    });
  }

  function extForMime(mime) {
    if (!mime) return 'mp3';
    if (/mpeg/.test(mime)) return 'mp3';
    if (/mp4/.test(mime)) return 'm4a';
    if (/ogg/.test(mime)) return 'ogg';
    if (/wav/.test(mime)) return 'wav';
    if (/flac/.test(mime)) return 'flac';
    if (/webm/.test(mime)) return 'webm';
    return 'mp3';
  }

  // Выгрузка плейлиста в обычный .zip: аудио + manifest.json с настройками треков
  // и самого плейлиста (имя, enabled, громкости, секунды дропа). При импорте такого
  // zip настройки восстанавливаются из манифеста; zip без манифеста — как раньше.
  app.musicExportPlaylistZip = function (slot, itemId) {
    if (typeof JSZip === 'undefined') return Promise.reject(new Error('JSZip not loaded'));
    var key = String(slot) === '2' ? '2' : '1';
    var meta = app.loadMusicMeta();
    var list = meta.slots[key] || [];
    var it = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === itemId && list[i].type === 'playlist') {
        it = list[i];
        break;
      }
    }
    if (!it) return Promise.reject(new Error('not found'));
    var tracks = Array.isArray(it.tracks) ? it.tracks : [];
    var zip = new JSZip();
    var manifest = {
      type: app.MUSIC_PLAYLIST_MANIFEST_TYPE,
      version: 1,
      playlist: {
        name: it.name || 'Плейлист',
        enabled: it.enabled === false ? false : true,
        volumeMul: typeof it.volumeMul === 'number' ? it.volumeMul : 1,
      },
      tracks: [],
    };
    function pad(n) {
      return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n);
    }
    var chain = Promise.resolve();
    tracks.forEach(function (tr, idx) {
      if (!tr || !tr.blobId) return;
      chain = chain.then(function () {
        return app.musicGetBlob(tr.blobId).then(function (rec) {
          if (!rec || !rec.blob) return;
          var ext = extForMime(rec.mimeType || rec.blob.type);
          var fname = 'tracks/' + pad(idx + 1) + '.' + ext;
          zip.file(fname, rec.blob);
          manifest.tracks.push({
            file: fname,
            name: tr.name || 'Трек',
            offsetSec: typeof tr.offsetSec === 'number' ? tr.offsetSec : 0,
            volumeMul: typeof tr.volumeMul === 'number' ? tr.volumeMul : 1,
            enabled: tr.enabled === false ? false : true,
          });
        });
      });
    });
    return chain
      .then(function () {
        if (!manifest.tracks.length) throw new Error('empty playlist');
        zip.file(app.MUSIC_PLAYLIST_MANIFEST, JSON.stringify(manifest, null, 2));
        return zip.generateAsync({ type: 'blob' });
      })
      .then(function (blob) {
        var safe =
          String(it.name || 'playlist')
            .replace(/[\\/:*?"<>|]+/g, '_')
            .slice(0, 60) || 'playlist';
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = safe + '.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
          try {
            URL.revokeObjectURL(a.href);
          } catch (e) {}
        }, 1000);
        return true;
      });
  };
})(window.MafiaApp);
