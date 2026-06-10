// Общие крошечные хелперы для всех MU-модулей (mu-bridge / mu-autocomplete /
// mu-state-apply / mu-export). Загружается ПЕРВЫМ среди mu-* скриптов в
// index.html, поэтому остальные могут смело пользоваться window.MafiaApp.MuUtils.
//
// Сюда попадают только generic-helpers без зависимостей от состояния app —
// строковые/числовые утилиты и пара DOM-сокращений.

(function (app) {
  'use strict';

  // Безопасный HTML-escape для подстановки строк в innerHTML.
  // Использует тот же набор замен, что и стандартные template-движки.
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Парсит число из произвольного значения. Возвращает fallback (по умолчанию
  // null), если не получилось — удобнее чем NaN-проверки на каждом сайте.
  function parseIntOr(value, fallback) {
    if (value == null || value === '') return fallback == null ? null : fallback;
    var n = parseInt(value, 10);
    return isNaN(n) ? (fallback == null ? null : fallback) : n;
  }

  // Сокращение для document.getElementById — частая операция в наших MU-модулях.
  function byId(id) {
    return document.getElementById(id);
  }

  app.MuUtils = {
    escapeHtml: escapeHtml,
    parseIntOr: parseIntOr,
    byId: byId,
  };
})((window.MafiaApp = window.MafiaApp || {}));
