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

  var URBAN_ROLE_LABELS = {
    mafia: 'Мафия',
    don: 'Дон',
    sheriff: 'Шериф',
    maniac: 'Маньяк',
    doctor: 'Доктор',
    beauty: 'Красотка',
    peaceful: 'Мирные жители',
  };

  function stepper(label, value, action, key, min, max, prominent) {
    var wrap = document.createElement('div');
    wrap.className = prominent ? 'urban-stepper urban-stepper--players' : 'urban-stepper';
    var text = document.createElement('span');
    text.className = 'urban-stepper__label';
    text.textContent = label;
    var controls = document.createElement('div');
    controls.className = 'urban-stepper__controls';
    var minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'urban-stepper__button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', 'Уменьшить: ' + label);
    minus.setAttribute('data-action', action);
    minus.setAttribute('data-delta', '-1');
    if (key) minus.setAttribute('data-role', key);
    minus.disabled = value <= min;
    var number = document.createElement('output');
    number.className = 'urban-stepper__value';
    number.textContent = value;
    number.setAttribute('aria-label', label + ': ' + value);
    var plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'urban-stepper__button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', 'Увеличить: ' + label);
    plus.setAttribute('data-action', action);
    plus.setAttribute('data-delta', '1');
    if (key) plus.setAttribute('data-role', key);
    plus.disabled = value >= max;
    controls.appendChild(minus);
    controls.appendChild(number);
    controls.appendChild(plus);
    wrap.appendChild(text);
    wrap.appendChild(controls);
    return wrap;
  }

  function renderUrbanConfig() {
    var section = el('prepare-urban-section');
    var active = app.prepareConfig.variant === 'urban' && app.prepareConfig.mode === 'host';
    if (section) section.classList.toggle('hidden', !active);
    var continueBtn = document.querySelector('[data-action="prepare-continue"]');
    if (!active || !app.ensureUrbanPrepareConfig) {
      if (continueBtn) {
        continueBtn.disabled = false;
        continueBtn.classList.remove('opacity-40', 'cursor-not-allowed');
      }
      return;
    }
    var cfg = app.ensureUrbanPrepareConfig();
    var countHost = el('prepare-urban-player-count');
    if (countHost) {
      countHost.innerHTML = '';
      countHost.appendChild(
        stepper('Игроков за столом', cfg.playerCount, 'urban-player-count-step', null, 7, 16, true)
      );
    }
    var rolesHost = el('prepare-urban-role-counts');
    if (rolesHost) {
      rolesHost.innerHTML = '';
      (app.URBAN_ROLE_ORDER || []).forEach(function (code) {
        rolesHost.appendChild(
          stepper(
            URBAN_ROLE_LABELS[code] || code,
            cfg.roleCounts[code] || 0,
            'urban-role-count-step',
            code,
            0,
            cfg.playerCount,
            false
          )
        );
      });
    }
    var total = app.urbanRoleTotal();
    var valid = app.urbanConfigIsValid();
    var totalEl = el('prepare-urban-total');
    if (totalEl) {
      totalEl.classList.toggle('is-invalid', !valid);
      totalEl.textContent = valid
        ? 'Состав готов · ' + total + ' из ' + cfg.playerCount
        : 'Распределено ' +
          total +
          ' из ' +
          cfg.playerCount +
          ' · ' +
          (total < cfg.playerCount
            ? 'добавьте ' + (cfg.playerCount - total)
            : 'уберите ' + (total - cfg.playerCount));
    }
    if (continueBtn) {
      continueBtn.disabled = !valid;
      continueBtn.classList.toggle('opacity-40', !valid);
      continueBtn.classList.toggle('cursor-not-allowed', !valid);
    }
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
      } else if (v === 'urban') {
        hint.textContent =
          'Городская: от 7 до 16 игроков. Выберите размер стола и настройте состав ролей перед раздачей.';
      } else {
        hint.textContent = 'Стандартный состав: 10 игроков, 6 мирных, шериф, 2 мафии, дон.';
      }
    }
    renderUrbanConfig();
  };

  app.registerScreenRenderer('prepare-mode-screen', function () {
    app.renderPrepareModeScreen();
  });
})(window.MafiaApp);
