// На lg+ модалка выбора количества голосов (modal-vote-count) превращается
// в inline-панель справа от game-vote-slot (#vote-count-slot). Открывается
// когда ведущий тыкает в кандидата в режиме голосования; закрывается на
// выбор числа (applyVoteCountPick → hideVoteCountModal) или Cancel.
//
// Логика автосейва не нужна — модалка простая (заголовок + grid цифр).
(function (app) {
  'use strict';

  var MODAL_ID = 'modal-vote-count';
  var SLOT_ID = 'vote-count-slot';

  function isLg() {
    return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  }
  function slot() { return document.getElementById(SLOT_ID); }

  function animateBodyToContent(s, body) {
    var inner = body.firstElementChild || body;
    var target = inner.scrollHeight;
    body.style.maxHeight = target + 'px';
  }

  function init() {
    if (!isLg()) return;
    var overlay = document.getElementById(MODAL_ID);
    var s = slot();
    if (!overlay || !s) return;
    var panel = overlay.querySelector('.modal-panel');
    if (!panel) return;

    // Прячем overlay (backdrop) — он не нужен в inline-режиме.
    overlay.style.display = 'none';

    var origSetOpen = app.modalSetOpen;
    if (!origSetOpen || origSetOpen.__desktopVoteCountHooked) return;

    var wrapped = function (el, open) {
      if (el && el.id === MODAL_ID) {
        if (open) {
          if (panel.parentNode !== s) s.appendChild(panel);
          requestAnimationFrame(function () { s.classList.add('is-open'); });
          el.setAttribute('data-open', '');
          el.setAttribute('aria-hidden', 'false');
        } else {
          s.classList.remove('is-open');
          el.removeAttribute('data-open');
          el.setAttribute('aria-hidden', 'true');
        }
        return;
      }
      return origSetOpen.apply(this, arguments);
    };
    wrapped.__desktopVoteCountHooked = true;
    app.modalSetOpen = wrapped;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})(window.MafiaApp = window.MafiaApp || {});
