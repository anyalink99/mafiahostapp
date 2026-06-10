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
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'className') el.className = v;
        else if (k === 'disabled' || k === 'checked' || k === 'value') el[k] = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    appendHChildren(el, children);
    return el;
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
    return 'Мирный';
  };

  /** Полные подписи ролей (для radio-пикеров подготовки и итогов). */
  app.ROLE_LABELS_FULL = {
    peaceful: 'Мирный житель',
    mafia: 'Мафия',
    don: 'Дон',
    sheriff: 'Шериф',
    merlin: 'Мерлин',
  };

  /** Иконки ролей в UI подготовки/итогов (мирный — «лайк», не «голубь»). */
  app.UI_ROLE_ICONS = {
    don: 'icon-don',
    sheriff: 'icon-sheriff',
    mafia: 'icon-mafia',
    peaceful: 'icon-like',
    merlin: 'icon-merlin',
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
