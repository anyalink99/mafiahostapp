/**
 * Хост-режим — игровой стол: сетка игроков №1–№10 (статус/фолы/псевдоним),
 * фолы с дисквалификацией, очередь на голосование, статусы выбытия
 * и точечные патчи слотов без полного перерендера.
 *
 * Экран подготовки — prepare-players.js, модалка игрока — player-modal.js.
 */
(function (app) {
  'use strict';

  var h = app.h;

  function playerSlotStatusEl(p) {
    var inVoteQueue = app.nomineeQueue.indexOf(p.id) !== -1;
    return app.playerStatusBadge(p.eliminationReason, inVoteQueue);
  }

  app.getActivePlayerCount = function () {
    var c = 0;
    for (var ai = 0; ai < app.players.length; ai++) {
      if (!app.players[ai].eliminationReason) c++;
    }
    return c;
  };

  app.pruneGameLogOnRevive = function (playerId, reason) {
    if (!Array.isArray(app.gameLog)) return;
    for (var i = app.gameLog.length - 1; i >= 0; i--) {
      var e = app.gameLog[i];
      if (reason === 'hang') {
        if (e.type === 'vote_hang' && e.eliminatedIds && e.eliminatedIds.indexOf(playerId) !== -1) {
          e.eliminatedIds = e.eliminatedIds.filter(function (x) {
            return x !== playerId;
          });
          if (e.eliminatedIds.length === 0) app.gameLog.splice(i, 1);
          return;
        }
        if (e.type === 'elimination' && e.playerId === playerId && e.reason === 'hang') {
          app.gameLog.splice(i, 1);
          return;
        }
      } else if (e.type === 'elimination' && e.playerId === playerId && e.reason === reason) {
        app.gameLog.splice(i, 1);
        return;
      }
    }
  };

  app.setPlayerEliminationState = function (id, reason) {
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    if (p.eliminationReason === reason) {
      p.eliminationReason = null;
      if (reason === 'disqual') {
        p.fouls = 0;
      }
      app.pruneGameLogOnRevive(id, reason);
    } else {
      var poolBefore = app.getActivePlayerCount();
      var singleNomineeHang =
        reason === 'hang' && app.nomineeQueue.length === 1 && app.nomineeQueue[0] === id;
      p.eliminationReason = reason;
      var elimEntry = { type: 'elimination', ts: Date.now(), playerId: id, reason: reason };
      if (singleNomineeHang) {
        elimEntry.outsideVoteSingleNominee = true;
        elimEntry.votePoolTotal = poolBefore;
      }
      app.gameLog.push(elimEntry);
      var vix = app.nomineeQueue.indexOf(id);
      if (vix !== -1) {
        app.nomineeQueue.splice(vix, 1);
        app.refreshNomineeQueueUi();
      }
    }
    var vs = app.activeVoteRound;
    if (vs && vs.phase === 'counting') {
      vs.poolTotal = app.getActivePlayerCount();
    }
    app.renderPlayers();
    if (app.isVotingUiActive && app.isVotingUiActive() && app.renderVoteScreen) {
      app.renderVoteScreen();
    }
    app.saveState();
  };

  // Точечно обновляет «таблетку» фолов без полного перерендера списка — так окошко
  // не дёргается по вертикали при смене числа. Анимация — только при росте (animate).
  app.patchPlayerSlotFoul = function (id, animate) {
    var list = document.getElementById('players-list');
    if (!list) return;
    var btn = list.querySelector('[data-player-id="' + id + '"]');
    if (!btn) return;
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    var pill = btn.querySelector('.player-slot__foul-pill');
    if (!pill) return;
    var span = pill.querySelector('span');
    if (span) span.textContent = 'ф: ' + p.fouls;
    var hot = p.fouls > 2;
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
  };

  app.patchPlayerSlotVoteIndicator = function (id) {
    var list = document.getElementById('players-list');
    if (!list) return;
    var btn = list.querySelector('[data-player-id="' + id + '"]');
    if (!btn) return;
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    var row = btn.querySelector('.player-slot__row');
    if (!row || !row.children[0]) return;
    row.children[0].innerHTML = '';
    row.children[0].appendChild(playerSlotStatusEl(p));
  };

  app.renderPlayers = function () {
    var ok = app.renderPlayersTo('players-list');
    if (app.renderGameSidePanels) app.renderGameSidePanels();
    return ok;
  };

  app.renderPlayersTo = function (targetId) {
    var list = document.getElementById(targetId || 'players-list');
    if (!list) return false;
    list.className =
      'grid grid-flow-col grid-cols-2 grid-rows-5 gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.innerHTML = '';
    var playOrder = app.playerSeatIndicesForTwoColumnDisplay(app.players.length);
    for (var qi = 0; qi < playOrder.length; qi++) {
      var p = app.players[playOrder[qi]];
      var out = !!p.eliminationReason;
      var nickTrim = p.nick != null ? String(p.nick).trim() : '';

      list.appendChild(
        h(
          'button',
          {
            type: 'button',
            className:
              'player-cell player-slot flex h-full min-h-0 min-w-0 w-full flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-2 pt-2 pb-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2.5 sm:pt-2.5 sm:pb-1.5' +
              (out ? ' opacity-[0.55]' : ''),
            'data-action': 'player-slot-open',
            'data-player-id': String(p.id),
            'aria-label': nickTrim
              ? 'Игрок №' + p.id + ', псевдоним ' + nickTrim
              : 'Игрок №' + p.id,
          },
          [
            h(
              'div',
              {
                className:
                  'player-slot__row grid w-full min-h-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1',
              },
              [
                h('div', { className: 'flex min-w-0 justify-start' }, playerSlotStatusEl(p)),
                h(
                  'span',
                  {
                    className:
                      'font-display text-3xl font-bold leading-none tracking-wide text-mafia-gold tabular-nums sm:text-4xl',
                  },
                  '№' + p.id
                ),
                h(
                  'div',
                  { className: 'flex min-w-0 justify-end' },
                  h(
                    'div',
                    {
                      className:
                        'player-slot__foul-pill flex shrink-0 items-center justify-center rounded border px-2 py-1 ' +
                        (p.fouls > 2
                          ? 'border-mafia-blood/55 bg-mafia-blood'
                          : 'border-mafia-border/35 bg-black/25'),
                    },
                    h(
                      'span',
                      {
                        className:
                          'font-sans font-semibold leading-none tabular-nums text-sm sm:text-base text-mafia-cream/95',
                      },
                      'ф: ' + p.fouls
                    )
                  )
                ),
              ]
            ),
            h(
              'div',
              {
                className:
                  'player-slot-nick mt-1 mb-2 min-h-[1.75rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-2 py-1 text-center font-sans text-sm leading-snug ' +
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

  app.addFoul = function (id) {
    const p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p || p.eliminationReason) return;
    p.fouls++;
    var disqualified = false;
    if (p.fouls >= 4) {
      disqualified = true;
      p.fouls = 4;
      p.eliminationReason = 'disqual';
      app.gameLog.push({ type: 'elimination', ts: Date.now(), playerId: id, reason: 'disqual' });
      var vix = app.nomineeQueue.indexOf(id);
      if (vix !== -1) {
        app.nomineeQueue.splice(vix, 1);
        app.refreshNomineeQueueUi();
      }
      var vs = app.activeVoteRound;
      if (vs && vs.phase === 'counting') {
        vs.poolTotal = app.getActivePlayerCount();
      }
    }
    if (disqualified) {
      app.renderPlayers();
    } else {
      app.patchPlayerSlotFoul(id, true);
    }
    if (app.isVotingUiActive && app.isVotingUiActive() && app.renderVoteScreen) {
      app.renderVoteScreen();
    }
    app.saveState();
  };

  app.removeFoul = function (id) {
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p || p.eliminationReason || p.fouls <= 0) return;
    p.fouls--;
    app.patchPlayerSlotFoul(id, false);
    app.saveState();
  };

  app.addPlayerToNomineeQueue = function (id, opts) {
    opts = opts || {};
    var pl = app.players.find(function (x) {
      return x.id === id;
    });
    if (pl && pl.eliminationReason) return false;
    var vs = app.activeVoteRound;
    if (vs && vs.phase === 'counting' && vs.tieRevote && vs.candidateIds) {
      if (vs.candidateIds.indexOf(id) === -1) return false;
    }
    if (app.nomineeQueue.indexOf(id) === -1) {
      app.nomineeQueue.push(id);
      app.refreshNomineeQueueUi();
      if (!opts.skipRender) app.renderPlayers();
      app.saveState();
      return true;
    }
    return false;
  };

  app.removePlayerFromNomineeQueue = function (id, opts) {
    opts = opts || {};
    var vix = app.nomineeQueue.indexOf(id);
    if (vix === -1) return false;
    app.nomineeQueue.splice(vix, 1);
    app.refreshNomineeQueueUi();
    if (!opts.skipRender) app.renderPlayers();
    if (app.isVotingUiActive && app.isVotingUiActive() && app.renderVoteScreen) {
      app.renderVoteScreen();
    }
    app.saveState();
    return true;
  };

  app.refreshNomineeQueueUi = function () {
    const el = document.getElementById('voting-order');
    if (el) el.textContent = app.nomineeQueue.length ? app.nomineeQueue.join(' → ') : '—';
    const go = document.getElementById('btn-go-voting');
    if (go) {
      const ok = app.nomineeQueue.length >= 2;
      const revote =
        app.activeVoteRound &&
        app.activeVoteRound.phase === 'counting' &&
        app.activeVoteRound.tieRevote;
      go.textContent = revote ? 'Переголосование' : 'Голосование';
      go.disabled = !ok;
      if (ok) {
        go.className =
          'w-full py-2.5 bg-mafia-blood hover:bg-mafia-bloodLight border-2 border-mafia-gold text-mafia-gold font-semibold rounded text-sm uppercase tracking-wider cursor-pointer transition-all active:scale-[0.98]';
      } else {
        go.className =
          'w-full py-2.5 bg-mafia-blood/50 border border-mafia-gold/40 text-mafia-gold/50 font-semibold rounded text-sm uppercase tracking-wider cursor-not-allowed transition-all';
      }
    }
  };

  // Игровой стол хост-режима: игроки + таймер + очередь голосования + боковые панели.
  app.registerScreenRenderer('game-screen', function () {
    app.renderPlayers();
    if (app.syncTimerPresetButtons) app.syncTimerPresetButtons();
    if (app.syncTimerControls) app.syncTimerControls();
    else {
      var timerEl = document.getElementById('timer');
      if (timerEl) timerEl.textContent = app.timeLeft;
      if (app.syncTimerAppearance) app.syncTimerAppearance();
    }
    app.refreshNomineeQueueUi();
    if (app.renderGameSidePanels) app.renderGameSidePanels();
  });
})(window.MafiaApp);
