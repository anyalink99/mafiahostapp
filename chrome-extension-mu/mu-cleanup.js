// DOM-патчер для типичных UX-косяков MU, которые нельзя починить только CSS.
// Запускается на каждой странице mafiauniverse.org.
//
// Текущее исправление:
//   Шапка профилей (Player / Club / Tournament / SerieOfTournament): MU кладёт
//   sub-nav (nav#playerNavigation и пр.) ВНУТРИ контента, после аватара и H4.
//   В итоге между главным navbar'ом и профильным subnav'ом — большой блок
//   аватарки и заголовок. Логичнее, чтобы навигации шли подряд: main → sub →
//   контент. Перемещаем sub-nav в начало .mu-ui-content (физически прямо
//   под главным navbar'ом, т.к. он fixed-position).
//
// Уважает toggle reskin (chrome.storage.local.reskinEnabled): если выключен,
// перенос откатывается через сохранённую закладку (Comment node).

(function () {
  'use strict';

  var SUBNAV_SELECTOR = 'nav[id$="Navigation"]';
  // Маркер исходной позиции — оставляем Comment-узел, чтобы можно было
  // вернуть sub-nav на место при отключении reskin.
  var MARKER_TEXT = 'mh-subnav-original-position';

  function findSubNav() {
    return document.querySelector(SUBNAV_SELECTOR);
  }
  function findMarker() {
    if (!document.body) return null;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue === MARKER_TEXT) return node;
    }
    return null;
  }

  function moveSubNavUp() {
    var sub = findSubNav();
    if (!sub) return;
    var content = document.querySelector('.mu-ui-content');
    if (!content) return;
    if (sub.dataset.muMoved === '1') return;
    // Ставим маркер на исходную позицию.
    var marker = document.createComment(MARKER_TEXT);
    if (sub.parentNode) sub.parentNode.insertBefore(marker, sub);
    // Перемещаем sub-nav в начало .mu-ui-content (сразу после fixed-header).
    content.insertBefore(sub, content.firstChild);
    sub.dataset.muMoved = '1';
  }

  function restoreSubNav() {
    var sub = findSubNav();
    if (!sub || sub.dataset.muMoved !== '1') return;
    var marker = findMarker();
    if (!marker || !marker.parentNode) return;
    marker.parentNode.insertBefore(sub, marker);
    marker.parentNode.removeChild(marker);
    delete sub.dataset.muMoved;
  }

  function readFlag(cb) {
    try {
      chrome.storage.local.get(['reskinEnabled'], function (items) {
        cb(items && items.reskinEnabled === false ? false : true);
      });
    } catch (e) {
      cb(true);
    }
  }

  function apply(enabled) {
    if (enabled) moveSubNavUp();
    else restoreSubNav();
  }

  function run() {
    readFlag(apply);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes || !('reskinEnabled' in changes)) return;
      apply(changes.reskinEnabled.newValue !== false);
    });
  } catch (e) {}
})();
