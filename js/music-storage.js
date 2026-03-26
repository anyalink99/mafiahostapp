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
    return { version: 1, slots: { '1': [], '2': [] } };
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
    if (item.source && item.source.type === 'idb' && item.source.blobId) {
      return app.musicDeleteBlob(item.source.blobId).catch(function () {}).then(function () {
        return true;
      });
    }
    return Promise.resolve(true);
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
    // Track 3 был удалён из проекта: убираем из метаданных, если был раньше засидирован.
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
