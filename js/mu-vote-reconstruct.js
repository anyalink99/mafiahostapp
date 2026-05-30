// Чистая логика реконструкции голосований из MU Process в наш gameLog.
//
// Группирует последовательность MU entries в логические раунды
// (одно «голосование» дня): single казнение, raise_all (Подняли всех с
// переголосования), no_elimination (Оставили после ничей). Каждый раунд
// превращается в последовательность событий vote_tie + терминатор
// (vote_hang / vote_no_elimination / vote_raise_all + vote_hang viaRaiseAll).
//
// Без зависимости от app/state/DOM — пригодна для unit-тестирования из Node.
// Подключается через window.MafiaApp.MuVoteReconstruct в браузере и через
// module.exports в Node (см. tests/test-mu-vote-roundtrip.cjs).

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.MuVoteReconstruct = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ─── Нормализация одного MU Process entry → удобная форма ───
  // Вход: { candidates: [{playerNumber, votesCount}], playersGone?: [ids] }
  // Выход: { cands: [n], votes: [n], pg: [n] }
  function normalizeEntry(v) {
    var cs = (v && v.candidates) || [];
    var cands = [], votes = [];
    for (var j = 0; j < cs.length; j++) {
      var pn = Number(cs[j].playerNumber);
      if (!isFinite(pn)) continue;
      cands.push(pn);
      var vc = Number(cs[j].votesCount);
      votes.push(isFinite(vc) ? vc : 0);
    }
    var pg = Array.isArray(v && v.playersGone)
      ? v.playersGone.map(Number).filter(function (n) { return isFinite(n); })
      : [];
    return { cands: cands, votes: votes, pg: pg };
  }

  function isSubsetOf(a, b) {
    if (!a.length || !b.length) return false;
    if (a.length > b.length) return false;
    for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) === -1) return false;
    return true;
  }

  function findTied(cands, votes) {
    var max = 0;
    for (var i = 0; i < votes.length; i++) if (votes[i] > max) max = votes[i];
    var tied = [];
    for (var k = 0; k < votes.length; k++) {
      if (votes[k] === max && max > 0) tied.push(cands[k]);
    }
    return tied;
  }

  // Сгруппировать entries в раунды-«дни» по правилам:
  //   tie+tie+single        — голосование с переголосованием → казнь
  //   tie+tie+raise_all     — голосование с переголосованием → Подняли (все ушли)
  //   tie без следующего subset-entry → «Оставили» (vote_no_elimination)
  //   single сразу          — обычная казнь
  function groupRounds(entries) {
    var rounds = [];
    var current = [];
    var lastCands = null;
    function flush(type, extra) {
      if (!current.length) return;
      rounds.push(Object.assign({ type: type, entries: current }, extra || {}));
      current = [];
      lastCands = null;
    }
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      // Подняли: пустой VotingStrings + есть PlayersGone
      if (!e.cands.length && e.pg.length > 0) {
        current.push(e);
        flush('raise_all', { eliminatedIds: e.pg.slice() });
        continue;
      }
      // Одиночное казнение
      if (e.pg.length === 1) {
        if (current.length && lastCands && !isSubsetOf(e.cands, lastCands)) {
          flush('no_elimination'); // предыдущий ничейный круг был «Оставили»
        }
        current.push(e);
        flush('single', { eliminatedId: e.pg[0] });
        continue;
      }
      // Ничья (multiple cands без однозначного исхода)
      if (current.length && lastCands && !isSubsetOf(e.cands, lastCands)) {
        flush('no_elimination');
      }
      current.push(e);
      lastCands = e.cands;
    }
    if (current.length) flush('no_elimination');
    return rounds;
  }

  function emitTieEvents(entries, baseTs) {
    var out = [];
    var ts = baseTs;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      out.push({
        type: 'vote_tie',
        ts: ts++,
        candidateIds: e.cands.slice(),
        votes: e.votes.slice(),
        tiedIds: findTied(e.cands, e.votes),
        isRevote: i > 0,
      });
    }
    return { events: out, nextTs: ts };
  }

  // Главная функция: MU votings (то что лежит в Process) → события gameLog.
  // baseTs делается параметром (по умолчанию Date.now()) для воспроизводимости
  // в тестах.
  function buildVoteEvents(votings, baseTs) {
    if (!Array.isArray(votings) || !votings.length) return [];
    var entries = votings.map(normalizeEntry);
    var rounds = groupRounds(entries);
    var events = [];
    var ts = typeof baseTs === 'number' ? baseTs : Date.now();
    for (var r = 0; r < rounds.length; r++) {
      var round = rounds[r];
      var ents = round.entries;
      var lastIdx = ents.length - 1;

      if (round.type === 'single') {
        var pre = emitTieEvents(ents.slice(0, lastIdx), ts);
        events = events.concat(pre.events);
        ts = pre.nextTs;
        var last = ents[lastIdx];
        events.push({
          type: 'vote_hang',
          ts: ts++,
          candidateIds: last.cands.slice(),
          votes: last.votes.slice(),
          eliminatedIds: [round.eliminatedId],
          tieRevote: ents.length > 1,
          viaRaiseAll: false,
        });
      } else if (round.type === 'raise_all') {
        var pre2 = emitTieEvents(ents.slice(0, lastIdx), ts);
        events = events.concat(pre2.events);
        ts = pre2.nextTs;
        // poolTotal эвристически — сумма голосов из последней ничьи.
        var lastTie = ents[lastIdx - 1];
        var poolTotal = 0;
        if (lastTie && lastTie.votes) {
          for (var k = 0; k < lastTie.votes.length; k++) poolTotal += lastTie.votes[k];
        }
        events.push({
          type: 'vote_raise_all',
          ts: ts++,
          poolTotal: poolTotal || 10,
          tiedIds: round.eliminatedIds.slice(),
        });
        events.push({
          type: 'vote_hang',
          ts: ts++,
          candidateIds: round.eliminatedIds.slice(),
          votes: [],
          eliminatedIds: round.eliminatedIds.slice(),
          tieRevote: true,
          viaRaiseAll: true,
        });
      } else {
        // no_elimination: ничьи + терминатор vote_no_elimination
        var pre3 = emitTieEvents(ents, ts);
        events = events.concat(pre3.events);
        ts = pre3.nextTs;
        var lastEntry = ents[lastIdx];
        var tied = findTied(lastEntry.cands, lastEntry.votes);
        events.push({
          type: 'vote_no_elimination',
          ts: ts++,
          tiedIds: tied.length ? tied : lastEntry.cands.slice(),
        });
      }
      ts += 10; // зазор между раундами
    }
    return events;
  }

  // Канонизированная форма votings для сравнения «не изменилось ли в MU форме».
  // Если строки совпадают — голосования эквивалентны и наш богатый vote-лог
  // в gameLog не нужно перезаписывать упрощённой реконструкцией.
  function canonVotings(arr) {
    if (!Array.isArray(arr)) return '';
    var parts = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i] || {};
      var cs = (v.candidates || []).map(function (c) {
        return Number(c.playerNumber) + ':' + (Number(c.votesCount) || 0);
      });
      var pg = (v.playersGone || []).map(Number).filter(function (n) { return isFinite(n); });
      parts.push(cs.join(',') + '|' + pg.join(','));
    }
    return parts.join(';');
  }

  return {
    normalizeEntry: normalizeEntry,
    isSubsetOf: isSubsetOf,
    findTied: findTied,
    groupRounds: groupRounds,
    emitTieEvents: emitTieEvents,
    buildVoteEvents: buildVoteEvents,
    canonVotings: canonVotings,
  };
});
