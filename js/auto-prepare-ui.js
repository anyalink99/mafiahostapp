/**
 * UI for the "Подготовка → выбор режима" screen.
 *
 * This file owns rendering of `prepare-mode-screen` only. The data layer
 * (VARIANTS, app.prepareConfig, app.experimentalModesEnabled, persistence)
 * lives in auto-mode.js and is reached through these app.* contracts:
 *
 *   app.prepareConfig            — { mode: 'host'|'auto', variant: 'standard'|'kasper'|'merlin' }
 *   app.experimentalModesEnabled — bool
 *   app.SUPPORTED_VARIANTS       — array of variant keys
 *   app.variantConfig(name)      — variant definition object (with .label etc.)
 *
 * Action handlers for prepare-mode-pick / prepare-variant-pick / prepare-continue
 * remain in auto-mode.js (they mutate state which is co-located there).
 */
(function (app) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function availableVariants() {
    var all = (app.SUPPORTED_VARIANTS || ['standard']).slice();
    return app.experimentalModesEnabled ? all : ['standard'];
  }

  app.renderPrepareModeScreen = function () {
    var modeContainer = el('prepare-mode-options');
    if (modeContainer) {
      modeContainer.innerHTML = '';
      var modes = [
        { value: 'host', label: 'Обычный ведущий' },
        { value: 'auto', label: 'Автономный ведущий' }
      ];
      modes.forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-action', 'prepare-mode-pick');
        b.setAttribute('data-mode', m.value);
        b.className = 'prepare-toggle-btn' + (app.prepareConfig.mode === m.value ? ' prepare-toggle-active' : '');
        b.textContent = m.label;
        modeContainer.appendChild(b);
      });
    }

    var variantSection = el('prepare-variant-section');
    var showVariants = !!app.experimentalModesEnabled;
    if (variantSection) variantSection.classList.toggle('hidden', !showVariants);
    if (!showVariants) return;

    var variantContainer = el('prepare-variant-options');
    if (variantContainer) {
      variantContainer.innerHTML = '';
      availableVariants().forEach(function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-action', 'prepare-variant-pick');
        b.setAttribute('data-variant', v);
        b.className = 'prepare-toggle-btn' + (app.prepareConfig.variant === v ? ' prepare-toggle-active' : '');
        var cfg = app.variantConfig ? app.variantConfig(v) : null;
        b.textContent = (cfg && cfg.label) || v;
        variantContainer.appendChild(b);
      });
    }

    var hint = el('prepare-variant-hint');
    if (hint) {
      var v = app.prepareConfig.variant;
      if (v === 'kasper') {
        hint.textContent = 'Каспер: 10 игроков. 10-й всегда мирный и автоматически «убивается» в первую активную ночь. День 1 проходит с обычным голосованием — возможны равные раздачи.';
      } else if (v === 'merlin') {
        hint.textContent = 'Мерлин: 10 игроков. Кроме обычных ролей есть Мерлин — в первую активную ночь он узнаёт тройку чёрных и шерифа. Если выиграли красные, последний повешенный чёрный может попробовать назвать Мерлина.';
      } else {
        hint.textContent = 'Стандартный состав: 10 игроков, 6 мирных, шериф, 2 мафии, дон.';
      }
    }
  };
})(window.MafiaApp);
