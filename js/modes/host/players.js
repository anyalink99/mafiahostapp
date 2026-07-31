/**
 * Хост-режим — игровой стол: сетка игроков (статус/фолы/псевдоним),
 * фолы с дисквалификацией, очередь на голосование, статусы выбытия
 * и точечные патчи слотов без полного перерендера.
 *
 * Экран подготовки — prepare-players.js, модалка игрока — player-modal.js.
 */
(function (app) {
  'use strict';

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
    if (!p) return false;
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
    return true;
  };

  // Точечно обновляет «таблетку» фолов без полного перерендера списка — так окошко
  // не дёргается по вертикали при смене числа. Анимация — только при росте (animate).
  app.patchPlayerSlotFoul = function (id, animate) {
    if (app.playerTable) app.playerTable.patchFoul('host', id, animate);
  };

  app.patchPlayerSlotVoteIndicator = function (id) {
    if (app.playerTable) app.playerTable.patchStatus('host', id);
  };

  app.renderPlayers = function () {
    var ok = app.renderPlayersTo('players-list');
    if (app.renderGameSidePanels) app.renderGameSidePanels();
    return ok;
  };

  app.renderPlayersTo = function (targetId) {
    return app.playerTable ? app.playerTable.render('host', targetId || 'players-list') : false;
  };

  app.addFoul = function (id) {
    const p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p || p.eliminationReason) return false;
    var foulLimit = app.getFoulLimit ? app.getFoulLimit() : 4;
    if (p.fouls >= foulLimit) return false;
    p.fouls++;
    var disqualified = false;
    if (p.fouls >= foulLimit) {
      disqualified = true;
      p.fouls = foulLimit;
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
    return true;
  };

  app.removeFoul = function (id) {
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p || p.eliminationReason || p.fouls <= 0) return false;
    p.fouls--;
    app.patchPlayerSlotFoul(id, false);
    app.saveState();
    return true;
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

  if (app.gameSessionApi) {
    app.gameSessionApi.registerMode('host', {
      snapshot: function () {
        return {
          players: app.players,
          nominees: app.nomineeQueue,
          vote: app.activeVoteRound,
        };
      },
      addFoul: function (command) {
        return app.addFoul(command.playerId);
      },
      removeFoul: function (command) {
        return app.removeFoul(command.playerId);
      },
      addNominee: function (command) {
        return app.addPlayerToNomineeQueue(command.playerId, command.options);
      },
      removeNominee: function (command) {
        return app.removePlayerFromNomineeQueue(command.playerId, command.options);
      },
      toggleNominee: function (command) {
        return app.nomineeQueue.indexOf(command.playerId) !== -1
          ? app.removePlayerFromNomineeQueue(command.playerId, command.options)
          : app.addPlayerToNomineeQueue(command.playerId, command.options);
      },
      updateNickname: function (command) {
        var player = app.players.find(function (item) {
          return item.id === command.playerId;
        });
        if (!player) return false;
        var next = String(command.nickname == null ? '' : command.nickname).slice(0, 32);
        if (player.nick === next) return false;
        player.nick = next;
        app.saveState();
        return true;
      },
      setElimination: function (command) {
        if (command.reason === 'hang' && app.nomineeQueue.indexOf(command.playerId) === -1)
          return false;
        return app.setPlayerEliminationState(command.playerId, command.reason);
      },
    });
  }

  app.playerTable.register('host', {
    targetId: 'players-list',
    isActive: function () {
      var screen = document.getElementById('game-screen');
      return !!(screen && screen.classList.contains('active'));
    },
    getPlayers: function () {
      return app.players;
    },
    getPlayer: function (id) {
      return app.players.find(function (player) {
        return player.id === id;
      });
    },
    isOut: function (player) {
      return !!player.eliminationReason;
    },
    isNominated: function (id) {
      return app.nomineeQueue.indexOf(id) !== -1;
    },
    toggleNominee: function (id, opts) {
      return app.playerApi.toggleNominee('host', id, opts);
    },
    addFoul: function (id) {
      return app.playerApi.addFoul('host', id);
    },
    removeFoul: function (id) {
      return app.playerApi.removeFoul('host', id);
    },
    openPlayer: function (id) {
      if (app.showPlayerActionsModal) app.showPlayerActionsModal(id, 'host');
    },
    updateNick: function (id, nick) {
      return app.playerApi.updateNickname('host', id, nick);
    },
    canEliminate: function (id, reason) {
      return reason !== 'hang' || app.nomineeQueue.indexOf(id) !== -1;
    },
    setElimination: function (id, reason) {
      if (!this.canEliminate(id, reason)) return false;
      return app.playerApi.setElimination('host', id, reason);
    },
    render: function () {
      app.renderPlayers();
    },
  });

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
