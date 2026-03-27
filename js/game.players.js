(function (app) {
  var escapeHtml = app.escapeHtml;
  var PREPARE_ROLE_LABELS = {
    don: 'Дон',
    sheriff: 'Шериф',
    mafia: 'Мафия',
    peaceful: 'Мирный',
  };
  var PREPARE_ROLE_ICONS = {
    don: 'icon-don',
    sheriff: 'icon-sheriff',
    mafia: 'icon-mafia',
    peaceful: 'icon-like',
  };
  var ELIM_REASON_TITLES = {
    disqual: 'Удалён',
    hang: 'Казнён',
    shot: 'Убит',
  };

  function prepareRoleCodeToLabel(code) {
    return PREPARE_ROLE_LABELS[code] || PREPARE_ROLE_LABELS.peaceful;
  }

  function prepareRoleCodeToIconId(code) {
    return PREPARE_ROLE_ICONS[code] || PREPARE_ROLE_ICONS.peaceful;
  }

  function prepareRoleIconWrapClass(code) {
    var isMafiaSide = code === 'mafia' || code === 'don';
    if (isMafiaSide) {
      return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-border bg-mafia-black text-mafia-gold sm:h-9 sm:w-9';
    }
    return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-gold/40 bg-mafia-blood text-mafia-gold sm:h-9 sm:w-9';
  }

  function renderPrepareModalRoleRadios(selectedCode) {
    var row = document.getElementById('modal-player-prepare-role-icons');
    if (!row) return;
    row.innerHTML = '';
    var opts = [
      { value: 'peaceful', label: 'Мирный житель' },
      { value: 'mafia', label: 'Мафия' },
      { value: 'don', label: 'Дон' },
      { value: 'sheriff', label: 'Шериф' },
    ];
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

  function getPrepareModalSelectedRoleCode() {
    var row = document.getElementById('modal-player-prepare-role-icons');
    if (!row) return null;
    var picked = row.querySelector('[role="radio"][aria-checked="true"]');
    return picked && picked.getAttribute('data-role-code') ? picked.getAttribute('data-role-code') : null;
  }

  function playerSlotStatusHtml(p) {
    var inVoteQueue = app.nomineeQueue.indexOf(p.id) !== -1;
    if (p.eliminationReason) {
      return (
        '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-blood/50 bg-mafia-blood/10 text-mafia-blood" aria-hidden="true"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-elim-' +
        p.eliminationReason +
        '"/></svg></div>'
      );
    }
    if (inVoteQueue) {
      return (
        '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-gold/70 bg-mafia-blood/15 text-mafia-gold" title="Выставлен" aria-label="Выставлен"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-nominated"/></svg></div>'
      );
    }
    return (
      '<div class="invisible flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-transparent" aria-hidden="true"></div>'
    );
  }

  app.pickPrepareModalRole = function (roleCode) {
    if (roleCode !== 'peaceful' && roleCode !== 'mafia' && roleCode !== 'don' && roleCode !== 'sheriff') {
      return;
    }
    var m = document.getElementById('modal-player-actions');
    if (!m || m.getAttribute('data-mode') !== 'prepare') return;
    renderPrepareModalRoleRadios(roleCode);
  };

  app.getActivePlayerCount = function () {
    var c = 0;
    for (var ai = 0; ai < app.players.length; ai++) {
      if (!app.players[ai].eliminationReason) c++;
    }
    return c;
  };

  app.syncPlayerNickFromModal = function () {
    var m = document.getElementById('modal-player-actions');
    var inp = document.getElementById('modal-player-nick');
    if (!m || !inp) return;
    var pidStr = m.dataset.playerId;
    if (pidStr === undefined || pidStr === '') return;
    var pid = parseInt(pidStr, 10);
    if (isNaN(pid)) return;
    var pl = app.players.find(function (x) {
      return x.id === pid;
    });
    if (!pl) return;
    pl.nick = inp.value.slice(0, 32);
    var mode = m.dataset.mode || '';
    if (mode === 'prepare') {
      var seatIndex = app.players.indexOf(pl);
      var roleCode = getPrepareModalSelectedRoleCode();
      if (roleCode) {
        if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object') {
          app.summaryRoleByPlayerId = {};
        }
        app.summaryRoleByPlayerId[String(pid)] = roleCode;
      } else if (app.summaryRoleByPlayerId && app.getEffectiveSummaryRoleCode) {
        app.summaryRoleByPlayerId[String(pid)] = app.getEffectiveSummaryRoleCode(pid, seatIndex);
      }
    }
    app.saveState();
  };

  app.hidePlayerActionsModal = function () {
    var m = document.getElementById('modal-player-actions');
    var wasOpen = m && m.hasAttribute('data-open');
    if (wasOpen) app.syncPlayerNickFromModal();
    if (m) app.modalSetOpen(m, false);
    if (wasOpen) {
      var gs = document.getElementById('game-screen');
      var ps = document.getElementById('prepare-screen');
      if (gs && gs.classList.contains('active') && app.renderPlayers) app.renderPlayers();
      if (ps && ps.classList.contains('active') && app.renderPreparePlayers) {
        app.renderPreparePlayers();
      }
    }
  };

  app.showPlayerActionsModal = function (id) {
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    var m = document.getElementById('modal-player-actions');
    if (!m) return;
    var title = document.getElementById('modal-player-actions-title');
    var whenActive = document.getElementById('modal-player-actions-when-active');
    var whenOut = document.getElementById('modal-player-actions-when-out');
    var gameScreen = document.getElementById('game-screen');
    var prepareScreen = document.getElementById('prepare-screen');
    var inGameScreen = !!(gameScreen && gameScreen.classList.contains('active'));
    var inPrepareScreen = !!(prepareScreen && prepareScreen.classList.contains('active'));
    var nickOnlyMode = inPrepareScreen && !inGameScreen;
    if (title) title.textContent = 'Игрок №' + id;
    var inQueue = app.nomineeQueue.indexOf(id) !== -1;
    var out = !!p.eliminationReason;
    m.dataset.mode = nickOnlyMode ? 'prepare' : 'game';
    var prepRoleSection = document.getElementById('modal-player-prepare-role-section');
    if (prepRoleSection) prepRoleSection.classList.toggle('hidden', !nickOnlyMode);
    if (nickOnlyMode && app.getEffectiveSummaryRoleCode) {
      var seatIndex = app.players.indexOf(p);
      renderPrepareModalRoleRadios(app.getEffectiveSummaryRoleCode(id, seatIndex));
    }
    if (whenActive && whenOut) {
      if (nickOnlyMode) {
        whenActive.classList.add('hidden');
        whenOut.classList.add('hidden');
      } else if (out) {
        whenActive.classList.add('hidden');
        whenOut.classList.remove('hidden');
      } else {
        whenActive.classList.remove('hidden');
        whenOut.classList.add('hidden');
      }
    }
    if (!out && !nickOnlyMode) {
      var foulBtn = m.querySelector('[data-action="player-modal-foul"]');
      var voteBtn = m.querySelector('[data-action="player-modal-vote"]');
      if (foulBtn) {
        foulBtn.disabled = false;
        foulBtn.className =
          'w-full py-3 rounded border border-mafia-border bg-mafia-card hover:bg-mafia-border text-mafia-cream font-semibold text-sm uppercase tracking-wider cursor-pointer transition-colors';
      }
      var voteGold =
        'w-full py-3 rounded border-2 border-mafia-gold/60 bg-mafia-blood/30 hover:bg-mafia-blood/45 text-mafia-gold font-semibold text-sm uppercase tracking-wider cursor-pointer transition-colors';
      if (voteBtn) {
        voteBtn.disabled = false;
        if (inQueue) {
          voteBtn.textContent = 'Убрать с голосования';
          voteBtn.className = voteGold;
        } else {
          voteBtn.textContent = 'Выставить';
          voteBtn.className = voteGold;
        }
      }
      var elims = m.querySelectorAll('[data-action="player-modal-elim"]');
      var elimOn =
        'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border ring-2 ring-mafia-gold bg-mafia-blood/45 border-mafia-gold text-mafia-gold transition-colors cursor-pointer';
      var elimOff =
        'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border bg-mafia-card text-mafia-cream/80 hover:border-mafia-gold/45 transition-colors cursor-pointer';
      var elimHangDisabled =
        'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border/45 bg-mafia-card/50 text-mafia-cream/30 opacity-55 cursor-not-allowed';
      for (var ei = 0; ei < elims.length; ei++) {
        var elimBtn = elims[ei];
        var er = elimBtn.getAttribute('data-elim');
        if (er === 'hang' && !inQueue) {
          elimBtn.disabled = true;
          elimBtn.setAttribute('aria-disabled', 'true');
          elimBtn.title = 'Сначала выставьте в очередь голосования';
          elimBtn.className = elimHangDisabled;
          continue;
        }
        elimBtn.disabled = false;
        elimBtn.removeAttribute('aria-disabled');
        elimBtn.className = p.eliminationReason === er ? elimOn : elimOff;
        elimBtn.title = ELIM_REASON_TITLES[er] || '';
      }
    }
    m.dataset.playerId = String(id);
    var nickInp = document.getElementById('modal-player-nick');
    if (nickInp) nickInp.value = p.nick != null ? String(p.nick) : '';
    app.modalSetOpen(m, true);
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
    var voteScr = document.getElementById('vote-screen');
    if (voteScr && voteScr.classList.contains('active') && app.renderVoteScreen) {
      app.renderVoteScreen();
    }
    app.saveState();
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
    row.children[0].innerHTML = playerSlotStatusHtml(p);
  };

  app.renderPlayers = function () {
    return app.renderPlayersTo('players-list');
  };

  app.renderPreparePlayers = function () {
    var list = document.getElementById('prepare-players-list');
    if (!list) return false;
    list.className =
      'grid grid-flow-col grid-cols-2 grid-rows-5 gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.innerHTML = '';
    app.players.forEach(function (p, seatIndex) {
      var nickTrim = p.nick != null ? String(p.nick).trim() : '';
      var roleCode = app.getEffectiveSummaryRoleCode
        ? app.getEffectiveSummaryRoleCode(p.id, seatIndex)
        : 'peaceful';
      var roleLabel = prepareRoleCodeToLabel(roleCode);
      var iconId = prepareRoleCodeToIconId(roleCode);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'player-cell player-slot flex h-full min-h-0 min-w-0 w-full flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-2 pt-2 pb-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2.5 sm:pt-2.5 sm:pb-1.5';
      btn.setAttribute('data-action', 'player-slot-open');
      btn.setAttribute('data-player-id', String(p.id));
      btn.setAttribute(
        'aria-label',
        (nickTrim ? 'Игрок №' + p.id + ', псевдоним ' + nickTrim : 'Игрок №' + p.id) + ', роль ' + roleLabel
      );

      var nickRowClass =
        'player-slot-nick mt-1 mb-1 min-h-[1.6rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-2 py-1 text-center font-sans text-sm leading-snug ' +
        (nickTrim ? 'text-mafia-cream/95' : 'text-mafia-cream/30');

      btn.innerHTML =
        '<div class="player-slot__row grid w-full min-h-0 shrink-0 grid-cols-3 items-center gap-x-2">' +
        '<div class="' +
        prepareRoleIconWrapClass(roleCode) +
        '" aria-hidden="true">' +
        '<svg class="h-5 w-5 pointer-events-none sm:h-[1.35rem] sm:w-[1.35rem]" aria-hidden="true"><use href="#' +
        iconId +
        '"/></svg>' +
        '</div>' +
        '<span class="font-display text-2xl font-bold leading-none tracking-wide text-mafia-gold tabular-nums sm:text-3xl text-center">№' +
        p.id +
        '</span>' +
        '<div class="invisible h-8 w-8 sm:h-9 sm:w-9" aria-hidden="true"></div>' +
        '</div>' +
        '<div class="' +
        nickRowClass +
        '" role="presentation">' +
        (nickTrim ? escapeHtml(nickTrim) : 'Псевдоним') +
        '</div>';

      list.appendChild(btn);
    });
    return true;
  };

  app.renderPlayersTo = function (targetId) {
    var list = document.getElementById(targetId || 'players-list');
    if (!list) return false;
    list.className =
      'grid grid-flow-col grid-cols-2 grid-rows-5 gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.innerHTML = '';
    app.players.forEach(function (p) {
      var out = !!p.eliminationReason;
      var statusHtml = playerSlotStatusHtml(p);
      var foulClass =
        'font-display text-sm font-semibold leading-none tabular-nums sm:text-base ' +
        (p.fouls >= 3 ? 'text-mafia-blood' : 'text-mafia-cream/95');
      var foulInner = '<span class="' + foulClass + '">Ф: ' + p.fouls + '</span>';
      var nickTrim = p.nick != null ? String(p.nick).trim() : '';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'player-cell player-slot flex h-full min-h-0 min-w-0 w-full flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-2 pt-2 pb-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2.5 sm:pt-2.5 sm:pb-1.5' +
        (out ? ' opacity-[0.55]' : '');
      btn.setAttribute('data-action', 'player-slot-open');
      btn.setAttribute('data-player-id', String(p.id));
      btn.setAttribute(
        'aria-label',
        nickTrim ? 'Игрок №' + p.id + ', псевдоним ' + nickTrim : 'Игрок №' + p.id
      );
      var nickRowClass =
        'player-slot-nick mt-1 mb-2 min-h-[1.75rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-2 py-1 text-center font-sans text-sm leading-snug ' +
        (nickTrim ? 'text-mafia-cream/95' : 'text-mafia-cream/30');
      btn.innerHTML =
        '<div class="player-slot__row grid w-full min-h-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1">' +
        '<div class="flex min-w-0 justify-start">' +
        statusHtml +
        '</div>' +
        '<span class="font-display text-3xl font-bold leading-none tracking-wide text-mafia-gold tabular-nums sm:text-4xl">№' +
        p.id +
        '</span>' +
        '<div class="flex min-w-0 justify-end">' +
        '<div class="player-slot__foul-pill flex shrink-0 items-center justify-center rounded border border-mafia-border/35 bg-black/25 px-2 py-1">' +
        foulInner +
        '</div></div></div>' +
        '<div class="' +
        nickRowClass +
        '" role="presentation">' +
        (nickTrim ? escapeHtml(nickTrim) : 'Псевдоним') +
        '</div>';

      list.appendChild(btn);
    });
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

  app.addFoul = function (id) {
    const p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p || p.eliminationReason) return;
    p.fouls++;
    if (p.fouls >= 4) {
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
    app.renderPlayers();
    var voteScr = document.getElementById('vote-screen');
    if (voteScr && voteScr.classList.contains('active') && app.renderVoteScreen) {
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
    app.renderPlayers();
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
    var voteScr = document.getElementById('vote-screen');
    if (voteScr && voteScr.classList.contains('active') && app.renderVoteScreen) {
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
})(window.MafiaApp);
