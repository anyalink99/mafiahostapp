(function (app) {
  var escapeHtml = app.escapeHtml;

  function prepareRoleCodeToLabel(code) {
    if (code === 'don') return 'Дон';
    if (code === 'sheriff') return 'Шериф';
    if (code === 'mafia') return 'Мафия';
    return 'Мирный';
  }

  function prepareRoleCodeToIconId(code) {
    if (code === 'don') return 'icon-don';
    if (code === 'sheriff') return 'icon-sheriff';
    if (code === 'mafia') return 'icon-mafia';
    return 'icon-like';
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
      } else
      if (out) {
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
        if (er === 'disqual') elimBtn.title = 'Удалён';
        else if (er === 'hang') elimBtn.title = 'Казнён';
        else if (er === 'shot') elimBtn.title = 'Убит';
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

  app.arraysEqual = function (a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  app.startVoteRoundFromNomineeQueue = function () {
    var q = app.nomineeQueue;
    app.activeVoteRound = {
      phase: 'counting',
      poolTotal: app.getActivePlayerCount(),
      candidateIds: q.slice(),
      votes: q.map(function () {
        return null;
      }),
      baseVotingOrder: q.slice(),
      tieRevote: false,
    };
    app.saveState();
  };

  app.prepareVoteRoundScreen = function () {
    var s0 = app.activeVoteRound;
    if (s0 && s0.phase === 'done' && s0.winnerId != null) {
      app.finalizeVoteHang([s0.winnerId]);
      return;
    }
    if (s0 && s0.phase === 'raiseAll') return;
    if (app.nomineeQueue.length < 2) {
      app.navigateToScreen('game-screen');
      return;
    }
    var s = app.activeVoteRound;
    if (s && s.phase === 'counting') {
      if (s.tieRevote) return;
      if (app.arraysEqual(s.baseVotingOrder, app.nomineeQueue)) return;
    }
    app.startVoteRoundFromNomineeQueue();
  };

  app.voteAvailableForIndex = function (session, index) {
    var used = 0;
    for (var j = 0; j < session.votes.length; j++) {
      if (j === index) continue;
      var v = session.votes[j];
      if (v !== null && v !== undefined) used += v;
    }
    return Math.max(0, session.poolTotal - used);
  };

  app.isLastVoteSlotToFill = function (session, index) {
    for (var j = 0; j < session.votes.length; j++) {
      if (j === index) continue;
      if (session.votes[j] === null || session.votes[j] === undefined) return false;
    }
    return true;
  };

  app.finalizeVoteHang = function (ids, raiseAllPickedVotes) {
    var vsSnap = app.activeVoteRound;
    var cand =
      vsSnap && vsSnap.candidateIds
        ? vsSnap.candidateIds.slice()
        : vsSnap && vsSnap.raiseCandidateIds
          ? vsSnap.raiseCandidateIds.slice()
          : [];
    var vts = vsSnap && vsSnap.votes ? vsSnap.votes.slice() : [];
    var viaRA = !!(vsSnap && vsSnap.phase === 'raiseAll');
    app.gameLog.push({
      type: 'vote_hang',
      ts: Date.now(),
      eliminatedIds: ids.slice(),
      candidateIds: cand,
      votes: vts,
      tieRevote: !!(vsSnap && vsSnap.tieRevote),
      viaRaiseAll: viaRA,
      raiseAllVotes: viaRA && typeof raiseAllPickedVotes === 'number' ? raiseAllPickedVotes : undefined,
      raiseAllPoolTotal: viaRA && vsSnap && typeof vsSnap.poolTotal === 'number' ? vsSnap.poolTotal : undefined,
    });
    for (var hi = 0; hi < ids.length; hi++) {
      var p = app.players.find(function (x) {
        return x.id === ids[hi];
      });
      if (p) p.eliminationReason = 'hang';
    }
    app.nomineeQueue = [];
    app.activeVoteRound = null;
    app.refreshNomineeQueueUi();
    app.renderPlayers();
    app.saveState();
    app.navigateToScreen('game-screen');
  };

  app.applyRaiseAllPick = function (value) {
    var s = app.activeVoteRound;
    if (!s || s.phase !== 'raiseAll') return;
    var n = s.poolTotal;
    if (value < 0 || value > n) return;
    var majority = value > n / 2;
    if (majority) {
      app.finalizeVoteHang(s.raiseCandidateIds, value);
    } else {
      app.gameLog.push({
        type: 'vote_no_elimination',
        ts: Date.now(),
        votesCast: value,
        poolTotal: n,
        tiedIds: s.raiseCandidateIds.slice(),
      });
      app.nomineeQueue = [];
      app.activeVoteRound = null;
      app.refreshNomineeQueueUi();
      app.saveState();
      app.navigateToScreen('game-screen');
    }
  };

  app.tryFinalizeVoteRound = function () {
    var s = app.activeVoteRound;
    if (!s || s.phase !== 'counting') return;
    for (var i = 0; i < s.votes.length; i++) {
      if (s.votes[i] === null || s.votes[i] === undefined) return;
    }
    var maxV = -1;
    for (var k = 0; k < s.votes.length; k++) {
      if (s.votes[k] > maxV) maxV = s.votes[k];
    }
    var tied = [];
    for (var t = 0; t < s.candidateIds.length; t++) {
      if (s.votes[t] === maxV) tied.push(s.candidateIds[t]);
    }
    if (tied.length >= 2) {
      app.gameLog.push({
        type: 'vote_tie',
        ts: Date.now(),
        candidateIds: s.candidateIds.slice(),
        votes: s.votes.slice(),
        tiedIds: tied.slice(),
        isRevote: !!s.tieRevote,
      });
      if (!s.tieRevote) {
        s.candidateIds = tied;
        s.votes = tied.map(function () {
          return null;
        });
        s.tieRevote = true;
        s.baseVotingOrder = tied.slice();
        app.nomineeQueue = tied.slice();
        app.saveState();
        app.navigateToScreen('game-screen');
        app.resetTimer(30);
        return;
      }
      app.gameLog.push({
        type: 'vote_raise_all',
        ts: Date.now(),
        poolTotal: s.poolTotal,
        tiedIds: tied.slice(),
      });
      app.activeVoteRound = {
        phase: 'raiseAll',
        poolTotal: s.poolTotal,
        raiseCandidateIds: tied.slice(),
      };
      app.saveState();
      return;
    }
    app.finalizeVoteHang([tied[0]]);
  };

  app.hideVoteCountModal = function () {
    var m = document.getElementById('modal-vote-count');
    if (m) app.modalSetOpen(m, false);
    app._voteModalIndex = null;
    app._voteModalOpenedAt = 0;
  };

  app.showVoteCountModal = function (candidateIndex) {
    var s = app.activeVoteRound;
    if (!s || s.phase !== 'counting') return;
    var rem = app.voteAvailableForIndex(s, candidateIndex);
    var lastSlot = app.isLastVoteSlotToFill(s, candidateIndex);
    var cap = lastSlot ? rem : Math.min(10, rem);
    var id = s.candidateIds[candidateIndex];
    var title = document.getElementById('modal-vote-count-title');
    var sub = document.getElementById('modal-vote-count-sub');
    var grid = document.getElementById('modal-vote-count-grid');
    if (!grid) return;
    if (title) title.textContent = 'Голосов за №' + id;
    if (sub) {
      if (lastSlot) {
        sub.textContent = 'Осталось только это количество голосов в пуле.';
        sub.classList.remove('hidden');
        sub.setAttribute('aria-hidden', 'false');
      } else {
        sub.textContent = '';
        sub.classList.add('hidden');
        sub.setAttribute('aria-hidden', 'true');
      }
    }
    grid.className = lastSlot
      ? 'grid grid-cols-1 gap-2 max-w-[12rem] mx-auto'
      : 'grid grid-cols-4 gap-2';
    grid.innerHTML = '';
    var from = lastSlot ? rem : 0;
    var to = lastSlot ? rem : cap;
    for (var n = from; n <= to; n++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-action', 'vote-count-pick');
      b.setAttribute('data-value', String(n));
      b.className =
        'py-3 rounded border border-mafia-border bg-mafia-card hover:bg-mafia-blood/30 text-mafia-cream font-semibold tabular-nums cursor-pointer transition-colors';
      b.textContent = String(n);
      grid.appendChild(b);
    }
    app._voteModalIndex = candidateIndex;
    var m = document.getElementById('modal-vote-count');
    if (!m) return;
    var vs = document.getElementById('vote-screen');
    if (!vs || !vs.classList.contains('active')) return;
    var sess = app.activeVoteRound;
    if (!sess || sess.phase !== 'counting') return;
    app._voteModalOpenedAt = Date.now();
    app.modalSetOpen(m, true);
  };

  app.applyVoteCountPick = function (value) {
    var idx = app._voteModalIndex;
    app.hideVoteCountModal();
    if (idx === null || idx === undefined) return;
    var s = app.activeVoteRound;
    if (!s || s.phase !== 'counting') return;
    var rem = app.voteAvailableForIndex(s, idx);
    if (app.isLastVoteSlotToFill(s, idx)) {
      if (value !== rem) return;
    } else {
      var cap = Math.min(10, rem);
      if (value < 0 || value > cap) return;
    }
    s.votes[idx] = value;
    app.saveState();
    app.tryFinalizeVoteRound();
    app.renderVoteScreen();
  };

  app.renderVoteScreen = function () {
    var wrap = document.getElementById('vote-candidates');
    var banner = document.getElementById('vote-revote-banner');
    var hint = document.getElementById('vote-pool-hint');
    if (!wrap) return;

    var s = app.activeVoteRound;
    if (!s) {
      wrap.innerHTML = '';
      app.refreshNomineeQueueUi();
      return;
    }

    if (s.phase === 'done' && s.winnerId != null) {
      app.finalizeVoteHang([s.winnerId]);
      return;
    }

    if (s.phase === 'raiseAll') {
      if (banner) {
        banner.classList.remove('hidden');
        var rc = (s.raiseCandidateIds || []).length;
        banner.textContent =
          rc === 2 ? 'Голосование за поднятие обоих' : 'Голосование за поднятие всех';
      }
      if (hint) hint.textContent = '';
      wrap.innerHTML = '';
      var cap = s.poolTotal;
      for (var r = 0; r <= cap; r++) {
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.setAttribute('data-action', 'raise-all-pick');
        rb.setAttribute('data-value', String(r));
        rb.className =
          'py-3 min-w-[3.25rem] px-3 rounded border border-mafia-border bg-mafia-card hover:bg-mafia-blood/30 text-mafia-cream font-semibold tabular-nums cursor-pointer transition-colors';
        rb.textContent = String(r);
        wrap.appendChild(rb);
      }
      app.refreshNomineeQueueUi();
      return;
    }

    if (banner) {
      if (s.tieRevote) {
        banner.classList.remove('hidden');
        banner.textContent = 'Переголосование между игроками:';
      } else {
        banner.classList.add('hidden');
      }
    }

    if (hint) {
      hint.textContent = '';
    }

    wrap.innerHTML = '';
    for (var i = 0; i < s.candidateIds.length; i++) {
      var pid = s.candidateIds[i];
      var assigned = s.votes[i];
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.setAttribute('data-action', 'vote-open-count');
      tile.setAttribute('data-candidate-index', String(i));
      tile.className =
        'vote-candidate-tile flex flex-col items-center justify-center min-w-[4.5rem] sm:min-w-[5.5rem] px-4 py-4 rounded-lg border-2 border-mafia-gold/50 bg-mafia-coal hover:border-mafia-gold hover:bg-mafia-blood/20 transition-colors cursor-pointer active:scale-[0.98]';
      var num = document.createElement('span');
      num.className = 'font-display font-bold text-4xl sm:text-5xl text-mafia-gold tabular-nums leading-none';
      num.textContent = String(pid);
      var sub = document.createElement('span');
      sub.className = 'mt-2 text-xs text-mafia-cream/70 text-center max-w-[6rem]';
      sub.textContent =
        'Голосов: ' + (assigned !== null && assigned !== undefined ? assigned : 0);
      tile.appendChild(num);
      tile.appendChild(sub);
      wrap.appendChild(tile);
    }
    app.refreshNomineeQueueUi();
  };

  app.syncTimerAppearance = function () {
    const el = document.getElementById('timer');
    if (!el) return;
    const urgent = app.timeLeft <= 10;
    el.classList.toggle('text-mafia-gold', !urgent);
    el.classList.toggle('text-mafia-blood', urgent);
  };

  app.TIMER_VOICE_KEY = 'mafia_host_timer_voice';
  app.TIMER_VOICE_DUCK_KEY = 'mafia_host_timer_voice_duck';
  app.TIMER_VOICE_DUCK_MUL_KEY = 'mafia_host_timer_voice_duck_mul';
  app.TIMER_VOICE_VOL_KEY = 'mafia_host_timer_voice_vol';
  app.VOICE_VOL_NO_MUSIC_KEY = 'mafia_host_voice_vol_no_music';
  app.VOICE_VOL_WITH_MUSIC_KEY = 'mafia_host_voice_vol_with_music';
  app.VOICE_RATE_KEY = 'mafia_host_voice_rate';
  app.NIGHT_ACTIONS_WAIT_SEC_KEY = 'mafia_host_night_actions_wait_sec';

  var TIMER_VOICE_FILES = {
    discuss10: 'you-have-10-seconds.mp3',
    discuss0: 'thank-you-stop.mp3',
    mafia10: 'mafia-10-seconds.mp3',
    mafia0: 'mafia-leaves.mp3',
  };

  function timerVoiceUrl(filename) {
    return new URL('audio/' + encodeURIComponent(filename), window.location.href).href;
  }

  app.loadTimerVoicePref = function () {
    try {
      var v = localStorage.getItem(app.TIMER_VOICE_KEY);
      app.timerVoiceEnabled = v === '1';
    } catch (e) {
      app.timerVoiceEnabled = false;
    }
    app.loadTimerVoiceDuckPrefs();
    app.loadTimerVoiceVolumePref();
    app.loadVoiceVolumePrefs();
    app.loadVoiceRatePref();
    app.loadNightActionsWaitPref();
  };

  function clamp01(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }

  function clampVoiceRate(x) {
    if (x < 1) return 1;
    if (x > 2) return 2;
    return x;
  }

  function hasNumber(x) {
    return typeof x === 'number' && !isNaN(x);
  }

  app.loadVoiceVolumePrefs = function () {
    var fallback = hasNumber(app.timerVoiceVolume) ? clamp01(app.timerVoiceVolume) : 0.92;
    var gotAny = false;

    try {
      var v1 = parseFloat(localStorage.getItem(app.VOICE_VOL_NO_MUSIC_KEY));
      if (!isNaN(v1)) {
        app.voiceVolumeNoMusic = clamp01(v1);
        gotAny = true;
      }
    } catch (e) {}

    try {
      var v2 = parseFloat(localStorage.getItem(app.VOICE_VOL_WITH_MUSIC_KEY));
      if (!isNaN(v2)) {
        app.voiceVolumeWithMusic = clamp01(v2);
        gotAny = true;
      }
    } catch (e) {}

    if (!gotAny) {
      app.voiceVolumeNoMusic = fallback;
      app.voiceVolumeWithMusic = fallback;
    } else {
      if (!hasNumber(app.voiceVolumeNoMusic)) app.voiceVolumeNoMusic = fallback;
      if (!hasNumber(app.voiceVolumeWithMusic)) app.voiceVolumeWithMusic = fallback;
      app.voiceVolumeNoMusic = clamp01(app.voiceVolumeNoMusic);
      app.voiceVolumeWithMusic = clamp01(app.voiceVolumeWithMusic);
    }
  };

  app.saveVoiceVolumePrefs = function () {
    try {
      localStorage.setItem(app.VOICE_VOL_NO_MUSIC_KEY, String(clamp01(app.voiceVolumeNoMusic)));
      localStorage.setItem(app.VOICE_VOL_WITH_MUSIC_KEY, String(clamp01(app.voiceVolumeWithMusic)));
    } catch (e) {}
  };

  app.loadVoiceRatePref = function () {
    try {
      var v = parseFloat(localStorage.getItem(app.VOICE_RATE_KEY));
      if (!isNaN(v)) {
        app.voiceRate = clampVoiceRate(v);
        return;
      }
    } catch (e) {}
    if (!hasNumber(app.voiceRate)) app.voiceRate = 1.0;
    app.voiceRate = clampVoiceRate(app.voiceRate);
  };

  app.saveVoiceRatePref = function () {
    try {
      localStorage.setItem(app.VOICE_RATE_KEY, String(clampVoiceRate(app.voiceRate)));
    } catch (e) {}
  };

  app.loadTimerVoiceDuckPrefs = function () {
    try {
      var d = localStorage.getItem(app.TIMER_VOICE_DUCK_KEY);
      app.timerVoiceDuckEnabled = d !== '0';
    } catch (e) {
      app.timerVoiceDuckEnabled = true;
    }
    try {
      var m = parseFloat(localStorage.getItem(app.TIMER_VOICE_DUCK_MUL_KEY));
      if (!isNaN(m)) {
        if (m < 0.05) m = 0.05;
        if (m > 1) m = 1;
        app.timerVoiceDuckMul = m;
      } else {
        app.timerVoiceDuckMul = 0.38;
      }
    } catch (e) {
      app.timerVoiceDuckMul = 0.38;
    }
  };

  app.loadTimerVoiceVolumePref = function () {
    try {
      var v = parseFloat(localStorage.getItem(app.TIMER_VOICE_VOL_KEY));
      if (!isNaN(v)) {
        if (v < 0) v = 0;
        if (v > 1) v = 1;
        app.timerVoiceVolume = v;
        return;
      }
    } catch (e) {}
    if (typeof app.timerVoiceVolume !== 'number' || isNaN(app.timerVoiceVolume)) app.timerVoiceVolume = 0.92;
  };

  app.saveTimerVoiceVolumePref = function () {
    try {
      localStorage.setItem(app.TIMER_VOICE_VOL_KEY, String(app.timerVoiceVolume));
    } catch (e) {}
  };

  app.loadNightActionsWaitPref = function () {
    try {
      var v = parseInt(localStorage.getItem(app.NIGHT_ACTIONS_WAIT_SEC_KEY), 10);
      if (!isNaN(v)) {
        if (v < 0) v = 0;
        if (v > 20) v = 20;
        app.nightActionsWaitSec = v;
        return;
      }
    } catch (e) {}
    if (typeof app.nightActionsWaitSec !== 'number' || isNaN(app.nightActionsWaitSec)) {
      app.nightActionsWaitSec = 10;
    }
  };

  app.saveNightActionsWaitPref = function () {
    try {
      localStorage.setItem(app.NIGHT_ACTIONS_WAIT_SEC_KEY, String(app.nightActionsWaitSec));
    } catch (e) {}
  };

  app.saveTimerVoicePref = function () {
    try {
      localStorage.setItem(app.TIMER_VOICE_KEY, app.timerVoiceEnabled ? '1' : '0');
    } catch (e) {}
  };

  app.saveTimerVoiceDuckPrefs = function () {
    try {
      localStorage.setItem(app.TIMER_VOICE_DUCK_KEY, app.timerVoiceDuckEnabled ? '1' : '0');
      localStorage.setItem(app.TIMER_VOICE_DUCK_MUL_KEY, String(app.timerVoiceDuckMul));
    } catch (e) {}
  };

  app.syncTimerVoiceCheckbox = function () {
    var cb = document.getElementById('setting-timer-voice');
    if (cb) cb.checked = !!app.timerVoiceEnabled;
    if (app.syncTimerVoiceDuckControls) app.syncTimerVoiceDuckControls();
    if (app.syncTimerVoiceExtraControls) app.syncTimerVoiceExtraControls();
  };

  app.syncTimerVoiceDuckControls = function () {
    var duckCb = document.getElementById('setting-timer-voice-duck');
    var mulInp = document.getElementById('setting-timer-voice-duck-mul');
    var mulLabel = document.getElementById('setting-timer-voice-duck-mul-label');
    var block = document.getElementById('timer-voice-duck-block');
    if (duckCb) {
      duckCb.checked = !!app.timerVoiceDuckEnabled;
    }
    var mul = typeof app.timerVoiceDuckMul === 'number' ? app.timerVoiceDuckMul : 0.38;
    if (mulInp) {
      mulInp.value = String(mul);
    }
    if (mulLabel) mulLabel.textContent = Math.round(mul * 100) + '%';
    if (block) {
      block.classList.toggle('timer-voice-duck-block--inactive', false);
    }
    var mulWrap = document.getElementById('timer-voice-duck-mul-wrap');
    if (mulWrap) {
      mulWrap.classList.toggle('timer-voice-duck-mul-wrap--inactive', !app.timerVoiceDuckEnabled);
    }
  };

  function syncTimerVoiceVolumeControls() {
    var noInp = document.getElementById('setting-voice-vol-no-music');
    var noLab = document.getElementById('setting-voice-vol-no-music-label');
    var withInp = document.getElementById('setting-voice-vol-with-music');
    var withLab = document.getElementById('setting-voice-vol-with-music-label');
    var rateInp = document.getElementById('setting-voice-rate');
    var rateLab = document.getElementById('setting-voice-rate-label');

    var vNo = hasNumber(app.voiceVolumeNoMusic) ? clamp01(app.voiceVolumeNoMusic) : 0.92;
    var vWith = hasNumber(app.voiceVolumeWithMusic) ? clamp01(app.voiceVolumeWithMusic) : 0.92;
    var rate = hasNumber(app.voiceRate) ? clampVoiceRate(app.voiceRate) : 1.0;

    if (noInp) {
      noInp.value = String(vNo);
    }
    if (noLab) noLab.textContent = Math.round(vNo * 100) + '%';

    if (withInp) {
      withInp.value = String(vWith);
    }
    if (withLab) withLab.textContent = Math.round(vWith * 100) + '%';

    if (rateInp) {
      rateInp.value = String(rate);
    }
    if (rateLab) rateLab.textContent = rate.toFixed(2).replace(/\.00$/, '') + 'x';
  }

  function syncNightActionsWaitControls() {
    var inp = document.getElementById('setting-night-wait');
    var lab = document.getElementById('setting-night-wait-label');
    var v = typeof app.nightActionsWaitSec === 'number' && !isNaN(app.nightActionsWaitSec) ? app.nightActionsWaitSec : 10;
    v = Math.round(v);
    if (v < 0) v = 0;
    if (v > 20) v = 20;
    if (inp) inp.value = String(v);
    if (lab) lab.textContent = String(v);
  }

  app.syncTimerVoiceExtraControls = function () {
    syncTimerVoiceVolumeControls();
    syncNightActionsWaitControls();
  };

  function setTimerVoiceButtonPlaying(playing) {
    var btn = document.getElementById('btn-timer-voice');
    if (!btn) return;
    btn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    if (playing) {
      btn.classList.remove('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.add('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    } else {
      btn.classList.add('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.remove('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    }
  }

  function setNightActionsButtonActive(active) {
    var btn = document.getElementById('btn-night-actions');
    if (!btn) return;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      btn.classList.remove('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.add('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    } else {
      btn.classList.add('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.remove('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    }
  }

  function voiceUiStart() {
    app._voicePlayingCount = (app._voicePlayingCount || 0) + 1;
    setTimerVoiceButtonPlaying(true);
  }

  function voiceUiEnd() {
    app._voicePlayingCount = Math.max(0, (app._voicePlayingCount || 0) - 1);
    if ((app._voicePlayingCount || 0) === 0) setTimerVoiceButtonPlaying(false);
  }

  function isAnyMusicPlaying() {
    return !!(app.isMusicPlaying && app.isMusicPlaying());
  }

  function getEffectiveVoiceVolume() {
    var v = isAnyMusicPlaying() ? app.voiceVolumeWithMusic : app.voiceVolumeNoMusic;
    if (!hasNumber(v)) {
      var fallback = hasNumber(app.timerVoiceVolume) ? app.timerVoiceVolume : 0.92;
      v = fallback;
    }
    return clamp01(v);
  }

  function getEffectiveVoiceRate() {
    var r = app.voiceRate;
    if (!hasNumber(r)) r = 1.0;
    return clampVoiceRate(r);
  }

  app.playTimerVoiceCue = function (kind) {
    if (!app.timerVoiceEnabled) return;
    var night =
      app.getCurrentMusicSlot &&
      app.getCurrentMusicSlot() === '2' &&
      app.isMusicPlaying &&
      app.isMusicPlaying();
    var filename;
    var shouldDuck = night && app.timerVoiceDuckEnabled;
    if (night) {
      filename = kind === '10' ? TIMER_VOICE_FILES.mafia10 : TIMER_VOICE_FILES.mafia0;
      if (shouldDuck && app.duckBackgroundMusicForTimerVoice) app.duckBackgroundMusicForTimerVoice();
    } else {
      filename = kind === '10' ? TIMER_VOICE_FILES.discuss10 : TIMER_VOICE_FILES.discuss0;
    }
    var a = document.getElementById('timer-voice');
    if (!a) return;
    a.volume = getEffectiveVoiceVolume();
    a.onended = null;
    a.onerror = null;
    var restoreDuck = shouldDuck;
    var cueDone = false;
    function onEndedOrError() {
      if (cueDone) return;
      cueDone = true;
      a.onended = null;
      a.onerror = null;
      voiceUiEnd();
      if (restoreDuck && app.restoreBackgroundMusicVolumeAfterTimerVoice) {
        app.restoreBackgroundMusicVolumeAfterTimerVoice();
      }
    }
    a.onended = onEndedOrError;
    a.onerror = onEndedOrError;
    voiceUiStart();
    a.src = timerVoiceUrl(filename);
    a.playbackRate = getEffectiveVoiceRate();
    var p = a.play();
    if (p && typeof p.then === 'function') {
      p.catch(function () {
        onEndedOrError();
      });
    }
  };

  function showEl(id, show) {
    var el = document.getElementById(id);
    if (!el) return;
    if (app.modalSetOpen) app.modalSetOpen(el, show);
    else {
      el.classList.toggle('hidden', !show);
      el.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  app.showTimerVoiceModal = function () {
    showEl('modal-timer-voice', true);
  };

  app.hideTimerVoiceModal = function () {
    showEl('modal-timer-voice', false);
  };

  function sfxUrl(filename) {
    return new URL('audio/' + encodeURIComponent(filename), window.location.href).href;
  }

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function shouldDuckForAnyVoice() {
    var night =
      app.getCurrentMusicSlot &&
      app.getCurrentMusicSlot() === '2' &&
      app.isMusicPlaying &&
      app.isMusicPlaying();
    return !!(night && app.timerVoiceDuckEnabled);
  }

  app.playSfxVoiceFile = function (filename) {
    var a = document.getElementById('sfx-voice');
    if (!a) return Promise.resolve(false);
    var shouldDuck = shouldDuckForAnyVoice();
    if (shouldDuck && app.duckBackgroundMusicForTimerVoice) app.duckBackgroundMusicForTimerVoice();
    try {
      a.pause();
      a.currentTime = 0;
    } catch (e) {}
    a.onended = null;
    a.onerror = null;
    a.volume = getEffectiveVoiceVolume();

    return new Promise(function (resolve) {
      var done = false;
      function fin(ok) {
        if (done) return;
        done = true;
        a.onended = null;
        a.onerror = null;
        if (app._cancelSfxVoiceFin === fin) app._cancelSfxVoiceFin = null;
        voiceUiEnd();
        if (shouldDuck && app.restoreBackgroundMusicVolumeAfterTimerVoice) {
          app.restoreBackgroundMusicVolumeAfterTimerVoice();
        }
        resolve(!!ok);
      }
      app._cancelSfxVoiceFin = fin;
      a.onended = function () {
        fin(true);
      };
      a.onerror = function () {
        fin(false);
      };
      voiceUiStart();
      a.src = sfxUrl(filename);
      a.playbackRate = getEffectiveVoiceRate();
      var p = a.play();
      if (p && typeof p.then === 'function') {
        p.catch(function () {
          fin(false);
        });
      }
    });
  };

  app.cancelSfxVoice = function () {
    var a = document.getElementById('sfx-voice');
    try {
      if (a) {
        a.onended = null;
        a.onerror = null;
        a.pause();
        a.removeAttribute('src');
        a.load();
      }
    } catch (e) {}
    if (app._cancelSfxVoiceFin) {
      var fin = app._cancelSfxVoiceFin;
      app._cancelSfxVoiceFin = null;
      try {
        fin(false);
      } catch (e) {}
    }
  };

  function cancelledNightActions(gen) {
    return gen !== app._nightActionsGen;
  }

  function guardNightActions(gen) {
    if (cancelledNightActions(gen)) throw new Error('night_actions_cancelled');
  }

  app.runNightActions = function () {
    if (app._nightActionsRunning) {
      app._nightActionsGen = (app._nightActionsGen || 0) + 1;
      app._nightActionsRunning = false;
      if (app.cancelSfxVoice) app.cancelSfxVoice();
      setNightActionsButtonActive(false);
      return;
    }

    var wait = typeof app.nightActionsWaitSec === 'number' && !isNaN(app.nightActionsWaitSec) ? app.nightActionsWaitSec : 10;
    wait = Math.round(wait);
    if (wait < 0) wait = 0;
    if (wait > 20) wait = 20;
    var waitMs = wait * 1000;

    app._nightActionsRunning = true;
    app._nightActionsGen = (app._nightActionsGen || 0) + 1;
    var gen = app._nightActionsGen;
    app.hideTimerVoiceModal();
    setNightActionsButtonActive(true);

    Promise.resolve()
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('mafia shoots with a number.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(waitMs);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('mafia leaves.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(2000);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('don wakes.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(waitMs);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('don leaves.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(2000);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('sheriff wakes.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(waitMs);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('sheriff leaves.mp3');
      })
      .catch(function () {})
      .then(function () {
        if (cancelledNightActions(gen)) return;
        app._nightActionsRunning = false;
        setNightActionsButtonActive(false);
      });
  };

  var TIMER_BTN_BASE =
    'px-3 py-2 sm:px-5 sm:py-3 font-semibold rounded uppercase text-xs sm:text-sm tracking-wider cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-[118ms] ease-out';
  function applyTimerButtonState(running) {
    var btn = document.getElementById('start-btn');
    if (!btn) return;
    btn.textContent = running ? 'Пауза' : 'Старт';
    btn.setAttribute('aria-pressed', running ? 'true' : 'false');
    btn.className =
      TIMER_BTN_BASE +
      (running
        ? ' bg-red-900 hover:bg-red-800 border border-red-700 text-white'
        : ' bg-green-800 hover:bg-green-700 border border-green-600 text-white');
  }

  app.toggleTimer = function () {
    const btn = document.getElementById('start-btn');
    if (!btn) return;
    if (app.timerInterval) {
      clearInterval(app.timerInterval);
      app.timerInterval = null;
      applyTimerButtonState(false);
      app.syncTimerAppearance();
    } else {
      applyTimerButtonState(true);
      app.timerInterval = setInterval(function () {
        if (app.timeLeft > 0) {
          app.timeLeft--;
          const te = document.getElementById('timer');
          if (te) te.textContent = app.timeLeft;
          app.syncTimerAppearance();
          if (app.timerVoiceEnabled && app.timeLeft === 10) {
            app.playTimerVoiceCue('10');
          }
          if (app.timeLeft === 0 && app.timerVoiceEnabled) {
            app.playTimerVoiceCue('0');
          }
          app.saveState();
        } else {
          app.toggleTimer();
        }
      }, 1000);
    }
  };

  app.resetTimer = function (seconds) {
    if (app.timerInterval) clearInterval(app.timerInterval);
    app.timerInterval = null;
    app.timeLeft = seconds;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = app.timeLeft;
    app.syncTimerAppearance();
    applyTimerButtonState(false);
    app.saveState();
  };
})(window.MafiaApp);
