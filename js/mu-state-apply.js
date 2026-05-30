// Применение MU JSON (того же формата, что отдаёт mu-export.js) к нашему
// state. Используется при синхронизации формы → app при переключении из MU
// формы обратно в Mafia Host UI.
//
// Что синхронизируется:
//   - имя ведущего, MU-id ведущего
//   - победитель
//   - по каждому игроку: ник, фолы, MU-id, роль (через summaryRoleByPlayerId),
//     лучший ход, доп. баллы (+/− сворачиваются в один signed-float)
//   - голосования (gameLog vote_* events перегенерируются из data.votings)
//
// Что НЕ синхронизируется (намеренно, см. README):
//   - KilledFirst → eliminationReason: в нашей модели может быть несколько
//     отстрелянных игроков, в MU форме помечен только первый — обратная
//     синхронизация теряет данные.

(function (app) {
  'use strict';

  var MU_ROLE_TO_CODE = { 1: 'peaceful', 2: 'sheriff', 3: 'mafia', 4: 'don' };

  function parseCommaFloat(s) {
    if (s == null) return 0;
    var n = parseFloat(String(s).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function signedBonus(plus, minus) {
    var v = parseCommaFloat(plus) - parseCommaFloat(minus);
    // округление до 2 знаков, чтобы не плодить хвосты типа 0.30000000000000004
    return Math.round(v * 100) / 100;
  }

  function applyHeader(data) {
    if (typeof data.host === 'string') {
      app.summaryHostName = data.host.trim();
    }
    if (typeof data.hostId === 'number' && data.hostId > 0 && app.summaryHostName) {
      app.muPlayerIdByNick = app.muPlayerIdByNick || {};
      app.muPlayerIdByNick[app.summaryHostName] = data.hostId;
      app.muMetaByNick = app.muMetaByNick || {};
      // не перезаписываем существующую meta с logoId/note, только добавляем id
      if (!app.muMetaByNick[app.summaryHostName]) {
        app.muMetaByNick[app.summaryHostName] = { id: data.hostId, logoId: null, note: null };
      } else if (!app.muMetaByNick[app.summaryHostName].id) {
        app.muMetaByNick[app.summaryHostName].id = data.hostId;
      }
    }
    if (data.winner === 'peaceful' || data.winner === 'mafia') {
      app.winningTeam = data.winner;
    } else if (data.winner == null) {
      app.winningTeam = null;
    }
    // draw / scoreCoefficient у нас не моделируются — игнорируем
  }

  function applyPlayer(p, idx) {
    if (!p || !Array.isArray(app.players) || !app.players[idx]) return;
    var slot = app.players[idx];
    var sid = slot.id;
    var nick = typeof p.nick === 'string' ? p.nick.trim() : '';
    slot.nick = nick;

    // фолы
    if (typeof p.fouls === 'number' && p.fouls >= 0) {
      slot.fouls = Math.min(p.fouls, 5);
    }

    // MU-id игрока
    if (typeof p.playerId === 'number' && p.playerId > 0) {
      slot.muPlayerId = p.playerId;
      if (nick) {
        app.muPlayerIdByNick = app.muPlayerIdByNick || {};
        app.muPlayerIdByNick[nick] = p.playerId;
        app.muMetaByNick = app.muMetaByNick || {};
        if (!app.muMetaByNick[nick]) {
          app.muMetaByNick[nick] = { id: p.playerId, logoId: null, note: null };
        } else if (!app.muMetaByNick[nick].id) {
          app.muMetaByNick[nick].id = p.playerId;
        }
      }
    } else {
      slot.muPlayerId = null;
    }

    // роль (через override итогов)
    var roleCode = MU_ROLE_TO_CODE[Number(p.roleId)];
    app.summaryRoleByPlayerId = app.summaryRoleByPlayerId || {};
    if (roleCode) {
      app.summaryRoleByPlayerId[String(sid)] = roleCode;
    }

    // лучший ход
    app.bestMoveByPlayerId = app.bestMoveByPlayerId || {};
    if (typeof p.bestMove === 'string' && p.bestMove.trim()) {
      app.bestMoveByPlayerId[String(sid)] = p.bestMove.trim();
    } else {
      delete app.bestMoveByPlayerId[String(sid)];
    }

    // доп. баллы (signed)
    app.bonusPointsByPlayerId = app.bonusPointsByPlayerId || {};
    var v = signedBonus(p.bonusPlus, p.bonusMinus);
    if (v === 0) {
      delete app.bonusPointsByPlayerId[String(sid)];
    } else {
      app.bonusPointsByPlayerId[String(sid)] = v;
    }
  }

  // Нормализуем одну запись из data.votings к {cands, votes, pg}.
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
    for (var i = 0; i < a.length; i++) {
      if (b.indexOf(a[i]) === -1) return false;
    }
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

  // Группируем MU Process entries в раунды-«дни»:
  //   - tie+tie+single — голосование с переголосованием → казнь
  //   - tie+tie+raise_all — голосование с переголосованием → Подняли (все ушли)
  //   - tie без следующего subset-entry — «Оставили» (vote_no_elimination)
  //   - single сразу — обычная казнь
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
          // предыдущий ничейный круг был оставлен — закрываем
          flush('no_elimination');
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

  function buildVoteEvents(votings) {
    if (!Array.isArray(votings) || !votings.length) return [];
    var entries = votings.map(normalizeEntry);
    var rounds = groupRounds(entries);
    var events = [];
    var ts = Date.now();
    for (var r = 0; r < rounds.length; r++) {
      var round = rounds[r];
      var ents = round.entries;
      var lastIdx = ents.length - 1;

      if (round.type === 'single') {
        // ничьи (если были) → tie, последний entry → vote_hang
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
        // poolTotal эвристически: сумма голосов последней ничьи
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
        // no_elimination — все ничьи + терминатор
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
  // Берёт {candidates:[{playerNumber, votesCount}], playersGone:[ids]}, нормализует
  // и сериализует. Если строки совпадают — голосования эквивалентны и наш богатый
  // vote-лог в gameLog не нужно перезаписывать упрощённой реконструкцией.
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

  function currentVotingsFromGameLog() {
    if (!app.buildGameExportMUJson) return null;
    try {
      var json = app.buildGameExportMUJson();
      return (json && json.votings) || [];
    } catch (e) {
      return null;
    }
  }

  function applyVotings(votings) {
    if (!Array.isArray(app.gameLog)) app.gameLog = [];
    if (!Array.isArray(votings)) return;

    // если приходит пустой массив голосований — НЕ чистим существующие, чтобы
    // случайный sync с чистой формы не стёр игру в нашем приложении
    if (!votings.length) return;

    // если структура голосований из формы совпадает с тем, что наше приложение
    // уже знает — НЕ перезаписываем gameLog (сохраняем богатую инфу о пуле,
    // tieRevote, raise-all majority и т.п.)
    var ours = currentVotingsFromGameLog();
    if (ours && canonVotings(ours) === canonVotings(votings)) return;

    var newEvents = buildVoteEvents(votings);
    // вырезаем существующие vote_* события, остальные (elimination, и т.п.) сохраняем
    var keep = [];
    for (var i = 0; i < app.gameLog.length; i++) {
      var ev = app.gameLog[i];
      if (!ev || !ev.type) { keep.push(ev); continue; }
      if (ev.type.indexOf('vote_') === 0) continue;
      keep.push(ev);
    }
    app.gameLog = keep.concat(newEvents);
  }

  function rerenderAll() {
    var fns = [
      'renderPlayers',
      'renderPreparePlayers',
      'renderGameSideRoles',
      'renderGameSidePanels',
      'renderSummary',
    ];
    for (var i = 0; i < fns.length; i++) {
      if (typeof app[fns[i]] === 'function') {
        try { app[fns[i]](); } catch (e) { console.warn('[MU] rerender ' + fns[i] + ':', e); }
      }
    }
  }

  app.applyMUStateToApp = function (data) {
    if (!data || typeof data !== 'object') return;
    applyHeader(data);
    if (Array.isArray(data.players)) {
      for (var i = 0; i < Math.min(data.players.length, app.players.length); i++) {
        applyPlayer(data.players[i], i);
      }
    }
    applyVotings(data.votings);
    if (app.saveState) {
      try { app.saveState(); } catch (e) {}
    }
    rerenderAll();
  };
})(window.MafiaApp = window.MafiaApp || {});
