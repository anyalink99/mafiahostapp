/**
 * Автономный режим — голосование (auto-vote-screen): подсчёт голосов по
 * кандидатам, ничья → переголосование, повторная ничья → поднятие всех.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;
  var h = app.h;

  function voteAvailableForIndex(session, index) {
    var used = 0;
    for (var j = 0; j < session.votes.length; j++) {
      if (j === index) continue;
      var v = session.votes[j];
      if (v !== null && v !== undefined) used += v;
    }
    return Math.max(0, session.poolTotal - used);
  }

  function isLastVoteSlotToFill(session, index) {
    for (var j = 0; j < session.votes.length; j++) {
      if (j === index) continue;
      if (session.votes[j] === null || session.votes[j] === undefined) return false;
    }
    return true;
  }

  app.startAutoVote = function () {
    var s = app.autoState;
    if (!s.day || !s.day.nominees.length) return;
    if (app._autoEphemeral.dayTimerInterval) {
      clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
    }
    var n = s.day.nominees.slice();
    var keepExisting =
      s.vote &&
      s.vote.phase === 'counting' &&
      s.vote.tieRevote &&
      app.arraysEqual(s.vote.baseVotingOrder, n);
    A.pushHistory();
    if (!keepExisting) {
      s.vote = {
        phase: 'counting',
        poolTotal: A.aliveCount(),
        candidateIds: n,
        votes: n.map(function () {
          return null;
        }),
        baseVotingOrder: n.slice(),
        tieRevote: false,
        raiseCandidateIds: null,
      };
    }
    s.phase = 'vote';
    A.saveAuto();
    app.navigateToScreen('auto-vote-screen');
  };

  app.renderAutoVote = function () {
    var s = app.autoState;
    if (!s.vote) return;
    var banner = el('auto-vote-revote-banner');
    var hint = el('auto-vote-pool-hint');
    var grid = el('auto-vote-candidates');
    if (!grid) return;
    if (s.vote.phase === 'raiseAll') {
      if (banner) {
        banner.classList.remove('hidden');
        var rc = (s.vote.raiseCandidateIds || []).length;
        banner.textContent =
          rc === 2 ? 'Голосование за поднятие обоих' : 'Голосование за поднятие всех';
      }
      if (hint) hint.textContent = '';
      grid.innerHTML = '';
      grid.className =
        'flex-1 min-h-0 overflow-auto flex flex-wrap content-start justify-center gap-3 sm:gap-4 py-2';
      var cap = s.vote.poolTotal;
      for (var r = 0; r <= cap; r++) {
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.setAttribute('data-action', 'auto-vote-raise-pick');
        rb.setAttribute('data-value', String(r));
        rb.className =
          'py-3 min-w-[3.25rem] px-3 rounded border border-mafia-border bg-mafia-card hover:bg-mafia-blood/30 text-mafia-cream font-semibold tabular-nums cursor-pointer transition-colors';
        rb.textContent = String(r);
        grid.appendChild(rb);
      }
      return;
    }
    if (banner) {
      if (s.vote.tieRevote) {
        banner.classList.remove('hidden');
        banner.textContent = 'Переголосование между игроками:';
      } else {
        banner.classList.add('hidden');
      }
    }
    if (hint) hint.textContent = '';
    grid.innerHTML = '';
    grid.className =
      'flex-1 min-h-0 overflow-auto flex flex-wrap content-start justify-center gap-3 sm:gap-4 py-2';
    for (var i = 0; i < s.vote.candidateIds.length; i++) {
      var pid = s.vote.candidateIds[i];
      var seat = A.seatById(pid);
      var nick = seat && seat.nick && seat.nick.trim() ? seat.nick.trim() : '';
      var assigned = s.vote.votes[i];
      grid.appendChild(
        h(
          'button',
          {
            type: 'button',
            'data-action': 'auto-vote-open-count',
            'data-candidate-index': String(i),
            className:
              'flex flex-col items-center justify-center rounded-lg border-2 border-mafia-gold/50 bg-mafia-coal text-mafia-gold p-4 sm:p-5 min-w-[6.5rem] cursor-pointer transition-colors hover:border-mafia-gold/80 active:scale-[0.97]',
          },
          [
            h(
              'span',
              { className: 'font-display font-bold text-4xl sm:text-5xl tabular-nums' },
              '№' + pid
            ),
            nick
              ? h(
                  'span',
                  { className: 'text-mafia-cream/75 text-xs mt-1 max-w-[8rem] truncate' },
                  nick
                )
              : null,
            h('span', { className: 'mt-2 text-mafia-gold/90 text-sm uppercase tracking-wider' }, [
              'голосов: ',
              h(
                'span',
                { className: 'tabular-nums' },
                String(assigned !== null && assigned !== undefined ? assigned : 0)
              ),
            ]),
          ]
        )
      );
    }
  };

  app.showAutoVoteCountModal = function (idx) {
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'counting') return;
    var rem = voteAvailableForIndex(s.vote, idx);
    var lastSlot = isLastVoteSlotToFill(s.vote, idx);
    var cap = lastSlot ? rem : Math.min(10, rem);
    var cid = s.vote.candidateIds[idx];
    if (cid === undefined) return;
    var modal = el('modal-auto-vote-count');
    if (!modal) return;
    modal.dataset.candidateIndex = String(idx);
    var title = el('modal-auto-vote-count-title');
    if (title) title.textContent = 'Голосов за №' + cid;
    var sub = el('modal-auto-vote-count-sub');
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
    var grid = el('modal-auto-vote-count-grid');
    if (grid) {
      grid.className = lastSlot
        ? 'grid grid-cols-1 gap-2 max-w-[12rem] mx-auto'
        : 'grid grid-cols-4 gap-2';
      grid.innerHTML = '';
      var from = lastSlot ? rem : 0;
      var to = lastSlot ? rem : cap;
      for (var n = from; n <= to; n++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-action', 'auto-vote-pick-count');
        b.setAttribute('data-vote-count', String(n));
        b.className =
          'py-3 rounded border border-mafia-border bg-mafia-card hover:bg-mafia-blood/30 text-mafia-cream font-semibold tabular-nums cursor-pointer transition-colors';
        b.textContent = String(n);
        grid.appendChild(b);
      }
    }
    if (app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  app.hideAutoVoteCountModal = function () {
    var modal = el('modal-auto-vote-count');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, false);
  };

  app.applyAutoVoteCount = function (count) {
    var modal = el('modal-auto-vote-count');
    if (!modal) return;
    var idx = parseInt(modal.dataset.candidateIndex || '-1', 10);
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'counting' || isNaN(idx)) return;
    var rem = voteAvailableForIndex(s.vote, idx);
    if (isLastVoteSlotToFill(s.vote, idx)) {
      if (count !== rem) {
        app.hideAutoVoteCountModal();
        return;
      }
    } else {
      var cap = Math.min(10, rem);
      if (count < 0 || count > cap) {
        app.hideAutoVoteCountModal();
        return;
      }
    }
    A.pushHistory();
    s.vote.votes[idx] = count;
    A.saveAuto();
    app.hideAutoVoteCountModal();
    app.renderAutoVote();
    tryFinalizeAutoVote();
  };

  function tryFinalizeAutoVote() {
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'counting') return;
    // Исход раунда считает чистая логика (js/game/vote-rules.js): авто-нули при
    // исчерпанном пуле, лидер/ничья; циклы переголосования не лимитированы —
    // «поднятие» встаёт только когда голосование повторилось (ничья между
    // ВСЕМИ участниками переголосования).
    var outcome = app.VoteRules.resolveVoteRound(
      s.vote.candidateIds,
      s.vote.votes,
      s.vote.poolTotal,
      !!s.vote.tieRevote
    );
    if (outcome.status === 'pending') return;
    if (outcome.status === 'hang') {
      finalizeHang(outcome.seatId);
      return;
    }
    var tied = outcome.tied;
    if (outcome.status === 'revote') {
      // Новый цикл: лидеры получают речи (день с коротким таймером), затем
      // переголосование между ними.
      s.vote.candidateIds = tied;
      s.vote.votes = tied.map(function () {
        return null;
      });
      s.vote.tieRevote = true;
      s.vote.baseVotingOrder = tied.slice();
      if (s.day) {
        s.day.nominees = tied.slice();
        s.day.timeLeft = A.REVOTE_SEC;
      }
      s.phase = 'day';
      A.saveAuto();
      app.navigateToScreen('auto-day-screen');
      return;
    }
    // raiseAll — голосование повторилось.
    s.vote = {
      phase: 'raiseAll',
      poolTotal: s.vote.poolTotal,
      raiseCandidateIds: tied.slice(),
    };
    A.saveAuto();
    app.renderAutoVote();
  }

  app.applyAutoRaisePick = function (value) {
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'raiseAll') return;
    var n = s.vote.poolTotal;
    if (value < 0 || value > n) return;
    A.pushHistory();
    var majority = value > n / 2;
    if (majority) {
      finalizeMultiHang(s.vote.raiseCandidateIds.slice());
    } else {
      A.transitionToNight((s.nightNum || 0) + 1);
    }
  };

  function finalizeHang(seatId) {
    var seat = A.seatById(seatId);
    if (seat) {
      seat.alive = false;
      seat.eliminationReason = 'hang';
      A.trackHangIfBlack(seatId);
    }
    A.transitionToLastWords([seatId]);
  }

  function finalizeMultiHang(ids) {
    for (var i = 0; i < ids.length; i++) {
      var seat = A.seatById(ids[i]);
      if (seat) {
        seat.alive = false;
        seat.eliminationReason = 'hang';
        A.trackHangIfBlack(ids[i]);
      }
    }
    A.transitionToLastWords(ids);
  }

  app.registerScreenRenderer('auto-vote-screen', function () {
    app.renderAutoVote();
  });
})(window.MafiaApp);
