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
    return 'Мирный';
  };
})(window.MafiaApp);
