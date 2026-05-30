// Content-script для mafiauniverse.org/Games/Edit:
//   1. Создаёт оверлей с iframe нашего приложения (расширение → app/index.html).
//   2. Прокси между iframe (через postMessage) и MU-формой/MU-API.
//   3. Двусторонний sync state↔form при переключении интерфейса:
//        «Показать форму MU»          — state в iframe → форма, спрятать оверлей.
//        «Вернуться в Mafia Host»     — форма → state в iframe, показать оверлей.
//      При первой загрузке: если в форме уже что-то есть (открыта сохранённая
//      игра) — содержимое формы автоматически уезжает в iframe.
//   4. Сохраняет старый popup-flow с textarea как fallback.
//
// Низкоуровневое чтение/запись формы и вызовы MU API живут в mu-form-io.js
// (window.MuFormIO) — этот файл его потребитель.
(function () {
  'use strict';

  var FormIO = window.MuFormIO;
  if (!FormIO) {
    console.warn('[MU] mu-form-io.js не загрузился — content-script не работает');
    return;
  }

  var IS_EDIT_PAGE = /\/Games\/Edit(\/|\?|$)/i.test(location.pathname + location.search);
  var EXT_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');

  // ────────────────────────────────────────────────────────────
  // Overlay с iframe (наш UI поверх их страницы)
  // ────────────────────────────────────────────────────────────

  var overlay = null;
  var iframe = null;
  var iframeReady = false;
  // Сообщения, накопленные до того, как iframe сообщил mu/ready.
  var iframePending = [];

  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'mu-mh-host';

    var bar = document.createElement('div');
    bar.className = 'mu-mh-host__bar';

    var title = document.createElement('div');
    title.className = 'mu-mh-host__title';
    title.textContent = 'Mafia Host UI';
    bar.appendChild(title);

    var spacer = document.createElement('div');
    spacer.className = 'mu-mh-host__spacer';
    bar.appendChild(spacer);

    var showFormBtn = document.createElement('button');
    showFormBtn.type = 'button';
    showFormBtn.className = 'mu-mh-host__btn';
    showFormBtn.textContent = 'Показать форму MU';
    showFormBtn.addEventListener('click', syncStateToFormThenHide);
    bar.appendChild(showFormBtn);

    overlay.appendChild(bar);

    iframe = document.createElement('iframe');
    iframe.className = 'mu-mh-host__frame';
    iframe.src = chrome.runtime.getURL('app/index.html?mu=1');
    iframe.setAttribute('allow', 'clipboard-write; autoplay');
    overlay.appendChild(iframe);

    document.body.appendChild(overlay);
    return overlay;
  }

  function showOverlay() {
    if (!overlay) buildOverlay();
    overlay.classList.remove('mu-mh-host--hidden');
    document.documentElement.style.overflow = 'hidden';
  }
  function hideOverlay() {
    if (overlay) overlay.classList.add('mu-mh-host--hidden');
    document.documentElement.style.overflow = '';
    ensureFloatingReturnButton();
  }

  // ────────────────────────────────────────────────────────────
  // Плавающая кнопка возврата в наш UI (видна когда оверлей скрыт)
  // ────────────────────────────────────────────────────────────

  var floatingBtn = null;
  function ensureFloatingReturnButton() {
    if (floatingBtn) return;
    floatingBtn = document.createElement('button');
    floatingBtn.type = 'button';
    floatingBtn.className = 'mu-mh-host__btn mu-mh-host__btn--primary';
    floatingBtn.textContent = 'Вернуться в Mafia Host';
    floatingBtn.style.position = 'fixed';
    floatingBtn.style.bottom = '16px';
    floatingBtn.style.right = '16px';
    floatingBtn.style.zIndex = '99996';
    floatingBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    floatingBtn.addEventListener('click', syncFormToStateThenShow);
    document.body.appendChild(floatingBtn);
  }

  // ────────────────────────────────────────────────────────────
  // Баннер «Данные применены» над их формой (после Apply из iframe)
  // ────────────────────────────────────────────────────────────

  var bannerEl = null;
  function showAppliedBanner(result) {
    removeBanner();
    var form = document.getElementById('gameForm');
    if (!form || !form.parentNode) return;

    bannerEl = document.createElement('div');
    bannerEl.className = 'mu-mh-banner';

    var title = document.createElement('div');
    title.className = 'mu-mh-banner__title';
    title.textContent = 'Данные применены';

    var details = document.createElement('div');
    details.className = 'mu-mh-banner__details';
    var warnCount = (result && result.warnings) ? result.warnings.length : 0;
    details.textContent =
      'Игроков: ' + (result.playersFilled || 0) +
      ', голосований: ' + (result.votingsWritten || 0) +
      (warnCount ? ' (предупреждений: ' + warnCount + ')' : '') +
      '. Проверьте поля и нажмите Сохранить.';

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'mu-mh-banner__btn';
    dismissBtn.textContent = 'Скрыть';
    dismissBtn.addEventListener('click', removeBanner);

    bannerEl.appendChild(title);
    bannerEl.appendChild(details);
    bannerEl.appendChild(dismissBtn);
    form.parentNode.insertBefore(bannerEl, form);
  }
  function removeBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  // ────────────────────────────────────────────────────────────
  // postMessage канал с iframe
  //   ─ исходящий: requestIframe (ждём ответа по requestId)
  //   ─ входящий: единый обработчик ниже распределяет по type
  // ────────────────────────────────────────────────────────────

  function sendToIframe(msg) {
    if (!iframe || !iframe.contentWindow || !iframeReady) {
      iframePending.push(msg);
      return;
    }
    iframe.contentWindow.postMessage(msg, EXT_ORIGIN);
  }
  function flushIframePending() {
    if (!iframeReady || !iframe || !iframe.contentWindow) return;
    while (iframePending.length) {
      iframe.contentWindow.postMessage(iframePending.shift(), EXT_ORIGIN);
    }
  }
  function reply(requestId, type, payload) {
    sendToIframe(Object.assign({ type: type, requestId: requestId }, payload || {}));
  }

  var contentReqSeq = 1;
  var contentPending = Object.create(null);
  function requestIframe(type, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var rid = 'c-' + contentReqSeq++;
      var to = setTimeout(function () {
        if (contentPending[rid]) {
          delete contentPending[rid];
          reject(new Error('Таймаут ответа iframe (' + type + ')'));
        }
      }, timeoutMs || 5000);
      contentPending[rid] = function (msg) {
        clearTimeout(to);
        if (msg && msg.ok === false) reject(new Error(msg.error || ('Ошибка ' + type)));
        else resolve(msg);
      };
      sendToIframe(Object.assign({ type: type, requestId: rid }, payload || {}));
    });
  }

  // ────────────────────────────────────────────────────────────
  // Sync state↔form при переключении интерфейса
  // ────────────────────────────────────────────────────────────

  function syncStateToFormThenHide() {
    requestIframe('mu/get-current-state')
      .then(function (msg) {
        if (msg && msg.data) {
          try { FormIO.fillForm(msg.data); }
          catch (e) { console.warn('[MU] state→form fillForm:', e); }
        }
      })
      .catch(function (err) {
        // Если iframe не ответил — всё равно прячем оверлей.
        console.warn('[MU] state→form sync failed:', err && err.message);
      })
      .then(hideOverlay);
  }

  function syncFormToStateThenShow() {
    var formData = null;
    try { formData = FormIO.readFormToMUJson(); }
    catch (e) { console.warn('[MU] readForm:', e); }
    removeBanner();
    if (formData) sendToIframe({ type: 'mu/apply-state', data: formData });
    showOverlay();
  }

  // ────────────────────────────────────────────────────────────
  // Обработчики mu/* сообщений из iframe
  //   (диспатчатся по type из единого message-listener'а ниже)
  // ────────────────────────────────────────────────────────────

  var handlers = {
    'mu/ready': function () {
      iframeReady = true;
      flushIframePending();
      sendToIframe({
        type: 'mu/context',
        tournamentId: FormIO.getTournamentIdFromForm(),
        gameId: FormIO.getGameId(),
        tournteamId: FormIO.getTournamentTeamIdFromForm(),
      });
      // Если форма уже содержит данные (открыта сохранённая игра) — заливаем
      // их в iframe, чтобы user видел существующее состояние, а не пустой UI.
      try {
        var formData = FormIO.readFormToMUJson();
        if (FormIO.formHasContent(formData)) {
          sendToIframe({ type: 'mu/apply-state', data: formData });
        }
      } catch (e) {
        console.warn('[MU] initial form→state push failed:', e);
      }
    },

    'mu/searchPlayers': function (msg) {
      FormIO.searchPlayers(msg.term, msg.tournteamId || FormIO.getTournamentTeamIdFromForm())
        .then(function (items) {
          reply(msg.requestId, 'mu/searchPlayersResult', { ok: true, items: items });
        })
        .catch(function (err) {
          reply(msg.requestId, 'mu/searchPlayersResult', { ok: false, error: errMsg(err) });
        });
    },

    'mu/getLastGamePlayers': function (msg) {
      FormIO.getLastTournamentGame()
        .then(function (data) {
          reply(msg.requestId, 'mu/getLastGamePlayersResult', { ok: true, data: data });
        })
        .catch(function (err) {
          reply(msg.requestId, 'mu/getLastGamePlayersResult', { ok: false, error: errMsg(err) });
        });
    },

    'mu/apply': function (msg) {
      var result;
      try { result = FormIO.fillForm(msg.data); }
      catch (e) { result = { ok: false, error: errMsg(e) }; }
      reply(msg.requestId, 'mu/applyResult', result);
      if (result && result.ok) {
        hideOverlay();
        showAppliedBanner(result);
      }
    },

    'mu/showOriginal': function (msg) {
      hideOverlay();
      reply(msg.requestId, 'mu/showOriginalResult', { ok: true });
    },
  };

  function errMsg(err) { return String(err && err.message || err); }

  window.addEventListener('message', function (event) {
    if (event.origin !== EXT_ORIGIN) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    var h = handlers[msg.type];
    if (h) { h(msg); return; }
    // Ответы iframe на наши content→iframe запросы (по requestId).
    if (msg.requestId && contentPending[msg.requestId]) {
      var cb = contentPending[msg.requestId];
      delete contentPending[msg.requestId];
      cb(msg);
    }
  });

  // ────────────────────────────────────────────────────────────
  // Legacy popup-flow (textarea + Fill) — fallback вне MU-режима
  // ────────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.type !== 'fill-mu-form') return false;
    try {
      var result = FormIO.fillForm(msg.data);
      sendResponse(result);
      if (result && result.ok) {
        hideOverlay();
        showAppliedBanner(result);
      }
    } catch (err) {
      sendResponse({ ok: false, error: errMsg(err) });
    }
    return false;
  });

  // ────────────────────────────────────────────────────────────
  // Bootstrap
  // ────────────────────────────────────────────────────────────

  if (!IS_EDIT_PAGE) return;

  function start() { showOverlay(); }
  // На document_idle DOM формы обычно уже есть, но иногда подгружается чуть позже.
  if (document.getElementById('gameForm')) {
    start();
  } else {
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      if (document.getElementById('gameForm')) {
        clearInterval(poll);
        start();
      } else if (tries > 40) {
        clearInterval(poll);
      }
    }, 100);
  }
})();
