window.MafiaApp = window.MafiaApp || {};

(function (app) {
  app.MUSIC_META_KEY = 'mafia_host_music';
  var DB_NAME = 'mafia_host_music_db';
  var DB_VERSION = 1;
  var STORE = 'blobs';

  function newId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function defaultMeta() {
    return { version: 1, slots: { '1': [], '2': [] }, spotify: { '1': null, '2': null } };
  }

  app.loadMusicMeta = function () {
    try {
      var raw = localStorage.getItem(app.MUSIC_META_KEY);
      if (!raw) return defaultMeta();
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return defaultMeta();
      if (!data.slots || typeof data.slots !== 'object') data.slots = defaultMeta().slots;
      if (!Array.isArray(data.slots['1'])) data.slots['1'] = [];
      if (!Array.isArray(data.slots['2'])) data.slots['2'] = [];
      if (!data.spotify || typeof data.spotify !== 'object') data.spotify = { '1': null, '2': null };
      return data;
    } catch (e) {
      return defaultMeta();
    }
  };

  app.saveMusicMeta = function (meta) {
    try {
      localStorage.setItem(app.MUSIC_META_KEY, JSON.stringify(meta));
    } catch (e) {}
  };

  app.getMusicSlotItems = function (slot) {
    var key = String(slot) === '2' ? '2' : '1';
    var meta = app.loadMusicMeta();
    return meta.slots[key].slice();
  };

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () {
        reject(req.error);
      };
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
  }

  app.musicPutBlob = function (blobId, blob, mimeType) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
        tx.objectStore(STORE).put({ blob: blob, mimeType: mimeType || blob.type || 'audio/mpeg' }, blobId);
      });
    });
  };

  app.musicGetBlob = function (blobId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(blobId);
        req.onsuccess = function () {
          db.close();
          resolve(req.result || null);
        };
        req.onerror = function () {
          db.close();
          reject(req.error);
        };
      });
    });
  };

  app.musicDeleteBlob = function (blobId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = function () {
          db.close();
          reject(tx.error);
        };
        tx.objectStore(STORE).delete(blobId);
      });
    });
  };

  function normalizeItem(row) {
    if (row && row.type === 'playlist') return normalizePlaylist(row);
    var offset = typeof row.offsetSec === 'number' && !isNaN(row.offsetSec) ? row.offsetSec : 0;
    var vol = typeof row.volumeMul === 'number' && !isNaN(row.volumeMul) ? row.volumeMul : 1;
    if (vol < 0.25) vol = 0.25;
    if (vol > 2) vol = 2;
    return {
      id: row.id || newId(),
      name: String(row.name || 'Трек'),
      offsetSec: Math.max(0, offset),
      volumeMul: vol,
      enabled: row.enabled === false ? false : true,
      source: row.source && row.source.type ? row.source : { type: 'idb', blobId: row.blobId },
    };
  }

  function normalizePlaylist(row) {
    var rawTracks = Array.isArray(row.tracks) ? row.tracks : [];
    var tracks = [];
    for (var i = 0; i < rawTracks.length; i++) {
      var t = rawTracks[i];
      if (!t || !t.blobId) continue;
      tracks.push({
        id: t.id || newId(),
        name: String(t.name || 'Трек ' + (i + 1)),
        blobId: t.blobId,
      });
    }
    return {
      id: row.id || newId(),
      type: 'playlist',
      name: String(row.name || 'Плейлист'),
      enabled: row.enabled === false ? false : true,
      tracks: tracks,
    };
  }

  app.musicIsPlaylistItem = function (item) {
    return !!(item && item.type === 'playlist');
  };

  app.musicAddFilesToSlot = function (slot, fileList) {
    if (!fileList || !fileList.length) return Promise.resolve([]);
    var key = String(slot) === '2' ? '2' : '1';
    var meta = app.loadMusicMeta();
    var added = [];
    var chain = Promise.resolve();

    for (var i = 0; i < fileList.length; i++) {
      (function (file) {
        chain = chain.then(function () {
          var blobId = newId();
          return app.musicPutBlob(blobId, file, file.type).then(function () {
            var item = normalizeItem({
              name: file.name,
              offsetSec: 0,
              volumeMul: 1,
              source: { type: 'idb', blobId: blobId },
            });
            meta.slots[key].push(item);
            added.push(item);
          });
        });
      })(fileList[i]);
    }

    return chain.then(function () {
      app.saveMusicMeta(meta);
      return added;
    });
  };

  app.musicRemoveItem = function (slot, itemId) {
    var key = String(slot) === '2' ? '2' : '1';
    var meta = app.loadMusicMeta();
    var list = meta.slots[key];
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === itemId) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return Promise.resolve(false);
    var item = list[idx];
    list.splice(idx, 1);
    app.saveMusicMeta(meta);
    var blobIds = [];
    if (item.type === 'playlist' && Array.isArray(item.tracks)) {
      for (var t = 0; t < item.tracks.length; t++) {
        if (item.tracks[t] && item.tracks[t].blobId) blobIds.push(item.tracks[t].blobId);
      }
    } else if (item.source && item.source.type === 'idb' && item.source.blobId) {
      blobIds.push(item.source.blobId);
    }
    if (!blobIds.length) return Promise.resolve(true);
    var chain = Promise.resolve();
    blobIds.forEach(function (bid) {
      chain = chain.then(function () {
        return app.musicDeleteBlob(bid).catch(function () {});
      });
    });
    return chain.then(function () {
      return true;
    });
  };

  function isAudioFileName(name) {
    if (!name) return false;
    if (name.charAt(name.length - 1) === '/') return false;
    var bn = name.replace(/^.*\//, '');
    if (!bn || bn.charAt(0) === '.') return false;
    return /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(bn);
  }

  function audioMimeForName(name) {
    var ext = (name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
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

  app.musicAddZipToSlot = function (slot, zipFile) {
    if (!zipFile) return Promise.reject(new Error('no file'));
    if (typeof JSZip === 'undefined') {
      return Promise.reject(new Error('JSZip not loaded'));
    }
    var key = String(slot) === '2' ? '2' : '1';
    var playlistName = String(zipFile.name || 'Плейлист').replace(/\.zip$/i, '') || 'Плейлист';

    return JSZip.loadAsync(zipFile, {
      decodeFileName: function (bytes) {
        return decodeZipEntryName(bytes);
      },
    }).then(function (zip) {
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
            var blobId = newId();
            return app.musicPutBlob(blobId, typed, mime).then(function () {
              tracks.push({ id: newId(), name: displayName, blobId: blobId });
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
        var playlist = normalizePlaylist({
          name: playlistName,
          tracks: tracks,
          enabled: true,
        });
        meta.slots[key].push(playlist);
        app.saveMusicMeta(meta);
        return playlist;
      });
    });
  };

  app.musicGetSlotPlayablePool = function (slot) {
    var key = String(slot) === '2' ? '2' : '1';
    var meta = app.loadMusicMeta();
    var list = meta.slots[key] || [];
    var pool = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it) continue;
      if (it.type === 'playlist') {
        if (it.enabled === false) continue;
        var tracks = Array.isArray(it.tracks) ? it.tracks : [];
        for (var j = 0; j < tracks.length; j++) {
          var tr = tracks[j];
          if (!tr || !tr.blobId) continue;
          pool.push({
            id: it.id + ':' + tr.id,
            name: tr.name || it.name,
            offsetSec: 0,
            volumeMul: 1,
            enabled: true,
            source: { type: 'idb', blobId: tr.blobId },
            playlistId: it.id,
          });
        }
      } else {
        if (it.enabled === false) continue;
        pool.push(it);
      }
    }
    return pool;
  };

  app.musicUpdateItem = function (slot, itemId, patch) {
    var key = String(slot) === '2' ? '2' : '1';
    var meta = app.loadMusicMeta();
    var list = meta.slots[key];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== itemId) continue;
      if (typeof patch.offsetSec === 'number') list[i].offsetSec = Math.max(0, patch.offsetSec);
      if (typeof patch.volumeMul === 'number') {
        list[i].volumeMul = patch.volumeMul;
        if (list[i].volumeMul < 0.25) list[i].volumeMul = 0.25;
        if (list[i].volumeMul > 2) list[i].volumeMul = 2;
      }
      if (typeof patch.enabled === 'boolean') list[i].enabled = patch.enabled;
      app.saveMusicMeta(meta);
      return true;
    }
    return false;
  };

  function bundledAbsoluteUrl(path) {
    try {
      return new URL(path, window.location.href).href;
    } catch (e) {
      return null;
    }
  }

  app.musicBundledExists = function (path) {
    var url = bundledAbsoluteUrl(path);
    if (!url) return Promise.resolve(false);
    return new Promise(function (resolve) {
      var a = new Audio();
      var done = false;
      function fin(ok) {
        if (done) return;
        done = true;
        try {
          a.removeAttribute('src');
          a.load();
        } catch (e) {}
        resolve(ok);
      }
      var t = setTimeout(function () {
        fin(false);
      }, 3500);
      a.addEventListener(
        'loadedmetadata',
        function () {
          clearTimeout(t);
          fin(true);
        },
        { once: true }
      );
      a.addEventListener(
        'error',
        function () {
          clearTimeout(t);
          fin(false);
        },
        { once: true }
      );
      a.preload = 'metadata';
      a.src = url;
    });
  };

  var DEFAULT_BUNDLED_TRACKS = [
    { slotKey: '1', path: 'audio/track1.mp3', offsetSec: 0, displayName: 'Трек по умолчанию' },
    { slotKey: '2', path: 'audio/track2.mp3', offsetSec: 0, displayName: 'Трек по умолчанию' },
  ];

  app.musicGetDefaultBundledTrackPaths = function () {
    var out = [];
    var seen = {};
    for (var i = 0; i < DEFAULT_BUNDLED_TRACKS.length; i++) {
      var p = DEFAULT_BUNDLED_TRACKS[i] && DEFAULT_BUNDLED_TRACKS[i].path;
      if (!p || seen[p]) continue;
      seen[p] = true;
      out.push(p);
    }
    return out;
  };

  var BUNDLED_PATH_LABELS = {
    'audio/track1.mp3': 'Трек по умолчанию',
    'audio/track2.mp3': 'Трек по умолчанию',
  };

  function migrateBundledDisplayNames(meta) {
    var changed = false;
    ['1', '2'].forEach(function (key) {
      var list = meta.slots[key];
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (item.source && item.source.type === 'bundled' && item.source.path) {
          var label = BUNDLED_PATH_LABELS[item.source.path];
          if (label && item.name !== label) {
            item.name = label;
            changed = true;
          }
        }
      }
    });
    return changed;
  }

  function removeBundledTrackPath(meta, path) {
    var changed = false;
    ['1', '2'].forEach(function (key) {
      var list = meta.slots[key];
      for (var i = list.length - 1; i >= 0; i--) {
        var item = list[i];
        if (item && item.source && item.source.type === 'bundled' && item.source.path === path) {
          list.splice(i, 1);
          changed = true;
        }
      }
    });
    return changed;
  }

  app.musicSeedDefaultBundledTracks = function () {
    var meta = app.loadMusicMeta();
    var changed = false;
    for (var d = 0; d < DEFAULT_BUNDLED_TRACKS.length; d++) {
      var def = DEFAULT_BUNDLED_TRACKS[d];
      var list = meta.slots[def.slotKey];
      var has = false;
      for (var i = 0; i < list.length; i++) {
        var s = list[i].source;
        if (s && s.type === 'bundled' && s.path === def.path) {
          has = true;
          break;
        }
      }
      if (!has) {
        var bn = def.path.replace(/^.*\//, '') || def.path;
        var row = {
          name: def.displayName || bn,
          offsetSec: def.offsetSec,
          volumeMul: 1,
          source: { type: 'bundled', path: def.path },
        };
        if (def.enabled === false) row.enabled = false;
        list.push(normalizeItem(row));
        changed = true;
      }
    }
    if (migrateBundledDisplayNames(meta)) changed = true;
    if (removeBundledTrackPath(meta, 'audio/track3.mp3')) changed = true;
    if (changed) app.saveMusicMeta(meta);
  };

  app.musicAddBundledToSlot = function (slot, path) {
    return app.musicBundledExists(path).then(function (ok) {
      if (!ok) return false;
      var key = String(slot) === '2' ? '2' : '1';
      var meta = app.loadMusicMeta();
      var list = meta.slots[key];
      for (var i = 0; i < list.length; i++) {
        var s = list[i].source;
        if (s && s.type === 'bundled' && s.path === path) return true;
      }
      var bn = path.replace(/^.*\//, '') || path;
      var disp = BUNDLED_PATH_LABELS[path] || bn;
      list.push(
        normalizeItem({
          name: disp,
          offsetSec: 0,
          volumeMul: 1,
          source: { type: 'bundled', path: path },
        })
      );
      app.saveMusicMeta(meta);
      return true;
    });
  };

  app.musicResolvePlaySource = function (item) {
    if (!item || !item.source) return Promise.resolve(null);

    if (item.source.type === 'bundled' && item.source.path) {
      var abs = bundledAbsoluteUrl(item.source.path);
      if (!abs) return Promise.resolve(null);
      return Promise.resolve({ url: abs, revoke: false, mimeType: '' });
    }

    if (item.source.type === 'idb' && item.source.blobId) {
      return app.musicGetBlob(item.source.blobId).then(function (rec) {
        if (!rec || !rec.blob) return null;
        var url = URL.createObjectURL(rec.blob);
        return { url: url, revoke: true, mimeType: rec.mimeType || rec.blob.type };
      });
    }

    return Promise.resolve(null);
  };
})(window.MafiaApp);
