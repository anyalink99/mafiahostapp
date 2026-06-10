/**
 * UI экрана «Подготовка → выбор режима» (prepare-mode-screen).
 *
 * Этот файл рендерит только тогглеры. Данные тянутся через:
 *   app.prepareConfig            — { mode: 'host'|'auto', variant: '<key>' }
 *   app.experimentalModesEnabled — bool
 *   app.SUPPORTED_VARIANTS       — список ключей вариантов (game/variants.js)
 *   app.variantConfig(name)      — конфиг варианта (с .label, .hostOnly и т.д.)
 *
 * Обработчики prepare-* живут в events/prepare.js.
 */
(function (app) {
  'use strict';

  function el(id) {
    return document.getElementById(id);
  }

  function availableVariants() {
    if (!app.experimentalModesEnabled) return ['standard'];
    var all = (app.SUPPORTED_VARIANTS || ['standard']).slice();
    // Варианты с hostOnly: true (донская) скрываются в автономном режиме.
    if (app.prepareConfig && app.prepareConfig.mode === 'auto') {
      return all.filter(function (v) {
        var cfg = app.gameVariants && app.gameVariants[v];
        return !cfg || !cfg.hostOnly;
      });
    }
    return all;
  }

  app.renderPrepareModeScreen = function () {
    // Если активный вариант недоступен для выбранного mode — сбрасываем на standard.
    var allowed = availableVariants();
    if (allowed.indexOf(app.prepareConfig.variant) === -1) {
      app.prepareConfig.variant = 'standard';
      if (app._autoInternals && app._autoInternals.savePrepareConfig) {
        app._autoInternals.savePrepareConfig();
      }
    }

    var modeContainer = el('prepare-mode-options');
    if (modeContainer) {
      modeContainer.innerHTML = '';
      var modes = [{ value: 'host', label: 'Обычный ведущий' }];
      // Автономный ведущий — экспериментальный, плюс не показывается на десктопе
      // (даже с включёнными экспериментами): целевой UX там — стол на ведущего,
      // а не «один игрок передаёт телефон по кругу».
      var isLg = window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
      if (app.experimentalModesEnabled && !isLg)
        modes.push({ value: 'auto', label: 'Автономный ведущий' });
      modes.forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-action', 'prepare-mode-pick');
        b.setAttribute('data-mode', m.value);
        b.className =
          'prepare-toggle-btn' +
          (app.prepareConfig.mode === m.value ? ' prepare-toggle-active' : '');
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
      allowed.forEach(function (v) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-action', 'prepare-variant-pick');
        b.setAttribute('data-variant', v);
        b.className =
          'prepare-toggle-btn' + (app.prepareConfig.variant === v ? ' prepare-toggle-active' : '');
        var cfg = app.variantConfig ? app.variantConfig(v) : null;
        b.textContent = (cfg && cfg.label) || v;
        variantContainer.appendChild(b);
      });
    }

    var hint = el('prepare-variant-hint');
    if (hint) {
      var v = app.prepareConfig.variant;
      if (v === 'kasper') {
        hint.textContent =
          'Каспер: 9 игроков, 10-й — фантом. Раздача и ночные ходы только у девяти живых, но «голос» фантома учитывается в голосовании первого дня. Ночью 1 фантом автоматически считается убитым.';
      } else if (v === 'merlin') {
        hint.textContent =
          'Мерлин: 10 игроков. Кроме обычных ролей есть Мерлин — в первую активную ночь он узнаёт тройку чёрных и шерифа. Если выиграли красные, последний повешенный чёрный может попробовать назвать Мерлина.';
      } else if (v === 'donskaya') {
        hint.textContent =
          'Донская: 10 игроков, 1 Дон + 9 «без роли». После раздачи Дон называет двойку мафии, ведущий помечает их в слотах игроков на этом экране. Шериф разыгрывается случайно, остальные — мирные.';
      } else {
        hint.textContent = 'Стандартный состав: 10 игроков, 6 мирных, шериф, 2 мафии, дон.';
      }
    }
  };

  app.registerScreenRenderer('prepare-mode-screen', function () {
    app.renderPrepareModeScreen();
  });
})(window.MafiaApp);
