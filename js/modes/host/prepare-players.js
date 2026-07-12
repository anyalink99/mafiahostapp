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
    if (manualRolesForCurrentPrepare(modalPlayerId()).indexOf(roleCode) === -1) return;
    var m = document.getElementById('modal-player-actions');
    if (!m) return;
    renderPrepareModalRoleRadios(roleCode);
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
              (compact ? 'player-slot--compact' : ''),
            'data-action': 'player-slot-open',
            'data-player-id': String(p.id),
            'aria-label':
              (nickTrim ? 'Игрок №' + p.id + ', псевдоним ' + nickTrim : 'Игрок №' + p.id) +
              ', роль ' +
              roleLabel,
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
                h('div', { className: 'invisible h-8 w-8 sm:h-9 sm:w-9', 'aria-hidden': 'true' }),
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
  });
})(window.MafiaApp);
