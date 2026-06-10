// Виджет автокомплита игроков из базы MafiaUniverse.
//
// Активируется только в MU-режиме (когда app.MU.isActive()). Привязывается
// к указанному input-у: показывает плавающий dropdown с результатами поиска
// по нику (через app.MU.searchPlayers), позволяет выбрать игрока. По выбору
// вызывает onSelect({label, id, logoId, note}) — потребитель сам решает,
// что делать (сохранить muPlayerId в state, заполнить input, и т.д.).
//
// Использование: app.attachMUAutocomplete(input, { onSelect: fn, useTeamId: true })

(function (app) {
  'use strict';

  var attached = new WeakSet();
  var MU_ORIGIN = 'https://mafiauniverse.org';
  var escapeHtml =
    (app.MuUtils && app.MuUtils.escapeHtml) ||
    function (s) {
      return String(s == null ? '' : s);
    };

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments,
        self = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  function buildDropdown() {
    var dd = document.createElement('div');
    dd.className = 'mu-ac-dropdown';
    dd.style.display = 'none';
    document.body.appendChild(dd);
    return dd;
  }

  function positionDropdown(dd, input) {
    var r = input.getBoundingClientRect();
    dd.style.left = r.left + window.scrollX + 'px';
    dd.style.top = r.bottom + window.scrollY + 2 + 'px';
    dd.style.minWidth = r.width + 'px';
  }

  function renderState(dd, html) {
    dd.innerHTML = html;
    dd.style.display = '';
  }

  function avatarHtml(item) {
    if (item.avatarUrl) {
      // extension отдаёт относительный путь '/Images/...', worker — абсолютный.
      var raw = item.avatarUrl;
      var url = /^https?:\/\//i.test(raw) ? raw : MU_ORIGIN + raw;
      return '<img class="mu-ac-item__avatar" src="' + escapeHtml(url) + '" alt="" loading="lazy">';
    }
    var initial = (item.label || '?').charAt(0).toUpperCase();
    return (
      '<div class="mu-ac-item__avatar mu-ac-item__avatar--placeholder">' +
      escapeHtml(initial) +
      '</div>'
    );
  }

  function renderItems(dd, items) {
    if (!items.length) {
      renderState(dd, '<div class="mu-ac-empty">Никого не нашли</div>');
      return;
    }
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html +=
        '<div class="mu-ac-item" data-mu-ac-index="' +
        i +
        '">' +
        avatarHtml(it) +
        '<div class="mu-ac-item__text">' +
        '<div class="mu-ac-item__nick">' +
        escapeHtml(it.label) +
        '</div>' +
        (it.note ? '<div class="mu-ac-item__note">' + escapeHtml(it.note) + '</div>' : '') +
        '</div>' +
        '</div>';
    }
    dd.innerHTML = html;
    dd.style.display = '';
  }

  app.attachMUAutocomplete = function (input, options) {
    if (!input || !(input instanceof HTMLElement)) return;
    if (attached.has(input)) return;
    if (!app.MU || !app.MU.canSearch()) return;
    attached.add(input);

    options = options || {};
    var onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
    var onClear = typeof options.onClear === 'function' ? options.onClear : null;

    // Оборачиваем input в <span class="mu-input-wrap"> и кладём туда badge.
    // Так badge позиционируется относительно прямоугольника input-а, а не
    // парент-блока модалки (в котором ещё label, padding и т.п.).
    var wrap = null;
    var badge = null;
    function ensureWrap() {
      if (wrap) return wrap;
      var parent = input.parentElement;
      if (!parent) return null;
      wrap = document.createElement('span');
      wrap.className = 'mu-input-wrap';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      return wrap;
    }
    function ensureBadge() {
      if (badge) return badge;
      var w = ensureWrap();
      if (!w) return null;
      badge = document.createElement('span');
      badge.className = 'mu-ac-input-badge';
      badge.style.display = 'none';
      w.appendChild(badge);
      return badge;
    }
    function paintBadge() {
      var nick = (input.value || '').trim();
      var meta = nick && app.muMetaByNick ? app.muMetaByNick[nick] : null;
      var b = ensureBadge();
      if (!b) return;
      if (!meta || !meta.id) {
        b.style.display = 'none';
        b.innerHTML = '';
        return;
      }
      if (meta.logoId) {
        var url =
          MU_ORIGIN +
          '/Images/GetImage?imageId=' +
          encodeURIComponent(meta.logoId) +
          '&resizeWith=60';
        b.innerHTML = '<img src="' + escapeHtml(url) + '" alt="">';
      } else {
        var initial = (nick.charAt(0) || '?').toUpperCase();
        b.innerHTML =
          '<span class="mu-ac-input-badge__placeholder">' + escapeHtml(initial) + '</span>';
      }
      b.title = meta.note ? nick + ' (' + meta.note + ')' : nick;
      b.style.display = '';
    }

    function refreshBoundClass() {
      var val = input.value || '';
      if (val && app.muPlayerIdByNick && app.muPlayerIdByNick[val]) {
        input.classList.add('is-mu-bound');
      } else {
        input.classList.remove('is-mu-bound');
      }
      paintBadge();
    }

    // Перехватываем .value setter, чтобы reactive обновлять badge даже
    // когда наш app сам присваивает значение (открытие модалки игрока
    // через input.value = player.nick, без события).
    try {
      var proto = HTMLInputElement.prototype;
      var origDesc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (origDesc && origDesc.set && origDesc.get) {
        Object.defineProperty(input, 'value', {
          configurable: true,
          get: function () {
            return origDesc.get.call(this);
          },
          set: function (v) {
            origDesc.set.call(this, v);
            // refreshBoundClass может вызваться при первоначальной настройке —
            // wrap к этому моменту уже создан выше
            refreshBoundClass();
          },
        });
      }
    } catch (e) {}

    // первоначальное состояние (например, восстановили из state с уже выбранным игроком)
    refreshBoundClass();

    var dd = null;
    var currentItems = [];
    var activeIndex = -1;
    var lastTerm = '';
    var requestSeq = 0;

    function close() {
      if (dd) dd.style.display = 'none';
      activeIndex = -1;
    }

    var doSearch = debounce(function () {
      var term = input.value.trim();
      if (term === lastTerm && dd && dd.style.display !== 'none') return;
      lastTerm = term;

      if (!dd) dd = buildDropdown();
      positionDropdown(dd, input);
      renderState(dd, '<div class="mu-ac-loading">Ищу…</div>');

      var mySeq = ++requestSeq;
      app.MU.searchPlayers(term)
        .then(function (items) {
          if (mySeq !== requestSeq) return;
          currentItems = items;
          activeIndex = -1;
          renderItems(dd, items);
        })
        .catch(function (err) {
          if (mySeq !== requestSeq) return;
          renderState(
            dd,
            '<div class="mu-ac-error">' + escapeHtml((err && err.message) || err) + '</div>'
          );
        });
    }, 200);

    function selectByIndex(idx) {
      var it = currentItems[idx];
      if (!it) return;
      // запоминаем привязку ДО dispatch события input, чтобы refreshBoundClass его увидел
      if (it.label && it.id) {
        app.muPlayerIdByNick = app.muPlayerIdByNick || {};
        app.muPlayerIdByNick[it.label] = it.id;
        app.muMetaByNick = app.muMetaByNick || {};
        app.muMetaByNick[it.label] = {
          id: it.id,
          logoId: it.logoId || null,
          note: it.note || null,
        };
      }
      input.value = it.label;
      refreshBoundClass();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // ещё раз, потому что наш же input-handler ниже её снова вызовет
      refreshBoundClass();
      close();
      if (onSelect) {
        try {
          onSelect(it);
        } catch (e) {}
      }
    }

    // Если value совпадает с уже выбранным игроком (is-mu-bound) — не
    // показываем дропдаун. Изменит юзер хоть символ → bound снимется в
    // refreshBoundClass, doSearch отработает.
    function isBound() {
      return input.classList.contains('is-mu-bound');
    }

    input.addEventListener('input', function () {
      refreshBoundClass();
      if (onClear) {
        try {
          onClear();
        } catch (e) {}
      }
      if (isBound()) {
        close();
        return;
      }
      doSearch();
    });

    input.addEventListener('focus', function () {
      refreshBoundClass();
      if (isBound()) {
        close();
        return;
      }
      doSearch();
    });

    input.addEventListener('keydown', function (e) {
      if (!dd || dd.style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
        updateActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActive();
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectByIndex(activeIndex);
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });

    function updateActive() {
      if (!dd) return;
      var nodes = dd.querySelectorAll('.mu-ac-item');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('is-active', i === activeIndex);
      }
      var active = nodes[activeIndex];
      if (active && active.scrollIntoView) {
        active.scrollIntoView({ block: 'nearest' });
      }
    }

    // клик по элементу выпадайки
    document.addEventListener('mousedown', function (e) {
      if (!dd || dd.style.display === 'none') return;
      var target = e.target;
      if (input.contains(target)) return;
      var item = target.closest && target.closest('.mu-ac-item');
      if (item && dd.contains(item)) {
        e.preventDefault();
        var idx = parseInt(item.getAttribute('data-mu-ac-index'), 10);
        if (!isNaN(idx)) selectByIndex(idx);
        return;
      }
      close();
    });

    // закрыть при смене размера окна / скролле
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
  };

  // =====================================================================
  // Bootstrap: автоматически привязываем автокомплит к нашим input-ам
  // ника и ведущего, как только app переходит в MU-режим.
  // =====================================================================

  // Мапа nick → muPlayerId, заполняется при выборе из автокомплита.
  // mu-export.js использует её при формировании поля playerId.
  app.muPlayerIdByNick = app.muPlayerIdByNick || {};

  function attachToCommonInputs() {
    if (!app.MU || !app.MU.canSearch()) return;
    var ids = [
      'modal-player-nick',
      'modal-summary-nick',
      'modal-auto-player-nick',
      'summary-host-name',
    ];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) app.attachMUAutocomplete(el);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachToCommonInputs);
  } else {
    attachToCommonInputs();
  }
})((window.MafiaApp = window.MafiaApp || {}));
