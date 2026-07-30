/**
 * Хост-режим — экран подготовки: сетка игроков с ролями из раздачи,
 * радио-пикер роли в модалке игрока (включая донскую пометку мафии)
 * и перемешивание псевдонимов.
 *
 * Общие с player-modal.js хелперы — через app._host (H).
 */
(function (app) {
  'use strict';

  var H = (app._host = app._host || {});
  var h = app.h;

  function prepareRoleCodeToLabel(code) {
    return app.roleLabelRu(code);
  }

  function prepareRoleCodeToIconId(code) {
    return app.UI_ROLE_ICONS[code] || app.UI_ROLE_ICONS.peaceful;
  }

  function prepareRoleIconWrapClass(code) {
    var isMafiaSide = code === 'mafia' || code === 'don';
    if (code === 'maniac') {
      return 'role-badge--maniac flex h-8 w-8 shrink-0 items-center justify-center rounded border sm:h-9 sm:w-9';
    }
    if (isMafiaSide) {
      return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-border bg-mafia-black text-mafia-gold sm:h-9 sm:w-9';
    }
    return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-gold/40 bg-mafia-blood text-mafia-gold sm:h-9 sm:w-9';
  }

  var ROLE_OPT_LABELS = app.ROLE_LABELS_FULL;

  function isDonskayaPreAssign() {
    return !!(
      app.prepareConfig &&
      app.prepareConfig.variant === 'donskaya' &&
      app.donskayaIsAwaitingAssignment &&
      app.donskayaIsAwaitingAssignment()
    );
  }
  H.isDonskayaPreAssign = isDonskayaPreAssign;

  function modalPlayerId() {
    var m = document.getElementById('modal-player-actions');
    if (!m || !m.dataset || m.dataset.playerId == null || m.dataset.playerId === '') return null;
    var pid = parseInt(m.dataset.playerId, 10);
    return isNaN(pid) ? null : pid;
  }

  function manualRolesForCurrentPrepare(playerId) {
    if (app.variantConfig && app.prepareConfig) {
      if (isDonskayaPreAssign()) {
        // Дон зафиксирован раздачей — его слоту никаких опций не даём.
        if (playerId != null && app.donskayaGetDonSeat && app.donskayaGetDonSeat() === playerId) {
          return [];
        }
        // Остальные — «Мафия» (пометить) + «Мирный» (снять). Шериф/мирные раздадутся
        // автоматически после второй пометки. См. game/donskaya.js#donskayaReconcile.
        return ['peaceful', 'mafia'];
      }
      return app.variantConfig(app.prepareConfig.variant).manualRoles.slice();
    }
    return ['peaceful', 'mafia', 'don', 'sheriff'];
  }
  H.manualRolesForCurrentPrepare = manualRolesForCurrentPrepare;

  function renderPrepareModalRoleRadios(selectedCode) {
    var row = document.getElementById('modal-player-prepare-role-icons');
    if (!row) return;
    row.innerHTML = '';
    var opts = manualRolesForCurrentPrepare(modalPlayerId()).map(function (code) {
      return { value: code, label: ROLE_OPT_LABELS[code] || code };
    });
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var selected = o.value === selectedCode;
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', selected ? 'true' : 'false');
      b.setAttribute('aria-label', o.label);
      b.setAttribute('data-action', 'player-prepare-role-pick');
      b.setAttribute('data-role-code', o.value);
      b.className =
        'flex shrink-0 cursor-pointer items-center justify-center rounded-lg border p-1 outline-none transition-[border-color,background-color,box-shadow,transform] hover:border-mafia-gold/40 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:p-1.5 ' +
        (selected
          ? 'border-mafia-gold/65 bg-black/20 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.35)]'
          : 'border-mafia-border bg-mafia-coal/80');
      var wrap = document.createElement('div');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.className = prepareRoleIconWrapClass(o.value);
      wrap.innerHTML =
        '<svg class="h-[1.35rem] w-[1.35rem] pointer-events-none sm:h-6 sm:w-6" aria-hidden="true"><use href="#' +
        prepareRoleCodeToIconId(o.value) +
        '"/></svg>';
      b.appendChild(wrap);
      row.appendChild(b);
    }
  }

  H.getPrepareModalSelectedRoleCode = function () {
    var row = document.getElementById('modal-player-prepare-role-icons');
    if (!row) return null;
    var picked = row.querySelector('[role="radio"][aria-checked="true"]');
    return picked && picked.getAttribute('data-role-code')
      ? picked.getAttribute('data-role-code')
      : null;
  };

  app.pickPrepareModalRole = function (roleCode) {
    var playerId = modalPlayerId();
    if (manualRolesForCurrentPrepare(playerId).indexOf(roleCode) === -1) return;
    var m = document.getElementById('modal-player-actions');
    if (!m) return;
    if (app.rolesApi) {
      app.rolesApi.assignPlayerRole(playerId, roleCode, { source: 'manual' });
    }
    renderPrepareModalRoleRadios(roleCode);
    if (app.donskayaReconcile) app.donskayaReconcile();
    app.renderPreparePlayers();
  };

  app.renderPrepareModalRoleRadios = renderPrepareModalRoleRadios;

  app.renderPreparePlayers = function () {
    var list = document.getElementById('prepare-players-list');
    if (!list) return false;
    app.applyPlayerGridLayout(list, app.players.length);
    list.innerHTML = '';
    var compact = app.players.length > 10;
    var prepOrder = app.playerSeatIndicesForTwoColumnDisplay(app.players.length);
    for (var pi = 0; pi < prepOrder.length; pi++) {
      var seatIndex = prepOrder[pi];
      var p = app.players[seatIndex];
      var nickTrim = p.nick != null ? String(p.nick).trim() : '';
      var roleCode = app.getEffectiveSummaryRoleCode
        ? app.getEffectiveSummaryRoleCode(p.id, seatIndex)
        : 'peaceful';
      var roleLabel = prepareRoleCodeToLabel(roleCode);
      var iconId = prepareRoleCodeToIconId(roleCode);

      list.appendChild(
        h(
          'button',
          {
            type: 'button',
            className:
              'player-cell player-slot flex h-full min-h-0 min-w-0 w-full flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-1.5 py-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2 ' +
              (compact ? 'player-slot--compact ' : '') +
              (nickTrim ? 'has-nick' : ''),
            'data-action': 'player-slot-open',
            'data-player-id': String(p.id),
            'data-has-nick': nickTrim ? 'true' : 'false',
            'aria-keyshortcuts': nickTrim
              ? 'Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight'
              : null,
            title: nickTrim
              ? 'Нажмите для редактирования или перетащите в другой слот'
              : 'Нажмите, чтобы добавить псевдоним',
            'aria-label':
              (nickTrim ? 'Игрок №' + p.id + ', псевдоним ' + nickTrim : 'Игрок №' + p.id) +
              ', роль ' +
              roleLabel +
              (nickTrim ? '. Псевдоним можно перетащить в другой слот' : ''),
          },
          [
            h(
              'div',
              {
                className:
                  'player-slot__row grid w-full min-h-0 shrink-0 grid-cols-3 items-center gap-x-2',
              },
              [
                h(
                  'div',
                  { className: prepareRoleIconWrapClass(roleCode), 'aria-hidden': 'true' },
                  app.svgIcon(iconId, 'h-5 w-5 pointer-events-none sm:h-[1.35rem] sm:w-[1.35rem]')
                ),
                h(
                  'span',
                  {
                    className:
                      'font-display font-bold leading-none tracking-wide text-mafia-gold tabular-nums text-center ' +
                      (compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'),
                  },
                  '№' + p.id
                ),
                h('span', {
                  className:
                    'prepare-nick-drag-handle flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9',
                  'aria-hidden': 'true',
                }),
              ]
            ),
            h(
              'div',
              {
                className:
                  'player-slot-nick mt-1 w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-2 text-center font-sans leading-snug ' +
                  (compact
                    ? 'min-h-[1.25rem] py-0.5 text-xs '
                    : 'mb-1 min-h-[1.6rem] py-1 text-sm ') +
                  (nickTrim ? 'text-mafia-cream/95' : 'text-mafia-cream/30'),
                role: 'presentation',
              },
              nickTrim || 'Псевдоним'
            ),
          ]
        )
      );
    }
    return true;
  };

  app.swapPlayerNicks = function (sourcePlayerId, targetPlayerId) {
    if (sourcePlayerId === targetPlayerId) return false;
    var source = app.players.find(function (player) {
      return player.id === sourcePlayerId;
    });
    var target = app.players.find(function (player) {
      return player.id === targetPlayerId;
    });
    if (!source || !target) return false;

    var sourceNick = source.nick != null ? String(source.nick) : '';
    var targetNick = target.nick != null ? String(target.nick) : '';
    if (!sourceNick.trim() || sourceNick === targetNick) return false;

    source.nick = targetNick;
    target.nick = sourceNick;
    app.renderPreparePlayers();
    app.renderPlayers();
    app.saveState();
    return true;
  };

  function initPrepareNicknameDrag() {
    var list = document.getElementById('prepare-players-list');
    if (!list || list.dataset.nicknameDragBound === 'true') return;
    list.dataset.nicknameDragBound = 'true';

    var drag = null;
    var DRAG_THRESHOLD_PX = 8;

    function playerIdFromSlot(slot) {
      if (!slot) return null;
      var value = parseInt(slot.getAttribute('data-player-id'), 10);
      return isNaN(value) ? null : value;
    }

    function slotAtPoint(x, y) {
      var hit = document.elementFromPoint(x, y);
      var slot = hit && hit.closest ? hit.closest('#prepare-players-list [data-player-id]') : null;
      return slot && list.contains(slot) ? slot : null;
    }

    function nicknameForPlayer(playerId) {
      var player = app.players.find(function (item) {
        return item.id === playerId;
      });
      return player && player.nick != null ? String(player.nick).trim() : '';
    }

    function ensureLiveStatus() {
      var status = document.getElementById('prepare-nick-swap-status');
      if (status) return status;
      status = document.createElement('div');
      status.id = 'prepare-nick-swap-status';
      status.className = 'sr-only';
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      list.parentNode.appendChild(status);
      return status;
    }

    function announce(message) {
      var status = ensureLiveStatus();
      status.textContent = '';
      window.setTimeout(function () {
        status.textContent = message;
      }, 20);
    }

    function positionGhost(x, y) {
      if (!drag || !drag.ghost) return;
      var putOnRight = x < window.innerWidth - 190;
      var left = x + (putOnRight ? 14 : -14);
      var top = Math.max(28, Math.min(window.innerHeight - 28, y));
      drag.ghost.style.left = left + 'px';
      drag.ghost.style.top = top + 'px';
      drag.ghost.style.transform = putOnRight
        ? 'translate3d(0, -50%, 0)'
        : 'translate3d(-100%, -50%, 0)';
    }

    function beginDrag(e) {
      if (!drag || drag.active) return;
      drag.active = true;
      drag.source.classList.add('is-nick-drag-source');
      drag.source.setAttribute('aria-grabbed', 'true');
      document.body.classList.add('prepare-nick-drag-active');

      var ghost = document.createElement('div');
      ghost.className = 'prepare-nick-drag-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = '№' + drag.sourceId + ' · ' + drag.sourceNick;
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      positionGhost(e.clientX, e.clientY);
    }

    function updateDropTarget(e) {
      if (!drag || !drag.active) return;
      positionGhost(e.clientX, e.clientY);
      var target = slotAtPoint(e.clientX, e.clientY);
      if (target === drag.source) target = null;
      if (target === drag.target) return;
      if (drag.target) drag.target.classList.remove('is-nick-drop-target');
      drag.target = target;
      if (drag.target) drag.target.classList.add('is-nick-drop-target');
    }

    function clearDragVisuals() {
      if (!drag) return;
      if (drag.source) {
        drag.source.classList.remove('is-nick-drag-source');
        drag.source.removeAttribute('aria-grabbed');
      }
      if (drag.target) drag.target.classList.remove('is-nick-drop-target');
      if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
      document.body.classList.remove('prepare-nick-drag-active');
    }

    function markSwappedSlots(firstId, secondId, focusId) {
      [firstId, secondId].forEach(function (playerId) {
        var slot = list.querySelector('[data-player-id="' + playerId + '"]');
        if (!slot) return;
        slot.classList.add('is-nick-swap-confirmed');
        window.setTimeout(function () {
          slot.classList.remove('is-nick-swap-confirmed');
        }, 460);
      });
      if (focusId != null) {
        var focusSlot = list.querySelector('[data-player-id="' + focusId + '"]');
        if (focusSlot) focusSlot.focus();
      }
    }

    function finishDrag(e, cancelled) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      var completedDrag = drag.active;
      var sourceId = drag.sourceId;
      var targetId = drag.target ? playerIdFromSlot(drag.target) : null;
      var movedNick = drag.sourceNick;
      clearDragVisuals();
      drag = null;

      if (!completedDrag) return;
      app._lastGestureTs = Date.now();
      if (cancelled || targetId == null || !app.swapPlayerNicks(sourceId, targetId)) return;

      markSwappedSlots(sourceId, targetId, null);
      announce('Псевдоним ' + movedNick + ' перемещён в слот №' + targetId);
      if (navigator.vibrate) {
        try {
          navigator.vibrate(25);
        } catch (_error) {}
      }
    }

    list.addEventListener('pointerdown', function (e) {
      if (drag || e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var screen = document.getElementById('prepare-screen');
      if (!screen || !screen.classList.contains('active')) return;
      var source = e.target.closest && e.target.closest('[data-player-id][data-has-nick="true"]');
      if (!source || !list.contains(source)) return;
      var sourceId = playerIdFromSlot(source);
      var sourceNick = nicknameForPlayer(sourceId);
      if (sourceId == null || !sourceNick) return;

      drag = {
        pointerId: e.pointerId,
        source: source,
        sourceId: sourceId,
        sourceNick: sourceNick,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        target: null,
        ghost: null,
      };
      try {
        source.setPointerCapture(e.pointerId);
      } catch (_error) {}
    });

    list.addEventListener(
      'pointermove',
      function (e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        if (!drag.active) {
          var dx = e.clientX - drag.startX;
          var dy = e.clientY - drag.startY;
          if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD_PX) return;
          beginDrag(e);
        }
        e.preventDefault();
        updateDropTarget(e);
      },
      { passive: false }
    );

    list.addEventListener('pointerup', function (e) {
      if (drag && drag.active) e.preventDefault();
      finishDrag(e, false);
    });

    list.addEventListener('pointercancel', function (e) {
      finishDrag(e, true);
    });

    list.addEventListener('lostpointercapture', function (e) {
      if (drag && drag.pointerId === e.pointerId) finishDrag(e, true);
    });

    list.addEventListener('keydown', function (e) {
      if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      var offsets = {
        ArrowUp: -1,
        ArrowDown: 1,
        ArrowLeft: -Math.ceil(app.players.length / 2),
        ArrowRight: Math.ceil(app.players.length / 2),
      };
      if (!Object.prototype.hasOwnProperty.call(offsets, e.key)) return;
      var source = e.target.closest && e.target.closest('[data-player-id][data-has-nick="true"]');
      if (!source || !list.contains(source)) return;

      var cards = Array.prototype.slice.call(list.querySelectorAll('[data-player-id]'));
      var sourcePosition = cards.indexOf(source);
      var targetPosition = sourcePosition + offsets[e.key];
      var rowCount = Math.ceil(app.players.length / 2);
      if (
        targetPosition < 0 ||
        targetPosition >= cards.length ||
        (e.key === 'ArrowUp' && sourcePosition % rowCount === 0) ||
        (e.key === 'ArrowDown' && sourcePosition % rowCount === rowCount - 1) ||
        (e.key === 'ArrowLeft' && sourcePosition < rowCount) ||
        (e.key === 'ArrowRight' && sourcePosition >= rowCount)
      ) {
        return;
      }

      var sourceId = playerIdFromSlot(source);
      var targetId = playerIdFromSlot(cards[targetPosition]);
      var movedNick = nicknameForPlayer(sourceId);
      if (sourceId == null || targetId == null || !app.swapPlayerNicks(sourceId, targetId)) return;
      e.preventDefault();
      app._lastGestureTs = Date.now();
      markSwappedSlots(sourceId, targetId, targetId);
      announce('Псевдоним ' + movedNick + ' перемещён в слот №' + targetId);
    });
  }

  app.shufflePlayerNicks = function () {
    var nonEmptyNicks = app.players
      .map(function (p) {
        return p.nick != null ? String(p.nick).trim() : '';
      })
      .filter(function (nick) {
        return nick !== '';
      });
    if (nonEmptyNicks.length < 2) return false;
    for (var i = nonEmptyNicks.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = nonEmptyNicks[i];
      nonEmptyNicks[i] = nonEmptyNicks[j];
      nonEmptyNicks[j] = tmp;
    }
    var cursor = 0;
    for (var pi = 0; pi < app.players.length; pi++) {
      var hasNick = app.players[pi].nick != null && String(app.players[pi].nick).trim() !== '';
      if (!hasNick) continue;
      app.players[pi].nick = nonEmptyNicks[cursor++] || '';
    }
    app.renderPreparePlayers();
    app.renderPlayers();
    app.saveState();
    return true;
  };

  app.registerScreenRenderer('prepare-screen', function () {
    app.renderPreparePlayers();
    initPrepareNicknameDrag();
  });
})(window.MafiaApp);
