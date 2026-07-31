/**
 * Автономный режим — день (auto-day-screen): таймер, слоты игроков,
 * фолы, выставления, модалка игрока и переход к голосованию/ночи.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;

  A.transitionToDay = function (dayNum) {
    var s = app.autoState;
    A.setPhase('day');
    s.day = { dayNum: dayNum, timeLeft: A.DEFAULT_DAY_SEC, nominees: [] };
    A.navAfter('auto-day-screen');
  };

  app.renderAutoDay = function () {
    var s = app.autoState;
    if (!s.day) {
      A.transitionToDay(1);
      return;
    }
    var lab = el('auto-day-label');
    if (lab) lab.textContent = 'День ' + s.day.dayNum;
    var t = el('auto-day-timer');
    if (t) t.textContent = String(s.day.timeLeft);
    syncAutoDayTimerAppearance();
    applyAutoDayTimerButtonState(false);
    renderAutoDayPlayers();
    refreshAutoDayNominees();
    refreshAutoDaySwitchHostButton();
  };

  function isNoVoteDay() {
    return false;
  }

  function syncAutoDayTimerAppearance() {
    var s = app.autoState;
    if (!s.day) return;
    var pill = el('auto-day-timer-pill');
    var urgent = s.day.timeLeft <= 10;
    if (pill) {
      pill.classList.toggle('border-mafia-blood/55', urgent);
      pill.classList.toggle('bg-mafia-blood', urgent);
      pill.classList.toggle('border-mafia-border/35', !urgent);
      pill.classList.toggle('bg-black/25', !urgent);
    }
  }

  function applyAutoDayTimerButtonState(running) {
    var btn = el('auto-day-start-btn');
    if (!btn) return;
    btn.textContent = running ? 'Пауза' : 'Старт';
    btn.setAttribute('aria-pressed', running ? 'true' : 'false');
    var base =
      'px-3 py-2 sm:px-5 sm:py-3 font-semibold rounded uppercase text-xs sm:text-sm tracking-wider cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-[118ms] ease-out';
    btn.className =
      base +
      (running
        ? ' bg-red-900 hover:bg-red-800 border border-red-700 text-white'
        : ' bg-green-800 hover:bg-green-700 border border-green-600 text-white');
  }

  app.toggleAutoDayTimer = function () {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) {
      if (app.clockApi) app.clockApi.stop('auto-day');
      else clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
      applyAutoDayTimerButtonState(false);
      return;
    }
    applyAutoDayTimerButtonState(true);
    function onTick(clockState) {
      if (!s.day) {
        if (app.clockApi) app.clockApi.stop('auto-day');
        else clearInterval(app._autoEphemeral.dayTimerInterval);
        app._autoEphemeral.dayTimerInterval = null;
        return;
      }
      var nextTime = app.clockApi
        ? Math.max(0, Math.ceil(clockState.remainingMs / 1000))
        : Math.max(0, s.day.timeLeft - 1);
      if (nextTime !== s.day.timeLeft) {
        s.day.timeLeft = nextTime;
        var t = el('auto-day-timer');
        if (t) t.textContent = String(s.day.timeLeft);
        syncAutoDayTimerAppearance();
        if (app.timerVoiceEnabled && s.day.timeLeft === 10 && app.playTimerVoiceCue) {
          app.playTimerVoiceCue('10');
        }
        if (s.day.timeLeft <= 0) {
          if (app.clockApi) app.clockApi.stop('auto-day');
          else clearInterval(app._autoEphemeral.dayTimerInterval);
          app._autoEphemeral.dayTimerInterval = null;
          applyAutoDayTimerButtonState(false);
          if (app.timerVoiceEnabled && app.playTimerVoiceCue) {
            app.playTimerVoiceCue('0');
          }
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
              navigator.vibrate([90, 45, 90]);
            } catch (_) {}
          }
        }
        A.saveAuto();
      }
    }
    if (app.clockApi) {
      app.clockApi.startCountdown('auto-day', s.day.timeLeft * 1000, {
        tickMs: 200,
        onTick: onTick,
      });
      app._autoEphemeral.dayTimerInterval = 'clock-api';
    } else {
      app._autoEphemeral.dayTimerInterval = setInterval(onTick, 1000);
    }
  };

  app.resetAutoDayTimer = function (sec) {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) {
      if (app.clockApi) app.clockApi.stop('auto-day');
      else clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
    }
    s.day.timeLeft = sec;
    var t = el('auto-day-timer');
    if (t) t.textContent = String(sec);
    syncAutoDayTimerAppearance();
    applyAutoDayTimerButtonState(false);
    A.saveAuto();
  };

  function renderAutoDayPlayers() {
    if (app.playerTable) app.playerTable.render('auto', 'auto-day-players-list');
  }
  A.renderAutoDayPlayers = renderAutoDayPlayers;

  A.patchAutoPlayerSlotStatus = function (seatId) {
    if (app.playerTable) app.playerTable.patchStatus('auto', seatId);
  };

  function refreshAutoDaySwitchHostButton() {
    var btn = el('auto-day-switch-host');
    if (!btn) return;
    var s = app.autoState;
    var anyOut = false;
    if (s.seats && s.seats.length) {
      for (var i = 0; i < s.seats.length; i++) {
        if (!s.seats[i].alive) {
          anyOut = true;
          break;
        }
      }
    }
    btn.classList.toggle('hidden', !anyOut);
  }

  function refreshAutoDayNominees() {
    var s = app.autoState;
    var noVote = isNoVoteDay();
    var elQ = el('auto-day-nominees');
    if (elQ) {
      elQ.textContent = s.day && s.day.nominees.length ? s.day.nominees.join(' → ') : '—';
      elQ.classList.toggle('hidden', noVote);
    }
    var voteBtn = el('auto-day-go-vote');
    if (voteBtn) {
      if (noVote) {
        voteBtn.classList.add('hidden');
      } else {
        voteBtn.classList.remove('hidden');
        var enable = s.day && s.day.nominees.length >= 1;
        voteBtn.disabled = !enable;
        voteBtn.className = enable
          ? 'w-full py-2.5 bg-mafia-blood hover:bg-mafia-bloodLight border-2 border-mafia-gold text-mafia-gold font-semibold rounded text-sm uppercase tracking-wider cursor-pointer transition-all active:scale-[0.98]'
          : 'w-full py-2.5 bg-mafia-blood/50 border border-mafia-gold/40 text-mafia-gold/50 font-semibold rounded text-sm uppercase tracking-wider cursor-not-allowed transition-all';
      }
    }
    var skipBtn = document.querySelector('[data-action="auto-day-skip-vote"]');
    if (skipBtn) skipBtn.textContent = noVote ? 'Перейти в ночь' : 'Без голосования → ночь';
  }
  A.refreshAutoDayNominees = refreshAutoDayNominees;

  // ============ Auto-day mutations ============

  function addAutoNominee(seatId, opts) {
    var s = app.autoState;
    if (!s.day) return false;
    var seat = A.seatById(seatId);
    if (!seat || seat.eliminationReason) return false;
    if (A.isPhantomSeat(seat)) return false;
    if (s.day.nominees.indexOf(seatId) !== -1) return false;
    A.mutate(function (st) {
      st.day.nominees.push(seatId);
    });
    if (!opts || !opts.skipRender) renderAutoDayPlayers();
    refreshAutoDayNominees();
    return true;
  }

  function removeAutoNominee(seatId, opts) {
    var s = app.autoState;
    if (!s.day) return false;
    var ix = s.day.nominees.indexOf(seatId);
    if (ix === -1) return false;
    A.mutate(function (st) {
      st.day.nominees.splice(ix, 1);
    });
    if (!opts || !opts.skipRender) renderAutoDayPlayers();
    refreshAutoDayNominees();
    return true;
  }

  function toggleAutoNominee(seatId, opts) {
    var s = app.autoState;
    if (!s.day) return false;
    return s.day.nominees.indexOf(seatId) !== -1
      ? removeAutoNominee(seatId, opts)
      : addAutoNominee(seatId, opts);
  }
  A.toggleAutoNominee = toggleAutoNominee;

  function addAutoFoul(seatId) {
    var seat = A.seatById(seatId);
    if (!seat) return false;
    if (A.isPhantomSeat(seat)) return false;
    var foulLimit = app.getFoulLimit ? app.getFoulLimit() : 4;
    if (seat.fouls >= foulLimit || seat.eliminationReason) return false;
    var disqualified = false;
    A.mutate(function (st) {
      seat.fouls++;
      if (seat.fouls >= foulLimit && !seat.eliminationReason) {
        disqualified = true;
        seat.fouls = foulLimit;
        seat.eliminationReason = 'disqual';
        seat.alive = false;
        if (st.day) {
          var ix = st.day.nominees.indexOf(seatId);
          if (ix !== -1) st.day.nominees.splice(ix, 1);
        }
      }
    });
    if (disqualified) renderAutoDayPlayers();
    else if (app.playerTable) app.playerTable.patchFoul('auto', seatId, true);
    refreshAutoDayNominees();
    return true;
  }
  A.addAutoFoul = addAutoFoul;

  function removeAutoFoul(seatId) {
    var seat = A.seatById(seatId);
    if (!seat || seat.fouls <= 0 || seat.eliminationReason) return false;
    if (A.isPhantomSeat(seat)) return false;
    A.mutate(function () {
      seat.fouls--;
    });
    if (app.playerTable) app.playerTable.patchFoul('auto', seatId, false);
    return true;
  }
  A.removeAutoFoul = removeAutoFoul;

  A.setAutoElim = function (seatId, reason) {
    var s = app.autoState;
    var seat = A.seatById(seatId);
    if (!seat) return false;
    if (A.isPhantomSeat(seat)) return false;
    A.pushHistory();
    if (seat.eliminationReason === reason) {
      seat.eliminationReason = null;
      seat.alive = true;
      if (reason === 'disqual') seat.fouls = 0;
      if (reason === 'hang') A.untrackHang(seatId);
    } else {
      var prev = seat.eliminationReason;
      seat.eliminationReason = reason;
      seat.alive = false;
      if (s.day) {
        var ix = s.day.nominees.indexOf(seatId);
        if (ix !== -1) s.day.nominees.splice(ix, 1);
      }
      if (prev === 'hang' && reason !== 'hang') A.untrackHang(seatId);
      if (reason === 'hang') A.trackHangIfBlack(seatId);
    }
    A.saveAuto();
    renderAutoDayPlayers();
    refreshAutoDayNominees();
    return true;
  };

  app.skipAutoVote = function () {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) {
      if (app.clockApi) app.clockApi.stop('auto-day');
      else clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
    }
    A.pushHistory();
    s.day.nominees = [];
    A.saveAuto();
    A.transitionToNight((s.nightNum || 0) + 1);
  };

  A.withAutoModalSeatId = function (cb) {
    var modal = el('modal-player-actions');
    if (!modal) return;
    var pidStr = modal.dataset.playerId;
    if (!pidStr) return;
    var pid = parseInt(pidStr, 10);
    if (!isNaN(pid)) cb(pid);
  };

  if (app.gameSessionApi) {
    app.gameSessionApi.registerMode('auto', {
      snapshot: function () {
        return {
          players: app.autoState.seats,
          nominees: app.autoState.day ? app.autoState.day.nominees : [],
          vote: app.autoState.vote,
        };
      },
      addFoul: function (command) {
        return addAutoFoul(command.playerId);
      },
      removeFoul: function (command) {
        return removeAutoFoul(command.playerId);
      },
      addNominee: function (command) {
        return addAutoNominee(command.playerId, command.options);
      },
      removeNominee: function (command) {
        return removeAutoNominee(command.playerId, command.options);
      },
      toggleNominee: function (command) {
        return toggleAutoNominee(command.playerId, command.options);
      },
      updateNickname: function (command) {
        var seat = A.seatById(command.playerId);
        if (!seat) return false;
        var next = String(command.nickname == null ? '' : command.nickname).slice(0, 32);
        if ((seat.nick || '') === next) return false;
        A.mutate(function () {
          seat.nick = next;
        });
        return true;
      },
      setElimination: function (command) {
        if (
          command.reason === 'hang' &&
          (!app.autoState.day || app.autoState.day.nominees.indexOf(command.playerId) === -1)
        )
          return false;
        return A.setAutoElim(command.playerId, command.reason);
      },
    });
  }

  app.playerTable.register('auto', {
    targetId: 'auto-day-players-list',
    isActive: function () {
      var screen = el('auto-day-screen');
      return !!(screen && screen.classList.contains('active'));
    },
    getPlayers: function () {
      return app.autoState.seats;
    },
    getPlayer: function (id) {
      return A.seatById(id);
    },
    isUnavailable: function (seat) {
      return A.isPhantomSeat(seat);
    },
    unavailableLabel: function () {
      return 'Каспер';
    },
    isOut: function (seat) {
      return !!seat.eliminationReason || seat.alive === false;
    },
    isNominated: function (id) {
      return !!(app.autoState.day && app.autoState.day.nominees.indexOf(id) !== -1);
    },
    toggleNominee: function (id, opts) {
      return app.playerApi.toggleNominee('auto', id, opts);
    },
    addFoul: function (id) {
      return app.playerApi.addFoul('auto', id);
    },
    removeFoul: function (id) {
      return app.playerApi.removeFoul('auto', id);
    },
    openPlayer: function (id) {
      if (app.showPlayerActionsModal) app.showPlayerActionsModal(id, 'auto');
    },
    updateNick: function (id, nick) {
      return app.playerApi.updateNickname('auto', id, nick);
    },
    canEliminate: function (id, reason) {
      return (
        reason !== 'hang' || !!(app.autoState.day && app.autoState.day.nominees.indexOf(id) !== -1)
      );
    },
    setElimination: function (id, reason) {
      if (!this.canEliminate(id, reason)) return false;
      return app.playerApi.setElimination('auto', id, reason);
    },
    render: function () {
      renderAutoDayPlayers();
      refreshAutoDayNominees();
    },
    afterRender: refreshAutoDaySwitchHostButton,
  });

  app.registerScreenRenderer('auto-day-screen', function () {
    app.renderAutoDay();
  });
})(window.MafiaApp);
