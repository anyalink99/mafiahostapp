(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.storageApi = api.createStorageApi(root.localStorage, root);
    root.MafiaApp.settingsRepository = api.createSettingsRepository(root.MafiaApp.storageApi);
    root.MafiaApp.gameRepository = api.createGameRepository(root.MafiaApp.storageApi);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function createStorageApi(storage, eventTarget) {
    var listeners = {};

    function emit(key, value) {
      var list = listeners[key];
      if (!list) return;
      list.slice().forEach(function (listener) {
        listener(value, key);
      });
    }

    function getRaw(key, fallback) {
      try {
        var value = storage.getItem(key);
        return value == null ? fallback : value;
      } catch (_e) {
        return fallback;
      }
    }

    function setRaw(key, value) {
      try {
        storage.setItem(key, String(value));
        emit(key, String(value));
        return true;
      } catch (_e) {
        return false;
      }
    }

    function remove(key) {
      try {
        storage.removeItem(key);
        emit(key, null);
        return true;
      } catch (_e) {
        return false;
      }
    }

    function getJson(key, fallback) {
      var raw = getRaw(key, null);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch (_e) {
        return fallback;
      }
    }

    function setJson(key, value) {
      try {
        return setRaw(key, JSON.stringify(value));
      } catch (_e) {
        return false;
      }
    }

    function subscribe(key, listener) {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(listener);
      return function () {
        var list = listeners[key] || [];
        var index = list.indexOf(listener);
        if (index !== -1) list.splice(index, 1);
      };
    }

    if (eventTarget && eventTarget.addEventListener) {
      eventTarget.addEventListener('storage', function (event) {
        if (event && event.key) emit(event.key, event.newValue);
      });
    }

    return {
      getRaw: getRaw,
      setRaw: setRaw,
      remove: remove,
      has: function (key) {
        return getRaw(key, null) !== null;
      },
      getJson: getJson,
      setJson: setJson,
      subscribe: subscribe,
    };
  }

  function createSettingsRepository(storageApi) {
    return {
      getString: function (key, fallback) {
        return storageApi.getRaw(key, fallback);
      },
      setString: function (key, value) {
        return storageApi.setRaw(key, value);
      },
      getBoolean: function (key, fallback) {
        var value = storageApi.getRaw(key, null);
        if (value === null) return !!fallback;
        return value === '1' || value === 'true';
      },
      setBoolean: function (key, value) {
        return storageApi.setRaw(key, value ? '1' : '0');
      },
      getNumber: function (key, fallback, options) {
        var raw = storageApi.getRaw(key, null);
        if (raw === null || raw === '') return fallback;
        var value = Number(raw);
        if (!isFinite(value)) return fallback;
        options = options || {};
        if (typeof options.min === 'number') value = Math.max(options.min, value);
        if (typeof options.max === 'number') value = Math.min(options.max, value);
        return value;
      },
      setNumber: function (key, value) {
        if (!isFinite(value)) return false;
        return storageApi.setRaw(key, value);
      },
      getJson: storageApi.getJson,
      setJson: storageApi.setJson,
      remove: storageApi.remove,
      subscribe: storageApi.subscribe,
    };
  }

  function createGameRepository(storageApi) {
    var schemas = {};

    function register(key, schema) {
      schemas[key] = {
        version: Math.max(1, Number(schema && schema.version) || 1),
        migrations: (schema && schema.migrations) || {},
        validate: schema && schema.validate,
      };
      return key;
    }

    function normalize(key, snapshot) {
      var schema = schemas[key] || { version: 1, migrations: {} };
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
      var current = snapshot;
      var version = Number(current.schemaVersion) || 0;
      while (version < schema.version) {
        var targetVersion = version + 1;
        var migrate = schema.migrations[targetVersion];
        current = migrate ? migrate(current) : Object.assign({}, current);
        if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
        current.schemaVersion = targetVersion;
        version = targetVersion;
      }
      if (schema.validate && !schema.validate(current)) return null;
      return current;
    }

    function read(key, fallback) {
      var raw = storageApi.getJson(key, null);
      var originalVersion = raw && Number(raw.schemaVersion);
      var snapshot = normalize(key, raw);
      if (!snapshot) return fallback;
      if (!originalVersion || originalVersion !== snapshot.schemaVersion) {
        storageApi.setJson(key, snapshot);
      }
      return snapshot;
    }

    function write(key, snapshot) {
      var schema = schemas[key] || { version: 1 };
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
      var versioned = Object.assign({}, snapshot, { schemaVersion: schema.version });
      if (schema.validate && !schema.validate(versioned)) return false;
      return storageApi.setJson(key, versioned);
    }

    return {
      register: register,
      read: read,
      write: write,
      remove: storageApi.remove,
      has: storageApi.has,
    };
  }

  return {
    createStorageApi: createStorageApi,
    createSettingsRepository: createSettingsRepository,
    createGameRepository: createGameRepository,
  };
});
