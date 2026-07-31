/**
 * Автономный режим — раздача ролей (auto-reveal-screen).
 *
 * Каждый игрок выбирает карту из уменьшающейся закрытой колоды. Выбранная
 * роль присваивается месту атомарно, показывается ровно три секунды, затем
 * очищается из DOM и устройство можно передать следующему игроку.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;

  function isRole(role) {
    return typeof role === 'string' && Object.prototype.hasOwnProperty.call(A.ROLE_NAMES, role);
  }

  function nextRealSeatId(state, from) {
    var id = Math.max(1, parseInt(from, 10) || 1);
    while (id <= A.playerCount() && A.isPhantomSeat(state.seats[id - 1])) id++;
    return id;
  }

  /**
   * Приводит сохранённую раздачу к v2. Старый формат содержал роли сразу
   * во всех seats; при миграции уже просмотренные места сохраняются, а роли
   * текущего и следующих игроков возвращаются в закрытую колоду.
   */
  function normalizeRevealState(state) {
    if (!state || state.phase !== 'reveal') return false;

    var old = state.reveal && typeof state.reveal === 'object' ? state.reveal : {};
    var cursor = nextRealSeatId(state, old.cursor);
    var changed = false;

    if (old.version !== 2 || !Array.isArray(old.remainingRoles)) {
      var legacyRoles = [];
      for (var i = cursor; i <= A.playerCount(); i++) {
        var legacySeat = state.seats[i - 1];
        if (!legacySeat || A.isPhantomSeat(legacySeat)) continue;
        if (isRole(legacySeat.role)) {
          legacyRoles.push(legacySeat.role);
          legacySeat.role = null;
        }
      }
      state.reveal = {
        version: 2,
        cursor: cursor,
        stage: 'pick',
        remainingRoles: legacyRoles,
        selectedRole: null,
        showUntil: 0,
      };
      return true;
    }

    if (old.cursor !== cursor) {
      old.cursor = cursor;
      changed = true;
    }

    var filtered = old.remainingRoles.filter(isRole);
    if (filtered.length !== old.remainingRoles.length) {
      old.remainingRoles = filtered;
      changed = true;
    }

    if (old.stage !== 'pick' && old.stage !== 'showing' && old.stage !== 'pass') {
      old.stage = 'pick';
      changed = true;
    }

    var currentSeat = state.seats[cursor - 1];
    if (old.stage === 'showing') {
      if (!isRole(old.selectedRole) && currentSeat && isRole(currentSeat.role)) {
        old.selectedRole = currentSeat.role;
        changed = true;
      }
      if (!isRole(old.selectedRole)) {
        old.stage = currentSeat && isRole(currentSeat.role) ? 'pass' : 'pick';
        old.selectedRole = null;
        old.showUntil = 0;
        changed = true;
      } else if (currentSeat && !isRole(currentSeat.role)) {
        currentSeat.role = old.selectedRole;
        changed = true;
      }
    } else {
      if (old.selectedRole !== null) {
        old.selectedRole = null;
        changed = true;
      }
      if (old.showUntil !== 0) {
        old.showUntil = 0;
        changed = true;
      }
      if (old.stage === 'pass' && (!currentSeat || !isRole(currentSeat.role))) {
        old.stage = 'pick';
        changed = true;
      }
    }

    if (typeof old.showUntil !== 'number' || !isFinite(old.showUntil)) {
      old.showUntil = 0;
      changed = true;
    }
    old.version = 2;
    return changed;
  }
  A.normalizeRevealState = normalizeRevealState;

  function clearRevealTimers() {
    var ephemeral = app._autoEphemeral;
    if (app.clockApi) app.clockApi.stop('auto-reveal');
    if (ephemeral.revealInterval) {
      if (!app.clockApi) clearInterval(ephemeral.revealInterval);
      ephemeral.revealInterval = null;
    }
    if (ephemeral.revealTimeout) {
      if (!app.clockApi) clearTimeout(ephemeral.revealTimeout);
      ephemeral.revealTimeout = null;
    }
  }

  function hideRevealOverlay() {
    clearRevealTimers();
    var overlay = el('auto-reveal-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.classList.remove('is-open');
    }

    // Роль не должна оставаться даже в скрытом DOM после передачи устройства.
    var bg = el('auto-reveal-overlay-bg');
    if (bg) bg.className = 'absolute inset-0';
    var iconWrap = el('auto-reveal-overlay-icon');
    if (iconWrap) iconWrap.replaceChildren();
    var nameEl = el('auto-reveal-overlay-name');
    if (nameEl) nameEl.textContent = '';
    var countdown = el('auto-reveal-overlay-countdown');
    if (countdown) countdown.textContent = '';
  }
  A.hideRevealOverlay = hideRevealOverlay;

  function updateRevealCountdown() {
    var state = app.autoState;
    if (!state || state.phase !== 'reveal' || state.reveal.stage !== 'showing') return;
    var left = Math.max(0, state.reveal.showUntil - Date.now());
    var countdown = el('auto-reveal-overlay-countdown');
    if (countdown) countdown.textContent = String(Math.max(1, Math.ceil(left / 1000)));
  }

  function finishRevealDisplay() {
    var state = app.autoState;
    if (!state || state.phase !== 'reveal' || state.reveal.stage !== 'showing') {
      hideRevealOverlay();
      return;
    }
    state.reveal.stage = 'pass';
    state.reveal.selectedRole = null;
    state.reveal.showUntil = 0;
    A.saveAuto();
    hideRevealOverlay();
    app.renderAutoReveal();
  }

  function showRevealOverlay(role) {
    var overlay = el('auto-reveal-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('is-open');

    var bg = el('auto-reveal-overlay-bg');
    if (bg) {
      bg.className =
        'absolute inset-0 ' + (A.isMafiaSide(role) ? 'bg-mafia-black' : 'bg-mafia-blood');
    }
    var iconWrap = el('auto-reveal-overlay-icon');
    if (iconWrap) {
      iconWrap.replaceChildren();
      iconWrap.appendChild(A.roleIconEl(role, 'role-icon--large'));
    }
    var nameEl = el('auto-reveal-overlay-name');
    if (nameEl) nameEl.textContent = A.ROLE_NAMES[role] || role;

    updateRevealCountdown();
    clearRevealTimers();
    updateRevealCountdown();

    var remainingMs = Math.max(0, app.autoState.reveal.showUntil - Date.now());
    if (app.clockApi) {
      app._autoEphemeral.revealInterval = 'clock-api';
      app._autoEphemeral.revealTimeout = 'clock-api';
      app.clockApi.startCountdown('auto-reveal', remainingMs, {
        tickMs: 100,
        onTick: updateRevealCountdown,
        onDone: finishRevealDisplay,
      });
    } else {
      app._autoEphemeral.revealInterval = setInterval(updateRevealCountdown, 100);
      app._autoEphemeral.revealTimeout = setTimeout(finishRevealDisplay, remainingMs);
    }
  }

  function sizeClosedCards(container) {
    var layout = container && container._autoCardLayout;
    if (!layout || !container.clientWidth || !container.clientHeight) return;
    var style = window.getComputedStyle(container);
    var columnGap = parseFloat(style.columnGap) || 0;
    var rowGap = parseFloat(style.rowGap) || 0;
    var cellWidth =
      (container.clientWidth - columnGap * Math.max(0, layout.columns - 1)) / layout.columns;
    var cellHeight = (container.clientHeight - rowGap * Math.max(0, layout.rows - 1)) / layout.rows;
    var cardWidth = Math.max(0, Math.min(cellWidth, (cellHeight * 5) / 7));
    var cardHeight = (cardWidth * 7) / 5;
    container.style.setProperty('--auto-reveal-card-width', cardWidth + 'px');
    container.style.setProperty('--auto-reveal-card-height', cardHeight + 'px');
  }

  function bindClosedCardResize(container) {
    if (container._autoCardResizeBound) return;
    container._autoCardResizeBound = true;
    if (window.ResizeObserver) {
      container._autoCardResizeObserver = new ResizeObserver(function () {
        sizeClosedCards(container);
      });
      container._autoCardResizeObserver.observe(container);
    } else {
      window.addEventListener('resize', function () {
        sizeClosedCards(container);
      });
    }
  }

  function renderClosedCards(roles) {
    var container = el('auto-reveal-cards');
    if (!container) return;
    container.replaceChildren();
    container.classList.remove('hidden');

    var count = roles.length;
    var columns = count > 10 ? 4 : 3;
    var rows = Math.max(1, Math.ceil(count / columns));
    container._autoCardLayout = { columns: columns, rows: rows };
    container.style.setProperty('--card-cols', String(columns));
    container.style.setProperty('--card-rows', String(rows));

    for (var i = 0; i < count; i++) {
      var card = app.h(
        'button',
        {
          type: 'button',
          className:
            'auto-reveal-card flex flex-col items-center justify-center rounded border border-mafia-gold/50 bg-mafia-coal text-mafia-gold cursor-pointer hover:border-mafia-gold',
          'data-action': 'auto-reveal-card',
          'data-card-index': String(i),
          'aria-label': 'Закрытая карта ' + (i + 1),
        },
        [
          app.h(
            'span',
            { className: 'text-mafia-gold/50 font-display text-3xl sm:text-4xl font-semibold' },
            String(i + 1)
          ),
          app.h(
            'span',
            { className: 'text-mafia-gold/30 font-display text-6xl sm:text-7xl leading-none' },
            '♠'
          ),
        ]
      );
      var inner = app.h('div', { className: 'card-inner' }, card);
      var wrap = app.h('div', { className: 'card-wrap' }, inner);
      container.appendChild(wrap);
    }

    var remainder = count % columns;
    if (remainder === 1 && container.lastElementChild) {
      container.lastElementChild.style.gridColumn = '2';
    } else if (remainder === 2 && columns === 4 && container.children.length >= 2) {
      container.children[container.children.length - 2].style.gridColumn = '2';
    }

    bindClosedCardResize(container);
    sizeClosedCards(container);
    requestAnimationFrame(function () {
      sizeClosedCards(container);
    });
  }

  app.renderAutoReveal = function () {
    var state = app.autoState;
    if (normalizeRevealState(state)) A.saveAuto();
    clearRevealTimers();
    hideRevealOverlay();

    var reveal = state.reveal;
    var current = nextRealSeatId(state, reveal.cursor);
    if (current !== reveal.cursor) {
      reveal.cursor = current;
      A.saveAuto();
    }
    if (current > A.playerCount()) {
      A.transitionToNightIntro();
      return;
    }

    var number = el('auto-reveal-num');
    if (number) number.textContent = '№' + current;
    var prompt = el('auto-reveal-prompt');
    var cards = el('auto-reveal-cards');
    var pass = el('auto-reveal-pass');

    if (reveal.stage === 'showing') {
      if (reveal.showUntil <= Date.now()) {
        finishRevealDisplay();
        return;
      }
      if (cards) cards.classList.add('hidden');
      if (pass) pass.classList.add('hidden');
      if (prompt) prompt.textContent = 'Запомни свою роль.';
      showRevealOverlay(reveal.selectedRole);
      return;
    }

    if (reveal.stage === 'pass') {
      if (cards) {
        cards.replaceChildren();
        cards.classList.add('hidden');
      }
      if (pass) pass.classList.remove('hidden');
      var next = nextRealSeatId(state, current + 1);
      if (prompt) {
        prompt.textContent =
          next > A.playerCount()
            ? 'Увидел? Клади телефон в центр стола.'
            : 'Увидел? Передай телефон игроку №' + next + '.';
      }
      return;
    }

    if (pass) pass.classList.add('hidden');
    if (prompt)
      prompt.textContent = 'Выбери одну из ' + reveal.remainingRoles.length + ' закрытых карт.';
    renderClosedCards(reveal.remainingRoles);
  };

  app.chooseAutoRevealCard = function (index) {
    var state = app.autoState;
    if (!state || state.phase !== 'reveal') return false;
    normalizeRevealState(state);
    var reveal = state.reveal;
    if (
      reveal.stage !== 'pick' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= reveal.remainingRoles.length
    ) {
      return false;
    }

    var seat = A.seatById(reveal.cursor);
    if (!seat || A.isPhantomSeat(seat)) return false;

    A.pushHistory();
    var role = reveal.remainingRoles.splice(index, 1)[0];
    seat.role = role;
    reveal.stage = 'showing';
    reveal.selectedRole = role;
    reveal.showUntil = Date.now() + A.REVEAL_SEC * 1000;
    A.saveAuto();
    app.renderAutoReveal();
    return true;
  };

  // Старые init-пути всё ещё вызывают этот хук; клики теперь делегируются через data-action.
  A.bindRevealHoldGestures = function () {};

  app.advanceReveal = function () {
    var state = app.autoState;
    if (!state || state.phase !== 'reveal' || state.reveal.stage !== 'pass') return false;

    A.pushHistory();
    state.reveal.cursor = nextRealSeatId(state, state.reveal.cursor + 1);
    state.reveal.stage = 'pick';
    state.reveal.selectedRole = null;
    state.reveal.showUntil = 0;

    if (state.reveal.cursor > A.playerCount()) {
      A.saveAuto();
      A.transitionToNightIntro();
      return true;
    }
    A.saveAuto();
    app.renderAutoReveal();
    return true;
  };

  app.registerScreenRenderer('auto-reveal-screen', function () {
    app.renderAutoReveal();
  });
})(window.MafiaApp);
