/**
 * Общий UI/API игрового стола.
 *
 * Рендер, жесты и маршрутизация модалки едины. Различия host/auto находятся
 * в адаптерах: где лежат игроки, как сохранять фол, выставление и выбытие.
 */
(function (app) {
  'use strict';

  var h = app.h;
  var adapters = {};
  var gestureBound = false;
  var lastGestureAtByMode = {};

  function adapterFor(mode) {
    return mode && adapters[mode] ? adapters[mode] : null;
  }

  function slotMode(slot) {
    return slot ? slot.getAttribute('data-player-table-mode') || '' : '';
  }

  function playerIdFromSlot(slot) {
    if (!slot) return null;
    var value = parseInt(slot.getAttribute('data-player-id'), 10);
    return isNaN(value) ? null : value;
  }

  function findSlot(target) {
    return target && target.closest
      ? target.closest('[data-player-table-mode][data-player-id]')
      : null;
  }

  function foulLimit() {
    return app.getFoulLimit ? app.getFoulLimit() : 4;
  }

  function isUnavailable(adapter, player) {
    return !!(adapter.isUnavailable && adapter.isUnavailable(player));
  }

  function isOut(adapter, player) {
    return adapter.isOut
      ? !!adapter.isOut(player)
      : !!(player && (player.eliminationReason || player.alive === false));
  }

  function isNominated(adapter, player) {
    return !!(adapter.isNominated && adapter.isNominated(player.id));
  }

  function statusEl(adapter, player) {
    return app.playerStatusBadge(player.eliminationReason, isNominated(adapter, player));
  }

  function playerList(adapter) {
    var players = adapter.getPlayers ? adapter.getPlayers() : [];
    return Array.isArray(players) ? players : [];
  }

  function render(mode, targetId) {
    var adapter = adapterFor(mode);
    if (!adapter) return false;
    var list = document.getElementById(targetId || adapter.targetId);
    if (!list) return false;
    var players = playerList(adapter);
    var compact = players.length > 10;
    var order = app.playerSeatIndicesForTwoColumnDisplay(players.length);
    var rows = Math.ceil(Math.max(1, players.length) / 2);
    list.innerHTML = '';
    list.className =
      'player-table grid grid-flow-col grid-cols-2 gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    list.setAttribute('data-player-table-mode', mode);

    for (var oi = 0; oi < order.length; oi++) {
      var player = players[order[oi]];
      if (!player) continue;
      var unavailable = isUnavailable(adapter, player);
      var out = isOut(adapter, player);
      var nick = player.nick != null ? String(player.nick).trim() : '';
      var unavailableLabel =
        unavailable && adapter.unavailableLabel ? adapter.unavailableLabel(player) : '';
      var displayNick = unavailableLabel || nick || 'Псевдоним';
      var muted = unavailable ? ' opacity-[0.4] cursor-not-allowed' : out ? ' opacity-[0.55]' : '';
      var interactive = unavailable ? '' : ' hover:border-mafia-gold/35';

      var left = unavailable
        ? h(
            'div',
            { className: 'flex min-w-0 justify-start' },
            h('div', { className: 'invisible h-8 w-8', 'aria-hidden': 'true' })
          )
        : h('div', { className: 'flex min-w-0 justify-start' }, statusEl(adapter, player));
      var right = unavailable
        ? h(
            'div',
            { className: 'flex min-w-0 justify-end' },
            h('div', { className: 'invisible h-8 w-8', 'aria-hidden': 'true' })
          )
        : h(
            'div',
            { className: 'flex min-w-0 justify-end' },
            h(
              'div',
              {
                className:
                  'player-slot__foul-pill flex shrink-0 items-center justify-center rounded border px-2 py-1 ' +
                  ((player.fouls || 0) >= Math.max(1, foulLimit() - 1)
                    ? 'border-mafia-blood/55 bg-mafia-blood'
                    : 'border-mafia-border/35 bg-black/25'),
              },
              h(
                'span',
                {
                  className:
                    'font-sans font-semibold leading-none tabular-nums text-mafia-cream/95 ' +
                    (compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'),
                },
                'ф: ' + (player.fouls || 0)
              )
            )
          );

      list.appendChild(
        h(
          'button',
          {
            type: 'button',
            className:
              'player-cell player-slot flex h-full min-h-0 min-w-0 w-full flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-1.5 py-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2 ' +
              (compact ? 'player-slot--compact ' : '') +
              interactive +
              muted,
            'data-action': unavailable ? null : 'player-table-open',
            'data-player-table-mode': mode,
            'data-player-id': String(player.id),
            disabled: unavailable,
            'aria-label':
              'Игрок №' +
              player.id +
              (nick ? ', псевдоним ' + nick : '') +
              (unavailableLabel ? ', ' + unavailableLabel : ''),
          },
          [
            h(
              'div',
              {
                className:
                  'player-slot__row grid w-full min-h-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1',
              },
              [
                left,
                h(
                  'span',
                  {
                    className:
                      'font-display font-bold leading-none tracking-wide tabular-nums ' +
                      (unavailable ? 'text-mafia-gold/55 ' : 'text-mafia-gold ') +
                      (compact ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl'),
                  },
                  '№' + player.id
                ),
                right,
              ]
            ),
            h(
              'div',
              {
                className:
                  'player-slot-nick mt-1 w-full min-w-0 shrink-0 truncate rounded border bg-black/30 px-2 text-center font-sans leading-snug ' +
                  (compact
                    ? 'min-h-[1.25rem] py-0.5 text-xs '
                    : 'mb-2 min-h-[1.75rem] py-1 text-sm ') +
                  (unavailable
                    ? 'border-mafia-border/40 text-mafia-gold/75 italic'
                    : 'border-mafia-border/50 ' +
                      (nick ? 'text-mafia-cream/95' : 'text-mafia-cream/30')),
                role: 'presentation',
              },
              displayNick
            ),
          ]
        )
      );
    }
    if (adapter.afterRender) adapter.afterRender();
    return true;
  }

  function findRenderedSlot(adapter, playerId) {
    var list = document.getElementById(adapter.targetId);
    if (!list) return null;
    return list.querySelector(
      '[data-player-table-mode="' + adapter.mode + '"][data-player-id="' + playerId + '"]'
    );
  }

  function patchStatus(mode, playerId) {
    var adapter = adapterFor(mode);
    if (!adapter) return;
    var slot = findRenderedSlot(adapter, playerId);
    var player = adapter.getPlayer ? adapter.getPlayer(playerId) : null;
    if (!slot || !player) return;
    var row = slot.querySelector('.player-slot__row');
    if (!row || !row.children[0]) return;
    row.children[0].innerHTML = '';
    row.children[0].appendChild(statusEl(adapter, player));
  }

  function patchFoul(mode, playerId, animate) {
    var adapter = adapterFor(mode);
    if (!adapter) return;
    var slot = findRenderedSlot(adapter, playerId);
    var player = adapter.getPlayer ? adapter.getPlayer(playerId) : null;
    if (!slot || !player) return;
    var pill = slot.querySelector('.player-slot__foul-pill');
    if (!pill) return;
    var span = pill.querySelector('span');
    if (span) span.textContent = 'ф: ' + (player.fouls || 0);
    var hot = (player.fouls || 0) >= Math.max(1, foulLimit() - 1);
    pill.classList.toggle('border-mafia-blood/55', hot);
    pill.classList.toggle('bg-mafia-blood', hot);
    pill.classList.toggle('border-mafia-border/35', !hot);
    pill.classList.toggle('bg-black/25', !hot);
    if (animate) {
      pill.classList.remove('foul-bump');
      void pill.offsetWidth;
      pill.classList.add('foul-bump');
      window.setTimeout(function () {
        pill.classList.remove('foul-bump');
      }, 520);
    }
  }

  function markGesture(mode) {
    lastGestureAtByMode[mode] = Date.now();
  }

  function shouldSuppressClick(mode) {
    return !!lastGestureAtByMode[mode] && Date.now() - lastGestureAtByMode[mode] < 400;
  }

  function vibrate(pattern) {
    if (!navigator.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }

  function bindGestures() {
    if (gestureBound || !window.PointerEvent) return;
    gestureBound = true;
    var LONG_PRESS_MS = 450;
    var SWIPE_Y_MIN = 30;
    var MOVE_CANCEL_PX = 15;
    var current = null;
    var pressed = null;
    var lastWheelAt = 0;

    function clearPressed() {
      if (pressed) pressed.classList.remove('is-pressed');
      pressed = null;
    }

    function clearLongPress() {
      if (current && current.timer) {
        clearTimeout(current.timer);
        current.timer = null;
      }
    }

    document.addEventListener(
      'pointerdown',
      function (event) {
        if (current) return;
        var slot = findSlot(event.target);
        if (!slot || slot.disabled) return;
        var mode = slotMode(slot);
        var adapter = adapterFor(mode);
        var playerId = playerIdFromSlot(slot);
        if (!adapter || playerId == null || (adapter.isActive && !adapter.isActive())) return;
        pressed = slot;
        pressed.classList.add('is-pressed');

        if (event.pointerType === 'mouse') {
          if (event.button === 2 && adapter.toggleNominee) {
            adapter.toggleNominee(playerId);
            markGesture(mode);
          }
          return;
        }

        current = {
          pointerId: event.pointerId,
          mode: mode,
          adapter: adapter,
          playerId: playerId,
          x0: event.clientX,
          y0: event.clientY,
          moved: false,
          fired: false,
          timer: null,
        };
        current.timer = setTimeout(function () {
          if (!current || current.moved || current.fired) return;
          current.timer = null;
          var changed = current.adapter.toggleNominee
            ? current.adapter.toggleNominee(current.playerId, { skipRender: true })
            : false;
          if (!changed) return;
          current.fired = true;
          patchStatus(current.mode, current.playerId);
          vibrate(40);
        }, LONG_PRESS_MS);
      },
      { passive: true }
    );

    document.addEventListener(
      'pointermove',
      function (event) {
        if (!current || event.pointerId !== current.pointerId) return;
        if (
          !current.moved &&
          (Math.abs(event.clientX - current.x0) > MOVE_CANCEL_PX ||
            Math.abs(event.clientY - current.y0) > MOVE_CANCEL_PX)
        ) {
          current.moved = true;
          clearLongPress();
        }
      },
      { passive: true }
    );

    document.addEventListener(
      'pointerup',
      function (event) {
        clearPressed();
        if (!current || event.pointerId !== current.pointerId) return;
        var gesture = current;
        clearLongPress();
        current = null;
        if (gesture.fired) {
          markGesture(gesture.mode);
          return;
        }
        var dy = event.clientY - gesture.y0;
        var dx = event.clientX - gesture.x0;
        if (Math.abs(dy) >= SWIPE_Y_MIN && Math.abs(dy) > Math.abs(dx)) {
          markGesture(gesture.mode);
          if (dy < 0 && gesture.adapter.addFoul) gesture.adapter.addFoul(gesture.playerId);
          else if (dy > 0 && gesture.adapter.removeFoul)
            gesture.adapter.removeFoul(gesture.playerId);
          vibrate(25);
        }
      },
      { passive: true }
    );

    document.addEventListener(
      'pointercancel',
      function (event) {
        clearPressed();
        if (!current || event.pointerId !== current.pointerId) return;
        clearLongPress();
        current = null;
      },
      { passive: true }
    );

    document.body.addEventListener(
      'wheel',
      function (event) {
        var slot = findSlot(event.target);
        if (!slot || slot.disabled) return;
        var mode = slotMode(slot);
        var adapter = adapterFor(mode);
        var playerId = playerIdFromSlot(slot);
        if (
          !adapter ||
          playerId == null ||
          (adapter.isActive && !adapter.isActive()) ||
          Date.now() - lastWheelAt < 140
        ) {
          return;
        }
        event.preventDefault();
        lastWheelAt = Date.now();
        if (event.deltaY < 0 && adapter.addFoul) adapter.addFoul(playerId);
        else if (adapter.removeFoul) adapter.removeFoul(playerId);
      },
      { passive: false }
    );

    document.body.addEventListener('contextmenu', function (event) {
      var slot = findSlot(event.target);
      if (!slot) return;
      var adapter = adapterFor(slotMode(slot));
      if (adapter && (!adapter.isActive || adapter.isActive())) event.preventDefault();
    });
  }

  var api = {
    register: function (mode, adapter) {
      if (!mode || !adapter) return false;
      adapter.mode = mode;
      adapters[mode] = adapter;
      return true;
    },
    getAdapter: adapterFor,
    render: render,
    patchStatus: patchStatus,
    patchFoul: patchFoul,
    bindGestures: bindGestures,
    shouldSuppressClick: shouldSuppressClick,
    openFromElement: function (element) {
      var mode = element && element.getAttribute('data-player-table-mode');
      var playerId = playerIdFromSlot(element);
      var adapter = adapterFor(mode);
      if (!adapter || playerId == null || shouldSuppressClick(mode)) return false;
      if (adapter.openPlayer) adapter.openPlayer(playerId);
      return true;
    },
  };

  app.playerTable = api;
})(window.MafiaApp);
