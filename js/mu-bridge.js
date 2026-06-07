// Мост между нашим приложением (в iframe) и content-script расширения,
// сидящим на странице mafiauniverse.org/Games/Edit.
//
// Активируется только когда:
//   1. мы в iframe (window !== window.parent),
//   2. наш origin — chrome-extension://...,
//   3. в URL есть ?mu=1.
// Этих признаков достаточно, чтобы остальной код проверял app.MU.isActive().
//
// Контракт сообщений описан в chrome-extension-mu/content.js.

(function (app) {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // Активация и состояние
  // ────────────────────────────────────────────────────────────

  var IN_IFRAME = window !== window.parent;
  var IS_EXT_ORIGIN = location.protocol === 'chrome-extension:';
  var HAS_MU_FLAG = /[?&]mu=1\b/.test(location.search);
  var ACTIVE = IN_IFRAME && IS_EXT_ORIGIN && HAS_MU_FLAG;

  // Public Cloudflare Worker proxy для autocomplete'а игроков в standalone
  // (вне extension'а). Воркер скрейпит публичную /Players?searchString=…,
  // отдаёт JSON с CORS. Endpoint: GET <URL>?q=<term>.
  // Если null/empty → standalone-fallback отключён (тогда canSearch() = ACTIVE).
  var WORKER_SEARCH_URL = 'https://mafia-mu-proxy.anyalink99.workers.dev/search';

  var context = null;
  var contextCallbacks = [];

  // ────────────────────────────────────────────────────────────
  // Исходящие запросы к content (с requestId, ждём ответа)
  // ────────────────────────────────────────────────────────────

  var pending = Object.create(null);
  var nextReqId = 1;
  function newRequestId() { return 'req-' + nextReqId++; }

  function postToParent(msg) {
    // targetOrigin '*': мы внутри chrome-extension, парент — content script
    // того же расширения. Чувствительных данных по каналу не ходит.
    if (ACTIVE) window.parent.postMessage(msg, '*');
  }

  function call(type, payload, timeoutMs) {
    if (!ACTIVE) return Promise.reject(new Error('MU-режим неактивен'));
    var rid = newRequestId();
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () {
        if (!pending[rid]) return;
        delete pending[rid];
        reject(new Error('Таймаут ожидания ответа от MU bridge (' + type + ')'));
      }, timeoutMs || 10000);
      pending[rid] = function (msg) {
        clearTimeout(to);
        if (msg && msg.ok === false) reject(new Error(msg.error || ('Ошибка ' + type)));
        else resolve(msg);
      };
      postToParent(Object.assign({ type: type, requestId: rid }, payload || {}));
    });
  }

  // ────────────────────────────────────────────────────────────
  // Входящие сообщения от content
  // ────────────────────────────────────────────────────────────

  var inboundHandlers = {
    'mu/context': function (msg) {
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
    },

    // Content просит текущее состояние приложения в MU JSON-формате.
    'mu/get-current-state': function (msg) {
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
    },

    // Парент просит применить присланный state (form → app).
    'mu/apply-state': function (msg) {
      try {
        if (app.applyMUStateToApp) app.applyMUStateToApp(msg.data);
      } catch (e) {
        console.warn('[MU] applyMUStateToApp failed:', e);
      }
    },
  };

  window.addEventListener('message', function (event) {
    if (!ACTIVE) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    var h = inboundHandlers[msg.type];
    if (h) { h(msg); return; }

    // Ответы по requestId на наши же исходящие вызовы.
    if (msg.requestId && pending[msg.requestId]) {
      var cb = pending[msg.requestId];
      delete pending[msg.requestId];
      cb(msg);
    }
  });

  // ────────────────────────────────────────────────────────────
  // Публичный API: app.MU
  // ────────────────────────────────────────────────────────────

  app.MU = {
    isActive: function () { return ACTIVE; },
    // canSearch — true если есть КАКОЙ-НИБУДЬ путь к поиску игроков MU:
    // extension content-script (ACTIVE) или public Cloudflare worker.
    // Используется autocomplete'ом; в standalone'е без extension'а позволяет
    // ник-инпутам подтягивать имена через прокси.
    canSearch: function () { return ACTIVE || !!WORKER_SEARCH_URL; },
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
      if (ACTIVE) {
        return call('mu/searchPlayers', { term: term, tournteamId: tournteamId })
          .then(function (msg) { return msg.items || []; });
      }
      if (!WORKER_SEARCH_URL) return Promise.resolve([]);
      // Standalone-режим: воркер. Нормализуем к тому же контракту, что и
      // extension-канал: {label, id, logoId, note, avatarUrl}.
      // У воркера нет cookies → нет персональных списков турниров, поэтому
      // tournteamId игнорируется (не применимо к публичному поиску).
      return fetch(WORKER_SEARCH_URL + '?q=' + encodeURIComponent(term || ''))
        .then(function (r) {
          if (!r.ok) throw new Error('Worker HTTP ' + r.status);
          return r.json();
        })
        .then(function (items) {
          if (!Array.isArray(items)) return [];
          return items.map(function (p) {
            return {
              label: p.label,
              id: p.id,
              logoId: null,
              note: [p.realName, p.club].filter(Boolean).join(' · '),
              avatarUrl: p.avatarUrl || null, // воркер возвращает абсолютный URL
            };
          });
        });
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

    // Превратить относительный путь /Images/... в абсолютный — наш UI в
    // chrome-extension не может ходить на относительные пути MU.
    absoluteMUUrl: function (path) {
      if (!path) return null;
      if (/^https?:\/\//i.test(path)) return path;
      return 'https://mafiauniverse.org' + (path.charAt(0) === '/' ? '' : '/') + path;
    },
  };

  // ────────────────────────────────────────────────────────────
  // Bootstrap: ready-пинг для content + защита от наследия настроек
  // ────────────────────────────────────────────────────────────

  // В MU-режиме экспериментальные варианты и автономный ведущий не имеют
  // смысла. Принудительно приводим выбор к стандартному, даже если в
  // localStorage остался выбор с предыдущей standalone-сессии.
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

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  if (ACTIVE) {
    onReady(function () {
      postToParent({ type: 'mu/ready' });
      forceStandardMode();
      // Маркер на body, чтобы CSS мог реагировать на MU-режим (mu-mode).
      if (document.body) document.body.classList.add('mu-mode');
    });
  }
})(window.MafiaApp = window.MafiaApp || {});
