// Чистая логика исхода раунда голосования спортивной мафии.
//
// Правила:
//   • голоса делятся между кандидатами, пул = число живых игроков;
//   • если пул исчерпан, незаполненным кандидатам автоматически ставится 0;
//   • единоличный лидер — казнь;
//   • ничья лидеров — переголосование между ними; циклы НЕ лимитированы
//     (3/3/3/1 → трое; 5/5/0 → двое; 5/5 → ...);
//   • вопрос о «поднятии всех» встаёт ТОЛЬКО когда голосование повторилось:
//     раунд уже был переголосованием между этим составом, и снова все его
//     участники сравнялись (5/5 между теми же двумя, 3/3/3 между теми же тремя).
//
// Без зависимости от app/state/DOM — пригодна для unit-тестирования из Node.
// Подключается через window.MafiaApp.VoteRules в браузере и через
// module.exports в Node (см. tests/test-vote-rules.cjs).

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.VoteRules = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function isFilled(v) {
    return v !== null && v !== undefined;
  }

  /**
   * Если пул голосов исчерпан (за оставшихся уже некому голосовать),
   * незаполненным кандидатам проставляется 0. МУТИРУЕТ массив votes —
   * вызывающий код хранит его в сессии голосования.
   */
  function fillZeroesIfPoolExhausted(votes, poolTotal) {
    var used = 0;
    for (var u = 0; u < votes.length; u++) {
      if (isFilled(votes[u])) used += votes[u];
    }
    if (used >= poolTotal) {
      for (var z = 0; z < votes.length; z++) {
        if (!isFilled(votes[z])) votes[z] = 0;
      }
    }
    return votes;
  }

  /**
   * Исход раунда. Вход:
   *   candidateIds — кандидаты раунда (по порядку выставления);
   *   votes        — голоса по тем же индексам (null = ещё не введено);
   *   poolTotal    — пул (живые игроки на старте раунда);
   *   isRevote     — раунд сам является переголосованием (его кандидаты —
   *                  лидеры предыдущего раунда).
   * Выход (status):
   *   'pending'  — заполнены не все позиции, ждём ввода;
   *   'hang'     — единоличный лидер, { seatId };
   *   'revote'   — ничья, состав лидеров сузился/изменился → новый цикл
   *                переголосования, { tied };
   *   'raiseAll' — голосование повторилось (ничья между ВСЕМИ кандидатами
   *                переголосования) → вопрос о поднятии, { tied }.
   */
  function resolveVoteRound(candidateIds, votes, poolTotal, isRevote) {
    fillZeroesIfPoolExhausted(votes, poolTotal);
    for (var i = 0; i < votes.length; i++) {
      if (!isFilled(votes[i])) return { status: 'pending' };
    }
    var maxV = -1;
    for (var k = 0; k < votes.length; k++) {
      if (votes[k] > maxV) maxV = votes[k];
    }
    var tied = [];
    for (var t = 0; t < candidateIds.length; t++) {
      if (votes[t] === maxV) tied.push(candidateIds[t]);
    }
    if (tied.length < 2) {
      return { status: 'hang', seatId: tied[0] };
    }
    // «Повторилось» = текущий раунд уже был переголосованием между ровно этим
    // составом и снова сравнялись все: лидеры == все кандидаты раунда.
    if (isRevote && tied.length === candidateIds.length) {
      return { status: 'raiseAll', tied: tied };
    }
    return { status: 'revote', tied: tied };
  }

  return {
    resolveVoteRound: resolveVoteRound,
    fillZeroesIfPoolExhausted: fillZeroesIfPoolExhausted,
  };
});
