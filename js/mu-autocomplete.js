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
  var dropdownSequence = 0;

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
    dd.id = 'mu-ac-listbox-' + ++dropdownSequence;
    dd.setAttribute('role', 'listbox');
    dd.setAttribute('aria-label', 'Игроки MafiaUniverse');
    dd.style.display = 'none';
    document.body.appendChild(dd);
    return dd;
  }

  function positionDropdown(dd, input) {
    if (!dd || !input || dd.style.display === 'none') return;
    var r = input.getBoundingClientRect();
    if (!r.width || !r.height || !input.getClientRects().length) return;

    // visualViewport учитывает экранную клавиатуру на телефоне. Координаты
    // getBoundingClientRect и position:fixed находятся в одной системе; offset
    // нужен при сдвиге visual viewport (клавиатура, масштабирование страницы).
    var viewport = window.visualViewport;
    var viewportLeft = viewport ? viewport.offsetLeft : 0;
    var viewportTop = viewport ? viewport.offsetTop : 0;
    var viewportWidth = viewport ? viewport.width : document.documentElement.clientWidth;
    var viewportHeight = viewport ? viewport.height : document.documentElement.clientHeight;
    var viewportRight = viewportLeft + viewportWidth;
    var viewportBottom = viewportTop + viewportHeight;
    var edge = 8;
    var gap = 5;

    // Ширина всегда совпадает с полем и никогда не вылезает за края экрана.
    var width = Math.min(r.width, Math.max(0, viewportWidth - edge * 2));
    var left = Math.max(viewportLeft + edge, Math.min(r.left, viewportRight - edge - width));
    dd.style.width = Math.max(0, Math.floor(width)) + 'px';
    dd.style.minWidth = '0';
    dd.style.maxWidth = Math.max(0, Math.floor(viewportWidth - edge * 2)) + 'px';
    dd.style.left = Math.round(left) + 'px';

    var roomBelow = Math.max(0, viewportBottom - edge - r.bottom - gap);
    var roomAbove = Math.max(0, r.top - viewportTop - edge - gap);
    var preferredHeight = Math.min(dd.scrollHeight || 320, 320);
    var placeBelow = roomBelow >= Math.min(preferredHeight, 180) || roomBelow >= roomAbove;
    var available = placeBelow ? roomBelow : roomAbove;
    var maxHeight = Math.max(72, Math.min(320, available));
    dd.style.maxHeight = Math.floor(maxHeight) + 'px';

    // После max-height можно точно узнать фактическую высоту и аккуратно
    // поставить список над полем, если под ним не осталось места.
    var dropdownHeight = Math.min(dd.scrollHeight, maxHeight);
    var top = placeBelow ? r.bottom + gap : r.top - gap - dropdownHeight;
    top = Math.max(viewportTop + edge, Math.min(top, viewportBottom - edge - dropdownHeight));
    dd.style.top = Math.round(top) + 'px';
    dd.setAttribute('data-placement', placeBelow ? 'bottom' : 'top');
  }

  // Данные приходят с MafiaUniverse (ники, заметки, URL аватарок) — рендерим
  // DOM-билдером app.h: текст и атрибуты безопасны по построению.
  function renderState(dd, node) {
    dd.innerHTML = '';
    dd.appendChild(node);
    dd.style.display = '';
  }

  function stateMessage(className, text) {
    return app.h('div', { className: className, role: 'status' }, text);
  }

  function resultsHeader(count) {
    var ending = count === 1 ? 'результат' : count > 1 && count < 5 ? 'результата' : 'результатов';
    return app.h('div', { className: 'mu-ac-header', 'aria-hidden': 'true' }, [
      app.h('span', { className: 'mu-ac-header__source' }, [
        app.h('span', { className: 'mu-ac-header__mark' }),
        'MafiaUniverse',
      ]),
      app.h('span', { className: 'mu-ac-header__count' }, count + ' ' + ending),
    ]);
  }

  function avatarEl(item) {
    if (item.avatarUrl) {
      // extension отдаёт относительный путь '/Images/...', worker — абсолютный.
      var raw = item.avatarUrl;
      var url = /^https?:\/\//i.test(raw) ? raw : MU_ORIGIN + raw;
      return app.h('img', { className: 'mu-ac-item__avatar', src: url, alt: '', loading: 'lazy' });
    }
    var initial = (item.label || '?').charAt(0).toUpperCase();
    return app.h(
      'div',
      { className: 'mu-ac-item__avatar mu-ac-item__avatar--placeholder' },
      initial
    );
  }

  function renderItems(dd, items) {
    if (!items.length) {
      renderState(dd, stateMessage('mu-ac-empty', 'Никого не нашли'));
      return;
    }
    var frag = document.createDocumentFragment();
    frag.appendChild(resultsHeader(items.length));
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      frag.appendChild(
        app.h(
          'div',
          {
            id: dd.id + '-option-' + i,
            className: 'mu-ac-item',
            'data-mu-ac-index': String(i),
            role: 'option',
            'aria-selected': 'false',
          },
          [
            avatarEl(it),
            app.h('div', { className: 'mu-ac-item__text' }, [
              app.h('div', { className: 'mu-ac-item__nick' }, it.label),
              it.note ? app.h('div', { className: 'mu-ac-item__note' }, it.note) : null,
            ]),
          ]
        )
      );
    }
    renderState(dd, frag);
  }

  app.attachMUAutocomplete = function (input, options) {
    if (!input || !(input instanceof HTMLElement)) return;
    if (attached.has(input)) return;
    if (!app.MU || !app.MU.canSearch()) return;
    attached.add(input);

    options = options || {};
    var onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
    var onClear = typeof options.onClear === 'function' ? options.onClear : null;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');

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
      b.innerHTML = '';
      if (meta.logoId) {
        var url =
          MU_ORIGIN +
          '/Images/GetImage?imageId=' +
          encodeURIComponent(meta.logoId) +
          '&resizeWith=60';
        b.appendChild(app.h('img', { src: url, alt: '' }));
      } else {
        var initial = (nick.charAt(0) || '?').toUpperCase();
        b.appendChild(app.h('span', { className: 'mu-ac-input-badge__placeholder' }, initial));
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
    var positionFrame = 0;

    function ensureDropdown() {
      if (dd) return dd;
      dd = buildDropdown();
      input.setAttribute('aria-controls', dd.id);

      // На мыши сохраняем фокус в input, на таче не блокируем pan-y: так
      // пользователь может начать прокрутку прямо с любой строки результата.
      dd.addEventListener('mousedown', function (e) {
        if (e.button === 0 && e.target.closest && e.target.closest('.mu-ac-item')) {
          e.preventDefault();
        }
      });
      dd.addEventListener('click', function (e) {
        var item = e.target.closest && e.target.closest('.mu-ac-item');
        if (!item || !dd.contains(item)) return;
        var idx = parseInt(item.getAttribute('data-mu-ac-index'), 10);
        if (!isNaN(idx)) selectByIndex(idx);
      });
      return dd;
    }

    function schedulePosition() {
      if (!dd || dd.style.display === 'none') return;
      if (positionFrame) cancelAnimationFrame(positionFrame);
      positionFrame = requestAnimationFrame(function () {
        positionFrame = 0;
        positionDropdown(dd, input);
      });
    }

    function showNode(node, busy) {
      var dropdown = ensureDropdown();
      dropdown.removeAttribute('title');
      dropdown.setAttribute('aria-busy', busy ? 'true' : 'false');
      renderState(dropdown, node);
      input.setAttribute('aria-expanded', 'true');
      positionDropdown(dropdown, input);
    }

    function close() {
      requestSeq++;
      if (positionFrame) {
        cancelAnimationFrame(positionFrame);
        positionFrame = 0;
      }
      if (dd) {
        dd.style.display = 'none';
        dd.setAttribute('aria-busy', 'false');
      }
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    }

    var doSearch = debounce(function () {
      var term = input.value.trim();
      if (term === lastTerm && dd && dd.style.display !== 'none') return;
      lastTerm = term;

      showNode(stateMessage('mu-ac-loading', 'Ищу игроков…'), true);

      var mySeq = ++requestSeq;
      app.MU.searchPlayers(term)
        .then(function (items) {
          if (mySeq !== requestSeq) return;
          currentItems = items;
          activeIndex = -1;
          renderItems(dd, items);
          dd.setAttribute('aria-busy', 'false');
          positionDropdown(dd, input);
        })
        .catch(function (err) {
          if (mySeq !== requestSeq) return;
          currentItems = [];
          dd.setAttribute('aria-busy', 'false');
          renderState(
            dd,
            stateMessage(
              'mu-ac-error',
              'Не удалось загрузить игроков. Проверь соединение и попробуй ещё раз.'
            )
          );
          dd.title = String((err && err.message) || err || 'Ошибка поиска');
          positionDropdown(dd, input);
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
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        close();
      }
    });

    function updateActive() {
      if (!dd) return;
      var nodes = dd.querySelectorAll('.mu-ac-item');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].classList.toggle('is-active', i === activeIndex);
        nodes[i].setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      }
      var active = nodes[activeIndex];
      if (active) {
        input.setAttribute('aria-activedescendant', active.id);
        var header = dd.querySelector('.mu-ac-header');
        var stickyOffset = header ? header.offsetHeight : 0;
        var itemTop = active.offsetTop;
        var itemBottom = itemTop + active.offsetHeight;
        var visibleTop = dd.scrollTop + stickyOffset;
        var visibleBottom = dd.scrollTop + dd.clientHeight;
        if (itemTop < visibleTop) dd.scrollTop = Math.max(0, itemTop - stickyOffset);
        else if (itemBottom > visibleBottom) dd.scrollTop = itemBottom - dd.clientHeight;
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    // Закрываем только при нажатии снаружи. Касание и scroll внутри dropdown
    // принадлежат самому списку и не должны его схлопывать.
    document.addEventListener('pointerdown', function (e) {
      if (!dd || dd.style.display === 'none') return;
      var target = e.target;
      if (target === input || (wrap && wrap.contains(target)) || dd.contains(target)) return;
      close();
    });

    document.addEventListener('focusin', function (e) {
      if (!dd || dd.style.display === 'none') return;
      if (e.target === input || dd.contains(e.target)) return;
      close();
    });

    // При прокрутке контейнера или появлении экранной клавиатуры не закрываем
    // подсказки, а привязываем их к новому положению поля.
    window.addEventListener(
      'scroll',
      function (e) {
        if (!dd || dd.style.display === 'none') return;
        if (e.target === dd || (e.target && dd.contains(e.target))) return;
        schedulePosition();
      },
      true
    );
    window.addEventListener('resize', schedulePosition);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedulePosition);
      window.visualViewport.addEventListener('scroll', schedulePosition);
    }
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
