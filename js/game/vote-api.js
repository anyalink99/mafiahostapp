(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./vote-rules.js'));
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.voteApi = factory(root.MafiaApp.VoteRules);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (rules) {
  'use strict';

  function createRound(candidateIds, poolTotal, isRevote) {
    var ids = Array.isArray(candidateIds) ? candidateIds.slice() : [];
    return {
      candidateIds: ids,
      votes: ids.map(function () {
        return null;
      }),
      poolTotal: Math.max(0, Number(poolTotal) || 0),
      cursor: 0,
      isRevote: !!isRevote,
    };
  }

  function usedVotes(round, exceptIndex) {
    var total = 0;
    for (var i = 0; i < round.votes.length; i++) {
      if (i === exceptIndex || round.votes[i] == null) continue;
      total += Number(round.votes[i]) || 0;
    }
    return total;
  }

  function maxVotesFor(round, index) {
    if (!round || index < 0 || index >= round.votes.length) return 0;
    return Math.max(0, round.poolTotal - usedVotes(round, index));
  }

  function isLastSlot(round, index) {
    if (!round) return false;
    for (var i = 0; i < round.votes.length; i++) {
      if (i !== index && round.votes[i] == null) return false;
    }
    return true;
  }

  function cast(round, index, value) {
    if (!round || index < 0 || index >= round.votes.length) return false;
    var next = Math.max(0, Math.round(Number(value) || 0));
    round.votes[index] = Math.min(next, maxVotesFor(round, index));
    rules.fillZeroesIfPoolExhausted(round.votes, round.poolTotal);
    return true;
  }

  function resolve(round) {
    if (!round) return { status: 'pending' };
    return rules.resolveVoteRound(
      round.candidateIds,
      round.votes,
      round.poolTotal,
      !!(round.isRevote || round.tieRevote)
    );
  }

  return {
    createRound: createRound,
    maxVotesFor: maxVotesFor,
    isLastSlot: isLastSlot,
    cast: cast,
    resolve: resolve,
  };
});
