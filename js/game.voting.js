(function (app) {
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
})(window.MafiaApp);
