/**
 * Host-mode tools modal (game-screen → гаечный ключ).
 *
 * Contents depend on prepareConfig.variant:
 *   • standard / kasper / merlin / donskaya — кнопка «Назвать роли» (раскладка ролей по местам).
 *   • kasper                                — добавляется «Рандомная проверка шерифа» (1–9, кроме шерифа).
 *
 * Назначение мафии в донской живёт не здесь, а на prepare-screen: ведущий открывает
 * слот игрока, выбирает «Мафия» в модалке player-actions; после второй пометки
 * game/donskaya.js#donskayaReconcile фиксирует расклад в app.roles.
 *
 * Reads:
 *   app.roles                 — расклад колоды.
 *   app.revealedIndices       — порядок, в котором карты были перевёрнуты на seat j (j → roles[revealedIndices[j]]).
 *   app.prepareConfig.variant — текущий вариант.
 */
(function (app) {
  'use strict';

  function el(id) {
    return document.getElementById(id);
  }

  function modal() {
    return el('modal-host-tools');
  }

  function getDealtRoles() {
    var out = [];
    if (!app.revealedIndices) return out;
    for (var j = 0; j < app.revealedIndices.length; j++) {
      var ri = app.revealedIndices[j];
      if (ri == null || !app.roles || !app.roles[ri]) continue;
      out.push({ seatId: j + 1, role: app.roles[ri] });
    }
    return out;
  }

  function isMafiaRole(r) {
    return r === 'Мафия' || r === 'Дон';
  }

  app.showHostToolsModal = function () {
    var m = modal();
    if (!m) return;
    var variant = (app.prepareConfig && app.prepareConfig.variant) || 'standard';
    var sheriffSection = el('host-tools-sheriff-section');
    if (sheriffSection) {
      sheriffSection.classList.toggle('hidden', variant !== 'kasper');
    }
    var rolesResult = el('host-tools-roles-result');
    if (rolesResult) {
      rolesResult.classList.add('hidden');
      rolesResult.innerHTML = '';
    }
    var sheriffResult = el('host-tools-sheriff-result');
    if (sheriffResult) {
      sheriffResult.classList.add('hidden');
      sheriffResult.innerHTML = '';
    }
    if (app.modalSetOpen) app.modalSetOpen(m, true);
  };

  app.hideHostToolsModal = function () {
    var m = modal();
    if (m && app.modalSetOpen) app.modalSetOpen(m, false);
  };

  app.toolsRevealRoles = function () {
    var resultEl = el('host-tools-roles-result');
    if (!resultEl) return;
    resultEl.classList.remove('hidden');
    var dealt = getDealtRoles();
    if (!dealt.length) {
      resultEl.innerHTML =
        '<p class="text-mafia-cream/70 text-center">Сначала разложите карты на экране подготовки.</p>';
      return;
    }
    var BLANK = app.DONSKAYA_BLANK_ROLE || 'Без роли';
    var groups = { Дон: [], Мафия: [], Шериф: [], Мерлин: [], Мирный: [] };
    groups[BLANK] = [];
    dealt.forEach(function (d) {
      if (groups[d.role]) groups[d.role].push(d.seatId);
    });
    var order = ['Дон', 'Мафия', 'Шериф', 'Мерлин', 'Мирный', BLANK];
    var html = '';
    for (var i = 0; i < order.length; i++) {
      var name = order[i];
      var ids = groups[name];
      if (!ids.length) continue;
      ids.sort(function (a, b) {
        return a - b;
      });
      var color = name === 'Мафия' || name === 'Дон' ? 'text-mafia-blood' : 'text-mafia-gold';
      var label = '<span class="font-display font-bold ' + color + '">' + name + ':</span>';
      var nums = ids
        .map(function (id) {
          return '№' + id;
        })
        .join(', ');
      html +=
        '<p class="flex items-baseline gap-2">' +
        label +
        ' <span class="tabular-nums">' +
        nums +
        '</span></p>';
    }
    resultEl.innerHTML = html;
  };

  app.toolsKasperSheriffRandom = function () {
    var resultEl = el('host-tools-sheriff-result');
    if (!resultEl) return;
    resultEl.classList.remove('hidden');
    var dealt = getDealtRoles();
    var sheriffSeat = null;
    var bySeatRole = {};
    for (var i = 0; i < dealt.length; i++) {
      bySeatRole[dealt[i].seatId] = dealt[i].role;
      if (dealt[i].role === 'Шериф' && !sheriffSeat) sheriffSeat = dealt[i].seatId;
    }
    if (!sheriffSeat) {
      resultEl.innerHTML =
        '<span class="text-mafia-cream/70">Шериф не определён — сначала разложите карты.</span>';
      return;
    }
    var pool = [];
    for (var seatId = 1; seatId <= 9; seatId++) {
      if (seatId !== sheriffSeat) pool.push(seatId);
    }
    if (!pool.length) {
      resultEl.innerHTML = '<span class="text-mafia-cream/70">Нет доступных целей.</span>';
      return;
    }
    var picked = pool[Math.floor(Math.random() * pool.length)];
    var role = bySeatRole[picked];
    var isMafia = isMafiaRole(role);
    resultEl.innerHTML =
      '<div class="font-display font-bold text-mafia-gold tabular-nums text-3xl">№' +
      picked +
      '</div>' +
      '<div class="mt-1">' +
      (isMafia
        ? '<span class="text-mafia-gold font-semibold">мафия</span>'
        : '<span class="text-mafia-cream/85">не мафия</span>') +
      '</div>';
  };

  // UI-обработчики живут в events/host/tools.js.
})(window.MafiaApp);
