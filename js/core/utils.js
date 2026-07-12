(function (app) {
  // Минимальная событийная шина: модули объявляют «что произошло»
  // (app.emit в обработчике события UI), слушатели (например, десктоп-панель
  // игрока) реагируют — без подглядывания за чужими кликами через
  // capture-слушатели и setTimeout(0).
  app._appEventListeners = {};
  app.on = function (event, fn) {
    (app._appEventListeners[event] = app._appEventListeners[event] || []).push(fn);
  };
  app.emit = function (event, payload) {
    var list = app._appEventListeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (e) {}
    }
  };

  app.escapeHtml = function (value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  function appendHChildren(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      for (var i = 0; i < child.length; i++) appendHChildren(el, child[i]);
      return;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      // Текст — только как текстовый узел: экранирование по построению,
      // в отличие от innerHTML-конкатенации его невозможно забыть.
      el.appendChild(document.createTextNode(String(child)));
      return;
    }
    el.appendChild(child);
  }

  // SVG-теги создаются через createElementNS (createElement даёт HTMLUnknownElement,
  // который не рендерится); class на SVG ставится только атрибутом.
  var H_SVG_TAGS = { svg: 1, use: 1, path: 1, circle: 1, g: 1, line: 1, ellipse: 1, rect: 1 };

  /**
   * Маленький DOM-билдер для рендереров — замена innerHTML-конкатенации.
   *   app.h('button', { className: '…', 'data-action': 'x', disabled: true }, [
   *     app.h('span', null, 'текст'), '…'
   *   ])
   * attrs: className — свойство; disabled/checked/value — свойства;
   * true → булев атрибут; null/undefined/false — пропуск; остальное — атрибут.
   * children: строка/число (текстовый узел), Node, массив (включая вложенные).
   */
  app.h = function (tag, attrs, children) {
    var isSvg = H_SVG_TAGS[tag] === 1;
    var el = isSvg
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'className') {
          if (isSvg) el.setAttribute('class', v);
          else el.className = v;
        } else if (!isSvg && (k === 'disabled' || k === 'checked' || k === 'value')) el[k] = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    appendHChildren(el, children);
    return el;
  };

  /** Иконка-ссылка на символ SVG-спрайта: <svg class><use href="#id"/></svg>. */
  app.svgIcon = function (iconId, className) {
    return app.h('svg', { className: className || '', 'aria-hidden': 'true' }, [
      app.h('use', { href: '#' + iconId }),
    ]);
  };

  /**
   * Круглый бейдж статуса в слоте игрока: причина выбытия / «выставлен» /
   * невидимый плейсхолдер (для выравнивания). Общий для стола хост-режима
   * и дня автономного режима.
   */
  app.playerStatusBadge = function (eliminationReason, nominated) {
    if (eliminationReason) {
      return app.h(
        'div',
        {
          className:
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-blood/50 bg-mafia-blood/10 text-mafia-blood',
          'aria-hidden': 'true',
        },
        app.svgIcon('icon-elim-' + eliminationReason, 'pointer-events-none h-[18px] w-[18px]')
      );
    }
    if (nominated) {
      return app.h(
        'div',
        {
          className:
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-gold/70 bg-mafia-blood/15 text-mafia-gold',
          title: 'Выставлен',
          'aria-label': 'Выставлен',
        },
        app.svgIcon('icon-nominated', 'pointer-events-none h-[18px] w-[18px]')
      );
    }
    return app.h('div', {
      className:
        'invisible flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-transparent',
      'aria-hidden': 'true',
    });
  };

  app.parseBonusFloat = function (raw) {
    if (raw === undefined || raw === null || raw === '') return 0;
    var parsed = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 10) / 10;
  };

  app.roleLabelRu = function (roleCode) {
    if (roleCode === 'don') return 'Дон';
    if (roleCode === 'sheriff') return 'Шериф';
    if (roleCode === 'mafia') return 'Мафия';
    if (roleCode === 'merlin') return 'Мерлин';
    if (roleCode === 'maniac') return 'Маньяк';
    if (roleCode === 'doctor') return 'Доктор';
    if (roleCode === 'beauty') return 'Красотка';
    return 'Мирный';
  };

  /** Полные подписи ролей (для radio-пикеров подготовки и итогов). */
  app.ROLE_LABELS_FULL = {
    peaceful: 'Мирный житель',
    mafia: 'Мафия',
    don: 'Дон',
    sheriff: 'Шериф',
    merlin: 'Мерлин',
    maniac: 'Маньяк',
    doctor: 'Доктор',
    beauty: 'Красотка',
  };

  /** Иконки ролей в UI подготовки/итогов (мирный — «лайк», не «голубь»). */
  app.UI_ROLE_ICONS = {
    don: 'icon-don',
    sheriff: 'icon-sheriff',
    mafia: 'icon-mafia',
    peaceful: 'icon-like',
    merlin: 'icon-merlin',
    maniac: 'icon-maniac',
    doctor: 'icon-doctor',
    beauty: 'icon-beauty',
  };

  /** Меняет размер host-стола, сохраняя данные существующих мест. */
  app.resizeHostPlayers = function (playerCount) {
    var n = Math.max(7, Math.min(16, parseInt(playerCount, 10) || 10));
    var old = Array.isArray(app.players) ? app.players : [];
    var next = [];
    for (var i = 0; i < n; i++) {
      next.push(old[i] || { id: i + 1, fouls: 0, eliminationReason: null, nick: '' });
      next[i].id = i + 1;
    }
    app.players = next;
    app.nomineeQueue = (app.nomineeQueue || []).filter(function (id) {
      return id <= n;
    });
    var stores = [
      'playerRoleOverrides',
      'bonusPointsByPlayerId',
      'summaryRoleByPlayerId',
      'bonusNoteByPlayerId',
      'bestMoveByPlayerId',
      'protocolByPlayerId',
      'opinionByPlayerId',
    ];
    for (var si = 0; si < stores.length; si++) {
      var store = app[stores[si]];
      if (!store || typeof store !== 'object') continue;
      Object.keys(store).forEach(function (key) {
        var id = parseInt(key, 10);
        if (!isNaN(id) && id > n) delete store[key];
      });
    }
  };

  /** Динамическая двухколоночная раскладка: до 8 строк для 16 игроков. */
  app.applyPlayerGridLayout = function (list, playerCount) {
    if (!list) return;
    var rows = Math.ceil(Math.max(1, playerCount) / 2);
    list.className =
      'player-grid grid grid-flow-col grid-cols-2 gap-1.5 sm:gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
  };

  /** Подписи причин выбытия — общие для хост- и авторежима. */
  app.ELIM_REASON_TITLES = {
    disqual: 'Удалён',
    hang: 'Казнён',
    shot: 'Убит',
  };

  app.arraysEqual = function (a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  /**
   * Порядок индексов для 2-колоночной grid-flow-col раскладки игроков:
   * левая колонка — № по убыванию, правая — по возрастанию
   * (10 игроков → 5…1 | 6…10).
   */
  app.playerSeatIndicesForTwoColumnDisplay = function (playerCount) {
    var n = playerCount;
    if (n <= 0) return [];
    var left = Math.ceil(n / 2);
    var out = [];
    for (var i = left - 1; i >= 0; i--) out.push(i);
    for (var j = left; j < n; j++) out.push(j);
    return out;
  };

  /**
   * Нормализует ввод списка номеров: оставляет только цифры, любые разделители
   * (пробел/запятая/точка с запятой) превращает в «, ». Используется для полей
   * лучшего хода, протокола и мнения — пробел автоматически ставит запятую.
   */
  app.normalizeNumberListText = function (raw) {
    if (raw === undefined || raw === null) return '';
    var parts = String(raw)
      .split(/[^0-9]+/)
      .filter(function (x) {
        return x !== '';
      });
    return parts.join(', ');
  };

  /** Читает группу «шериф/мафия/мирный» из стора по id игрока (всегда строки). */
  app.getPlayerNumGroup = function (store, playerId) {
    var obj = store && typeof store === 'object' ? store[String(playerId)] : null;
    return {
      sheriff: obj && obj.sheriff != null ? String(obj.sheriff) : '',
      mafia: obj && obj.mafia != null ? String(obj.mafia) : '',
      peaceful: obj && obj.peaceful != null ? String(obj.peaceful) : '',
    };
  };

  /** Пишет нормализованную группу в стор; полностью пустую запись удаляет. */
  app.setPlayerNumGroup = function (store, playerId, vals) {
    if (!store || typeof store !== 'object') return;
    var key = String(playerId);
    var s = app.normalizeNumberListText(vals && vals.sheriff);
    var m = app.normalizeNumberListText(vals && vals.mafia);
    var g = app.normalizeNumberListText(vals && vals.peaceful);
    if (!s && !m && !g) {
      delete store[key];
      return;
    }
    store[key] = { sheriff: s, mafia: m, peaceful: g };
  };
})(window.MafiaApp);
