(function (app) {
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  app.getActivePlayerCount = function () {
    var c = 0;
    for (var ai = 0; ai < app.players.length; ai++) {
      if (!app.players[ai].outReason) c++;
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
    app.saveState();
  };

  app.hidePlayerActionsModal = function () {
    var m = document.getElementById('modal-player-actions');
    var wasOpen = m && m.hasAttribute('data-open');
    if (wasOpen) app.syncPlayerNickFromModal();
    if (m) app.modalSetOpen(m, false);
    if (wasOpen) {
      var gs = document.getElementById('game-screen');
      if (gs && gs.classList.contains('active') && app.renderPlayers) app.renderPlayers();
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
    if (title) title.textContent = 'Игрок №' + id;
    var inQueue = app.votingOrder.indexOf(id) !== -1;
    var out = !!p.outReason;
    if (whenActive && whenOut) {
      if (out) {
        whenActive.classList.add('hidden');
        whenOut.classList.remove('hidden');
      } else {
        whenActive.classList.remove('hidden');
        whenOut.classList.add('hidden');
      }
    }
    if (!out) {
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
      for (var ei = 0; ei < elims.length; ei++) {
        var er = elims[ei].getAttribute('data-elim');
        elims[ei].className = p.outReason === er ? elimOn : elimOff;
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

  app.togglePlayerElimination = function (id, reason) {
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    if (p.outReason === reason) {
      p.outReason = null;
      if (reason === 'disqual') {
        p.fouls = 0;
      }
      app.pruneGameLogOnRevive(id, reason);
    } else {
      p.outReason = reason;
      app.gameLog.push({ type: 'elimination', ts: Date.now(), playerId: id, reason: reason });
      var vix = app.votingOrder.indexOf(id);
      if (vix !== -1) {
        app.votingOrder.splice(vix, 1);
        app.updateVotingUI();
      }
    }
    var vs = app.voteSession;
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

  app.renderPlayers = function () {
    var list = document.getElementById('players-list');
    if (!list) return;
    list.className =
      'grid grid-flow-col grid-cols-2 grid-rows-5 gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.innerHTML = '';
    app.players.forEach(function (p) {
      var out = !!p.outReason;
      var inVoteQueue = app.votingOrder.indexOf(p.id) !== -1;
      var statusHtml;
      if (p.outReason) {
        statusHtml =
          '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-blood/50 bg-mafia-blood/10 text-mafia-blood" aria-hidden="true"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-elim-' +
          p.outReason +
          '"/></svg></div>';
      } else if (inVoteQueue) {
        statusHtml =
          '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-gold/70 bg-mafia-blood/15 text-mafia-gold" title="Выставлен" aria-label="Выставлен"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-nominated"/></svg></div>';
      } else {
        statusHtml =
          '<div class="invisible flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-transparent" aria-hidden="true"></div>';
      }
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
  };

  app.addFoul = function (id) {
    const p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p || p.outReason) return;
    p.fouls++;
    if (p.fouls >= 4) {
      p.fouls = 4;
      p.outReason = 'disqual';
      app.gameLog.push({ type: 'elimination', ts: Date.now(), playerId: id, reason: 'disqual' });
      var vix = app.votingOrder.indexOf(id);
      if (vix !== -1) {
        app.votingOrder.splice(vix, 1);
        app.updateVotingUI();
      }
      var vs = app.voteSession;
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
    if (!p || p.outReason || p.fouls <= 0) return;
    p.fouls--;
    app.renderPlayers();
    app.saveState();
  };

  app.addToVote = function (id, opts) {
    opts = opts || {};
    var pl = app.players.find(function (x) {
      return x.id === id;
    });
    if (pl && pl.outReason) return;
    var vs = app.voteSession;
    if (vs && vs.phase === 'counting' && vs.tieRevote && vs.candidateIds) {
      if (vs.candidateIds.indexOf(id) === -1) return;
    }
    if (app.votingOrder.indexOf(id) === -1) {
      app.votingOrder.push(id);
      app.updateVotingUI();
      if (!opts.skipRender) app.renderPlayers();
      app.saveState();
    }
  };

  app.removeFromVote = function (id, opts) {
    opts = opts || {};
    var vix = app.votingOrder.indexOf(id);
    if (vix === -1) return;
    app.votingOrder.splice(vix, 1);
    app.updateVotingUI();
    if (!opts.skipRender) app.renderPlayers();
    var voteScr = document.getElementById('vote-screen');
    if (voteScr && voteScr.classList.contains('active') && app.renderVoteScreen) {
      app.renderVoteScreen();
    }
    app.saveState();
  };

  app.updateVotingUI = function () {
    const el = document.getElementById('voting-order');
    if (el) el.textContent = app.votingOrder.length ? app.votingOrder.join(' → ') : '—';
    const go = document.getElementById('btn-go-voting');
    if (go) {
      const ok = app.votingOrder.length >= 2;
      const revote =
        app.voteSession &&
        app.voteSession.phase === 'counting' &&
        app.voteSession.tieRevote;
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

  app.startVoteSessionFromQueue = function () {
    var q = app.votingOrder;
    app.voteSession = {
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

  app.prepareVoteScreen = function () {
    var s0 = app.voteSession;
    if (s0 && s0.phase === 'done' && s0.winnerId != null) {
      app.finalizeVoteHang([s0.winnerId]);
      return;
    }
    if (s0 && s0.phase === 'raiseAll') return;
    if (app.votingOrder.length < 2) {
      app.showScreen('game-screen');
      return;
    }
    var s = app.voteSession;
    if (s && s.phase === 'counting') {
      if (s.tieRevote) return;
      if (app.arraysEqual(s.baseVotingOrder, app.votingOrder)) return;
    }
    app.startVoteSessionFromQueue();
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
    var vsSnap = app.voteSession;
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
      if (p) p.outReason = 'hang';
    }
    app.votingOrder = [];
    app.voteSession = null;
    app.updateVotingUI();
    app.renderPlayers();
    app.saveState();
    app.showScreen('game-screen');
  };

  app.applyRaiseAllPick = function (value) {
    var s = app.voteSession;
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
      });
      app.votingOrder = [];
      app.voteSession = null;
      app.updateVotingUI();
      app.saveState();
      app.showScreen('game-screen');
    }
  };

  app.tryFinalizeVoteRound = function () {
    var s = app.voteSession;
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
        app.votingOrder = tied.slice();
        app.saveState();
        app.showScreen('game-screen');
        app.resetTimer(30);
        return;
      }
      app.gameLog.push({
        type: 'vote_raise_all',
        ts: Date.now(),
        poolTotal: s.poolTotal,
        tiedIds: tied.slice(),
      });
      app.voteSession = {
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
    var s = app.voteSession;
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
    var sess = app.voteSession;
    if (!sess || sess.phase !== 'counting') return;
    app._voteModalOpenedAt = Date.now();
    app.modalSetOpen(m, true);
  };

  app.applyVoteCountPick = function (value) {
    var idx = app._voteModalIndex;
    app.hideVoteCountModal();
    if (idx === null || idx === undefined) return;
    var s = app.voteSession;
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

    var s = app.voteSession;
    if (!s) {
      wrap.innerHTML = '';
      app.updateVotingUI();
      return;
    }

    if (s.phase === 'done' && s.winnerId != null) {
      app.finalizeVoteHang([s.winnerId]);
      return;
    }

    if (s.phase === 'raiseAll') {
      if (banner) {
        banner.classList.remove('hidden');
        banner.textContent = 'Голосование за поднятие всех';
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
      app.updateVotingUI();
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
    app.updateVotingUI();
  };

  app.syncTimerAppearance = function () {
    const el = document.getElementById('timer');
    if (!el) return;
    const urgent = app.timeLeft <= 10;
    el.classList.toggle('text-mafia-gold', !urgent);
    el.classList.toggle('text-mafia-blood', urgent);
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
