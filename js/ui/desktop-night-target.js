// На lg+ выбор цели ночного действия раскрывается справа от списка ролей,
// как выбор количества голосов раскрывается справа от панели голосования.
(function (app) {
  'use strict';

  var MODAL_ID = 'modal-urban-night-target';
  var SLOT_ID = 'night-target-slot';

  function isLg() {
    return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  }

  function init() {
    if (!isLg()) return;
    var overlay = document.getElementById(MODAL_ID);
    var slot = document.getElementById(SLOT_ID);
    if (!overlay || !slot) return;
    var panel = overlay.querySelector('.modal-panel');
    if (!panel) return;
    overlay.style.display = 'none';

    app.registerModalInterceptor(MODAL_ID, function (el, open) {
      if (open) {
        if (panel.parentNode !== slot) slot.appendChild(panel);
        requestAnimationFrame(function () {
          slot.classList.add('is-open');
        });
        el.setAttribute('data-open', '');
        el.setAttribute('aria-hidden', 'false');
      } else {
        slot.classList.remove('is-open');
        el.removeAttribute('data-open');
        el.setAttribute('aria-hidden', 'true');
      }
      return true;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})((window.MafiaApp = window.MafiaApp || {}));
