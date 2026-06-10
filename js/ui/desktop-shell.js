// На lg+ выносим timer-panel-wrap (с навигацией экранов внутри) в глобальный
// fixed-контейнер сверху страницы. После этого панель таймера остаётся видимой
// на всех экранах, а .screen начинают свой top: ниже неё.
// Также: при первом запуске на lg+ открываем игровой стол (не меню).
//
// Бордер mobile↔desktop: extraction делается один раз при загрузке. Если юзер
// поменяет ширину окна, потребуется F5. Это десктоп-редизайн, мобильный UX не
// трогаем сознательно.
(function (app) {
  'use strict';

  function isLg() {
    return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  }

  function activeScreenId() {
    var el = document.querySelector('.screen.active');
    return el ? el.id : null;
  }

  // Кнопка «Подготовка» использует data-action="prepare-enter" (а не data-goto),
  // чтобы пройти через handler — он умеет роутить в prepare-mode-screen при
  // включённых экспериментах. Для highlighting помечаем её активной также на
  // промежуточных prepare-/setup-экранах.
  var PREPARE_RELATED_SCREENS = {
    'prepare-screen': 1,
    'prepare-mode-screen': 1,
    'setup-screen': 1,
  };

  function syncNavActive() {
    var active = activeScreenId();
    var btns = document.querySelectorAll('.screen-nav-vert__btn');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var matches = false;
      var goto = btn.getAttribute('data-goto');
      if (goto && goto === active) matches = true;
      var action = btn.getAttribute('data-action');
      if (action === 'prepare-enter' && PREPARE_RELATED_SCREENS[active]) matches = true;
      btn.classList.toggle('is-active', matches);
    }
  }

  function hookNavigate() {
    var orig = app.navigateToScreen;
    if (!orig || orig.__desktopShellHooked) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try {
        syncNavActive();
      } catch (e) {}
      return r;
    };
    wrapped.__desktopShellHooked = true;
    app.navigateToScreen = wrapped;
  }

  function moveTimerToGlobal() {
    var wrap = document.getElementById('timer-panel-wrap');
    if (!wrap) return false;
    var host = document.getElementById('timer-panel-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'timer-panel-host';
      document.body.appendChild(host);
    }
    if (wrap.parentNode !== host) host.appendChild(wrap);
    document.body.classList.add('has-global-timer');
    // Замер высоты, чтобы CSS-переменная сдвигала screen ровно настолько,
    // насколько занимает таймер (плюс небольшой отступ).
    var setVar = function () {
      var h = host.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--global-timer-h', Math.ceil(h) + 16 + 'px');
    };
    requestAnimationFrame(setVar);
    if (window.ResizeObserver) {
      try {
        new ResizeObserver(setVar).observe(host);
      } catch (e) {}
    }
    return true;
  }

  function init() {
    hookNavigate();
    if (isLg()) {
      moveTimerToGlobal();
      if (activeScreenId() === 'menu-screen' && app.navigateToScreen) {
        app.navigateToScreen('game-screen');
      }
    }
    syncNavActive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})((window.MafiaApp = window.MafiaApp || {}));
