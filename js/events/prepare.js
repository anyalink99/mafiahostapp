/**
 * Обработчики экрана выбора режима подготовки (prepare-mode-screen) и кнопок
 * перехода к подготовке host/auto. Соответствующая логика — modes/auto/mode.js
 * (state.prepareConfig, applyHostVariantDeck из game/variants.js).
 */
(function (app) {
  'use strict';

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['prepare-enter'] = function () {
    var I = app._autoInternals;
    I.loadAuto();
    I.loadPrepareConfig();
    I.loadExperimentalModes();
    I.bindRevealHoldGestures();
    I.bindBackGestures();
    I.bindAutoPlayerGestures();
    var mode = app.prepareConfig.mode;
    if (mode === 'auto') {
      var s = app.autoState;
      if (s.active && s.phase !== 'setup' && s.phase !== 'gameover') {
        app.navigateToScreen('auto-setup-screen');
        return;
      }
    } else if (mode === 'host') {
      if (app.hasResettableState && app.hasResettableState()) {
        app.navigateToScreen('prepare-screen');
        return;
      }
    }
    app.navigateToScreen('prepare-mode-screen');
  };

  app.uiActionHandlers['prepare-mode-pick'] = function (el) {
    var mode = el.getAttribute('data-mode');
    if (mode !== 'host' && mode !== 'auto') return;
    app.prepareConfig.mode = mode;
    app._autoInternals.savePrepareConfig();
    app.renderPrepareModeScreen();
  };

  app.uiActionHandlers['prepare-variant-pick'] = function (el) {
    var v = el.getAttribute('data-variant');
    if (app.SUPPORTED_VARIANTS.indexOf(v) === -1) return;
    app.prepareConfig.variant = v;
    app._autoInternals.savePrepareConfig();
    app.renderPrepareModeScreen();
  };

  app.uiActionHandlers['prepare-continue'] = function () {
    if (app.prepareConfig.mode === 'host') {
      app.applyHostVariantDeck();
      app.navigateToScreen('prepare-screen');
    } else {
      app.navigateToScreen('auto-setup-screen');
    }
  };

  app.uiActionHandlers['shuffle-seating'] = function () {
    if (!app.shufflePlayerNicks) return;
    var changed = app.shufflePlayerNicks();
    if (app.showToast) {
      app.showToast(changed ? 'Игроки пересажены случайно' : 'Для пересадки нужно минимум 2 ника');
    }
  };
})(window.MafiaApp);
