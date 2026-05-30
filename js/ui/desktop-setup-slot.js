// На lg+ экран «Раздать роли» (setup-screen) превращается в inline-панель
// справа от гармошки игроков на prepare-screen. Юзер не теряет контекст
// (видит игроков), а карточки разворачиваются в боковой панели.
//
// Реализация: при инициализации (только lg+) переносим содержимое
// setup-screen внутрь #setup-slot, который заранее вставлен в раскладку
// prepare-screen. Перехватываем navigateToScreen('setup-screen'):
// остаёмся на prepare-screen, открываем slot, вызываем app.initCards
// (его обычно дёргает screens.js по тому же ID).
//
// На мобилке всё по-прежнему — setup-screen работает как отдельный экран.
(function (app) {
  'use strict';

  var SLOT_ID = 'setup-slot';
  var SCREEN_ID = 'setup-screen';
  var HOST_SCREEN_ID = 'prepare-screen';

  function isLg() {
    return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  }
  function activeScreenId() {
    var el = document.querySelector('.screen.active');
    return el ? el.id : null;
  }
  function getSlot() { return document.getElementById(SLOT_ID); }
  function slotIsOpen() {
    var s = getSlot();
    return !!(s && s.classList.contains('slot-open'));
  }

  // Переносим всё содержимое setup-screen внутрь setup-slot — кроме самой
  // screen-обёртки. Делаем это один раз при загрузке.
  function moveSetupContent() {
    var screen = document.getElementById(SCREEN_ID);
    var slot = getSlot();
    if (!screen || !slot) return false;
    // Перемещаем все child-узлы screen → slot.
    while (screen.firstChild) slot.appendChild(screen.firstChild);
    // Screen теперь пуст — прячем, чтобы случайная навигация туда ничего не показала.
    screen.style.display = 'none';
    return true;
  }

  function openSetupSlot() {
    var slot = getSlot();
    if (!slot) return;
    requestAnimationFrame(function () { slot.classList.add('slot-open'); });
    // Перезапускаем рендер карт (его обычно зовёт screens.js при navigate
    // на setup-screen — но мы туда не переходим, нужно дёрнуть вручную).
    if (app.initCards) app.initCards(app.revealedIndices && app.revealedIndices.length > 0);
  }
  function closeSetupSlot() {
    var slot = getSlot();
    if (slot) slot.classList.remove('slot-open');
  }

  function hookNavigate() {
    var orig = app.navigateToScreen;
    if (!orig || orig.__desktopSetupSlotHooked) return;
    var wrapped = function (screenId) {
      // Желаемый переход на setup-screen → остаёмся на prepare и раскрываем slot.
      if (screenId === SCREEN_ID) {
        if (activeScreenId() !== HOST_SCREEN_ID) {
          orig.call(this, HOST_SCREEN_ID);
        }
        openSetupSlot();
        return;
      }
      // Кнопка «← Подготовка» внутри slot ведёт на prepare-screen. Мы уже там;
      // вместо no-op закрываем slot.
      if (screenId === HOST_SCREEN_ID && activeScreenId() === HOST_SCREEN_ID && slotIsOpen()) {
        closeSetupSlot();
        return;
      }
      // Уходим с prepare-screen куда-то ещё — закрываем slot за собой.
      if (activeScreenId() === HOST_SCREEN_ID && screenId !== HOST_SCREEN_ID && slotIsOpen()) {
        closeSetupSlot();
      }
      return orig.apply(this, arguments);
    };
    wrapped.__desktopSetupSlotHooked = true;
    app.navigateToScreen = wrapped;
  }

  function init() {
    if (!isLg()) return;
    if (!moveSetupContent()) return;
    hookNavigate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})(window.MafiaApp = window.MafiaApp || {});
