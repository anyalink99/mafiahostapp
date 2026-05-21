(function (app) {
  app.escapeHtml = function (value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
