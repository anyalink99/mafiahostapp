// Мост между нашим приложением (в iframe) и content-script расширения,
// сидящим на странице mafiauniverse.org/Games/Edit.
//
// Активируется только когда:
//   1. мы в iframe (window !== window.parent),
//   2. наш origin — chrome-extension://...,
//   3. в URL есть ?mu=1.
//
// Этих признаков достаточно, чтобы остальной код приложения мог проверять
// app.MU.isActive() и не угадывать окружение.
//
// Контракт сообщений описан в chrome-extension-mu/content.js.

(function (app) {
  'use strict';

  var IN_IFRAME = window !== window.parent;
  var IS_EXT_ORIGIN = location.protocol === 'chrome-extension:';
  var HAS_MU_FLAG = /[?&]mu=1\b/.test(location.search);
  var ACTIVE = IN_IFRAME && IS_EXT_ORIGIN && HAS_MU_FLAG;

  var pending = Object.create(null);
  var nextReqId = 1;
  var context = null;
  var contextCallbacks = [];

  function newRequestId() {
    return 'req-' + nextReqId++;
  }

  function postToParent(msg) {
    if (!ACTIVE) return;
    // targetOrigin '*' приемлем: мы внутри chrome-extension, парент — content
    // script расширения. Чувствительных данных в обе стороны не ходит.
    window.parent.postMessage(msg, '*');
  }

  function call(type, payload, timeoutMs) {
    if (!ACTIVE) {
      return Promise.reject(new Error('MU-режим неактивен'));
    }
    var rid = newRequestId();
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () {
        if (pending[rid]) {
          delete pending[rid];
          reject(new Error('Таймаут ожидания ответа от MU bridge (' + type + ')'));
        }
      }, timeoutMs || 10000);

      pending[rid] = function (msg) {
        clearTimeout(to);
        if (msg && msg.ok === false) {
          reject(new Error(msg.error || ('Ошибка ' + type)));
        } else {
          resolve(msg);
        }
      };

      postToParent(Object.assign({ type: type, requestId: rid }, payload || {}));
    });
  }

  window.addEventListener('message', function (event) {
    if (!ACTIVE) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'mu/context') {
      context = {
        tournamentId: msg.tournamentId || null,
        gameId: msg.gameId || null,
        tournteamId: msg.tournteamId || null,
      };
      var cbs = contextCallbacks.slice();
      contextCallbacks.length = 0;
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](context); } catch (e) {}
      }
      return;
    }

    // Запрос от content на получение текущего состояния приложения в MU JSON-формате.
    if (msg.type === 'mu/get-current-state') {
      var data = null, err = null;
      try {
        if (app.buildGameExportMUJson) data = app.buildGameExportMUJson();
        else err = 'buildGameExportMUJson не доступен';
      } catch (e) {
        err = String(e && e.message || e);
      }
      postToParent({
        type: 'mu/get-current-state',
        requestId: msg.requestId,
        ok: !err,
        data: data,
        error: err,
      });
      return;
    }

    // Парент просит применить присланный state (form → app).
    if (msg.type === 'mu/apply-state') {
      try {
        if (app.applyMUStateToApp) app.applyMUStateToApp(msg.data);
      } catch (e) {
        console.warn('[MU] applyMUStateToApp failed:', e);
      }
      return;
    }

    // Ответы по requestId
    if (msg.requestId && pending[msg.requestId]) {
      var cb = pending[msg.requestId];
      delete pending[msg.requestId];
      cb(msg);
    }
  });

  app.MU = {
    isActive: function () { return ACTIVE; },

    getContext: function () { return context; },

    onContext: function (cb) {
      if (typeof cb !== 'function') return;
      if (context) {
        try { cb(context); } catch (e) {}
      } else {
        contextCallbacks.push(cb);
      }
    },

    searchPlayers: function (term, tournteamId) {
      return call('mu/searchPlayers', { term: term, tournteamId: tournteamId })
        .then(function (msg) { return msg.items || []; });
    },

    getLastGamePlayers: function () {
      return call('mu/getLastGamePlayers')
        .then(function (msg) { return msg.data; });
    },

    applyToForm: function (json) {
      return call('mu/apply', { data: json }, 30000);
    },

    showOriginalForm: function () {
      return call('mu/showOriginal');
    },

    // Превратить относительный путь /Images/... в абсолютный
    // (наш UI в chrome-extension не может ходить на относительные пути MU).
    absoluteMUUrl: function (path) {
      if (!path) return null;
      if (/^https?:\/\//i.test(path)) return path;
      return 'https://mafiauniverse.org' + (path.charAt(0) === '/' ? '' : '/') + path;
    },
  };

  // В MU-режиме экспериментальные варианты и автономный ведущий не имеют
  // смысла. Принудительно приводим выбор к стандартному режиму, даже если
  // в localStorage остался выбор с предыдущей standalone-сессии.
  function forceStandardMode() {
    app.experimentalModesEnabled = false;
    if (app.prepareConfig) {
      if (app.prepareConfig.mode !== 'host') app.prepareConfig.mode = 'host';
      if (app.prepareConfig.variant !== 'standard') app.prepareConfig.variant = 'standard';
    }
    if (typeof app.renderPrepareModeScreen === 'function') {
      try { app.renderPrepareModeScreen(); } catch (e) {}
    }
  }

  // Сразу шлём ready, чтобы content-script знал, что нас можно вызывать.
  if (ACTIVE) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        postToParent({ type: 'mu/ready' });
        forceStandardMode();
      });
    } else {
      postToParent({ type: 'mu/ready' });
      forceStandardMode();
    }
    // Маркер на body, чтобы CSS мог реагировать на MU-режим.
    var setMarker = function () {
      if (document.body) document.body.classList.add('mu-mode');
    };
    if (document.body) setMarker();
    else document.addEventListener('DOMContentLoaded', setMarker);
  }
})(window.MafiaApp = window.MafiaApp || {});
