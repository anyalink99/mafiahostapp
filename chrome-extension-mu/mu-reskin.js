// Runtime-инжектор mu-reskin.css на любую страницу mafiauniverse.org.
// Зачем не declarative `css:` в манифесте — чтобы можно было выключать reskin
// из popup'а без перезагрузки расширения. Состояние хранится в chrome.storage,
// content-script слушает изменения и добавляет/убирает <style>.
//
// FOUC-fix: CSS забандлен в JS-строку (mu-reskin-css.js, генерируется
// build-app.cjs из mu-reskin.css). При document_start инжектим стиль
// СИНХРОННО — без async fetch и без видимой вспышки исходного MU между
// загрузкой страницы и применением темы.
//
// Дефолт: reskin ВКЛЮЧЁН. Чтобы выключить — toggle в popup'е, или вручную:
// chrome.storage.local.set({ reskinEnabled: false }).
(function () {
  'use strict';

  var STYLE_ID = 'mh-reskin-style';
  var CSS = (typeof window !== 'undefined' && window.MU_RESKIN_CSS) || '';

  function injectStyle() {
    if (!CSS) return;
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  function removeStyle() {
    var el = document.getElementById(STYLE_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function apply(enabled) {
    if (enabled) injectStyle();
    else removeStyle();
  }

  // КРИТИЧЕСКИ ВАЖНО: инжектим СИНХРОННО до любого async-кода. Иначе между
  // document_start и async-callback виден исходный MU стиль.
  // Если в storage стоит OFF — снимем позже, в .then().
  injectStyle();

  // Async-проверка: если выключено, убираем. Краткая «вспышка» при OFF
  // допустима (редкое состояние).
  try {
    chrome.storage.local.get(['reskinEnabled'], function (items) {
      if (items && items.reskinEnabled === false) removeStyle();
    });
  } catch (e) {}

  // Toggle из popup'а — без перезагрузки страницы.
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (!changes || !('reskinEnabled' in changes)) return;
      apply(changes.reskinEnabled.newValue !== false);
    });
  } catch (e) {}
})();
