/**
 * Автономный режим — день (auto-day-screen): таймер, слоты игроков,
 * фолы, выставления, модалка игрока и переход к голосованию/ночи.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;
  var escapeHtml = A.escapeHtml;

  A.transitionToDay = function (dayNum) {
    var s = app.autoState;
    s.phase = 'day';
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
      clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
      applyAutoDayTimerButtonState(false);
      return;
    }
    applyAutoDayTimerButtonState(true);
    app._autoEphemeral.dayTimerInterval = setInterval(function () {
      if (!s.day) {
        clearInterval(app._autoEphemeral.dayTimerInterval);
        app._autoEphemeral.dayTimerInterval = null;
        return;
      }
      if (s.day.timeLeft > 0) {
        s.day.timeLeft--;
        var t = el('auto-day-timer');
        if (t) t.textContent = String(s.day.timeLeft);
        syncAutoDayTimerAppearance();
        if (app.timerVoiceEnabled && s.day.timeLeft === 10 && app.playTimerVoiceCue) {
          app.playTimerVoiceCue('10');
        }
        if (s.day.timeLeft <= 0) {
          clearInterval(app._autoEphemeral.dayTimerInterval);
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
    }, 1000);
  };

  app.resetAutoDayTimer = function (sec) {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) {
      clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
    }
    s.day.timeLeft = sec;
    var t = el('auto-day-timer');
    if (t) t.textContent = String(sec);
    syncAutoDayTimerAppearance();
    applyAutoDayTimerButtonState(false);
    A.saveAuto();
  };

  function autoPlayerStatusHtml(seat) {
    var s = app.autoState;
    var inQueue = s.day && s.day.nominees.indexOf(seat.id) !== -1;
    if (seat.eliminationReason) {
      return (
        '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-blood/50 bg-mafia-blood/10 text-mafia-blood" aria-hidden="true"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-elim-' +
        seat.eliminationReason +
        '"/></svg></div>'
      );
    }
    if (inQueue) {
      return '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-gold/70 bg-mafia-blood/15 text-mafia-gold" title="Выставлен" aria-label="Выставлен"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-nominated"/></svg></div>';
    }
    return '<div class="invisible flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-transparent" aria-hidden="true"></div>';
  }

  function renderAutoDayPlayers() {
    var list = el('auto-day-players-list');
    if (!list) return;
    var s = app.autoState;
    list.innerHTML = '';
    var rows = Math.ceil(A.playerCount() / 2);
    var order = app.playerSeatIndicesForTwoColumnDisplay(A.playerCount());
    list.className = 'grid grid-flow-col grid-cols-2 gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    order.forEach(function (idx) {
      var seat = s.seats[idx];
      if (!seat) return;
      var out = !!seat.eliminationReason || seat.alive === false;
      var phantom = A.isPhantomSeat(seat);
      var btn = document.createElement('button');
      btn.type = 'button';
      var phantomCls = phantom ? ' opacity-[0.4] cursor-not-allowed' : out ? ' opacity-[0.55]' : '';
      var hoverCls = phantom ? '' : ' hover:border-mafia-gold/35 active:scale-[0.98]';
      btn.className =
        'player-cell player-slot flex h-full min-h-0 min-w-0 w-full flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-2 pt-2 pb-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2.5 sm:pt-2.5 sm:pb-1.5' +
        hoverCls +
        phantomCls;
      if (!phantom) btn.setAttribute('data-action', 'auto-day-player-slot-open');
      btn.setAttribute('data-player-id', String(seat.id));
      var nickTrim = seat.nick ? seat.nick.trim() : '';
      var foulPillClass =
        'player-slot__foul-pill flex shrink-0 items-center justify-center rounded border px-2 py-1 ' +
        (seat.fouls > 2
          ? 'border-mafia-blood/55 bg-mafia-blood'
          : 'border-mafia-border/35 bg-black/25');
      if (phantom) {
        btn.innerHTML =
          '<div class="player-slot__row grid w-full min-h-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1">' +
          '<div class="flex min-w-0 justify-start"><div class="invisible h-8 w-8" aria-hidden="true"></div></div>' +
          '<span class="font-display text-3xl font-bold leading-none tracking-wide text-mafia-gold/55 tabular-nums sm:text-4xl">№' +
          seat.id +
          '</span>' +
          '<div class="flex min-w-0 justify-end"><div class="invisible h-8 w-8" aria-hidden="true"></div></div>' +
          '</div>' +
          '<div class="player-slot-nick mt-1 mb-2 min-h-[1.75rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/40 bg-black/20 px-2 py-1 text-center font-sans text-sm leading-snug text-mafia-gold/75 italic">Каспер</div>';
      } else {
        btn.innerHTML =
          '<div class="player-slot__row grid w-full min-h-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1">' +
          '<div class="flex min-w-0 justify-start">' +
          autoPlayerStatusHtml(seat) +
          '</div>' +
          '<span class="font-display text-3xl font-bold leading-none tracking-wide text-mafia-gold tabular-nums sm:text-4xl">№' +
          seat.id +
          '</span>' +
          '<div class="flex min-w-0 justify-end">' +
          '<div class="' +
          foulPillClass +
          '"><span class="font-sans font-semibold leading-none tabular-nums text-sm sm:text-base text-mafia-cream/95">ф: ' +
          seat.fouls +
          '</span></div>' +
          '</div>' +
          '</div>' +
          '<div class="player-slot-nick mt-1 mb-2 min-h-[1.75rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-2 py-1 text-center font-sans text-sm leading-snug ' +
          (nickTrim ? 'text-mafia-cream/95' : 'text-mafia-cream/30') +
          '">' +
          (nickTrim ? escapeHtml(nickTrim) : 'Псевдоним') +
          '</div>';
      }
      list.appendChild(btn);
    });
    refreshAutoDaySwitchHostButton();
  }
  A.renderAutoDayPlayers = renderAutoDayPlayers;

  A.patchAutoPlayerSlotStatus = function (seatId) {
    var list = el('auto-day-players-list');
    if (!list) return;
    var btn = list.querySelector('[data-player-id="' + seatId + '"]');
    if (!btn) return;
    var seat = A.seatById(seatId);
    if (!seat) return;
    var row = btn.querySelector('.player-slot__row');
    if (!row || !row.children[0]) return;
    row.children[0].innerHTML = autoPlayerStatusHtml(seat);
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
    if (!seat) return;
    if (A.isPhantomSeat(seat)) return;
    if (seat.fouls >= 4) return;
    A.mutate(function (st) {
      seat.fouls++;
      if (seat.fouls >= 4 && !seat.eliminationReason) {
        seat.fouls = 4;
        seat.eliminationReason = 'disqual';
        seat.alive = false;
        if (st.day) {
          var ix = st.day.nominees.indexOf(seatId);
          if (ix !== -1) st.day.nominees.splice(ix, 1);
        }
      }
    });
    renderAutoDayPlayers();
    refreshAutoDayNominees();
  }
  A.addAutoFoul = addAutoFoul;

  function removeAutoFoul(seatId) {
    var seat = A.seatById(seatId);
    if (!seat || seat.fouls <= 0) return;
    if (A.isPhantomSeat(seat)) return;
    A.mutate(function () {
      seat.fouls--;
    });
    renderAutoDayPlayers();
  }
  A.removeAutoFoul = removeAutoFoul;

  A.setAutoElim = function (seatId, reason) {
    var s = app.autoState;
    var seat = A.seatById(seatId);
    if (!seat) return;
    if (A.isPhantomSeat(seat)) return;
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
  };

  app.skipAutoVote = function () {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) {
      clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
    }
    A.pushHistory();
    s.day.nominees = [];
    A.saveAuto();
    A.transitionToNight((s.nightNum || 0) + 1);
  };

  // ============ Auto player modal ============

  app.showAutoPlayerActionsModal = function (seatId) {
    var seat = A.seatById(seatId);
    if (!seat) return;
    if (A.isPhantomSeat(seat)) return;
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var titleEl = el('modal-auto-player-actions-title');
    if (titleEl) titleEl.textContent = 'Игрок №' + seatId;
    var nickInp = el('modal-auto-player-nick');
    if (nickInp) nickInp.value = seat.nick != null ? String(seat.nick) : '';
    var whenActive = el('modal-auto-player-actions-when-active');
    var whenOut = el('modal-auto-player-actions-when-out');
    var out = !!seat.eliminationReason;
    if (whenActive) whenActive.classList.remove('hidden');
    if (whenOut) whenOut.classList.toggle('hidden', !out);

    var inQueue = app.autoState.day && app.autoState.day.nominees.indexOf(seatId) !== -1;
    var foulBtn = modal.querySelector('[data-action="auto-player-modal-foul"]');
    if (foulBtn) {
      foulBtn.disabled = seat.fouls >= 4;
      foulBtn.classList.toggle('opacity-55', foulBtn.disabled);
      foulBtn.classList.toggle('cursor-not-allowed', foulBtn.disabled);
    }
    var voteBtn = modal.querySelector('[data-action="auto-player-modal-vote"]');
    if (voteBtn) {
      voteBtn.classList.toggle('hidden', out);
      if (!out) voteBtn.textContent = inQueue ? 'Убрать с голосования' : 'Выставить';
    }
    var elims = modal.querySelectorAll('[data-action="auto-player-modal-elim"]');
    var elimOn =
      'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border ring-2 ring-mafia-gold bg-mafia-blood/45 border-mafia-gold text-mafia-gold transition-colors cursor-pointer';
    var elimOff =
      'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border bg-mafia-card text-mafia-cream/80 hover:border-mafia-gold/45 transition-colors cursor-pointer';
    var elimDisabled =
      'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border/45 bg-mafia-card/50 text-mafia-cream/30 opacity-55 cursor-not-allowed';
    for (var ei = 0; ei < elims.length; ei++) {
      var b = elims[ei];
      var er = b.getAttribute('data-elim');
      var isCurrent = seat.eliminationReason === er;
      if (er === 'hang' && !inQueue && !isCurrent) {
        b.disabled = true;
        b.setAttribute('aria-disabled', 'true');
        b.title = 'Сначала выставьте в очередь голосования';
        b.className = elimDisabled;
        continue;
      }
      b.disabled = false;
      b.removeAttribute('aria-disabled');
      b.className = isCurrent ? elimOn : elimOff;
      b.title = app.ELIM_REASON_TITLES[er] || '';
    }
    modal.dataset.playerId = String(seatId);
    if (app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  function syncAutoPlayerNickFromModal() {
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var pidStr = modal.dataset.playerId;
    if (!pidStr) return;
    var pid = parseInt(pidStr, 10);
    if (isNaN(pid)) return;
    var seat = A.seatById(pid);
    if (!seat) return;
    var inp = el('modal-auto-player-nick');
    if (!inp) return;
    var newNick = inp.value.slice(0, 32);
    if (newNick !== (seat.nick || '')) {
      A.pushHistory();
      seat.nick = newNick;
      A.saveAuto();
    }
  }

  app.hideAutoPlayerActionsModal = function () {
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var wasOpen = modal.hasAttribute('data-open');
    if (wasOpen) syncAutoPlayerNickFromModal();
    if (app.modalSetOpen) app.modalSetOpen(modal, false);
    if (wasOpen) {
      var ds = el('auto-day-screen');
      if (ds && ds.classList.contains('active')) renderAutoDayPlayers();
    }
  };

  A.withAutoModalSeatId = function (cb) {
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var pidStr = modal.dataset.playerId;
    if (!pidStr) return;
    var pid = parseInt(pidStr, 10);
    if (!isNaN(pid)) cb(pid);
  };

  app.registerScreenRenderer('auto-day-screen', function () {
    app.renderAutoDay();
  });
})(window.MafiaApp);
