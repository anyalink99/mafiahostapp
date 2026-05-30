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

  // Реконструкция MU Process → события gameLog живёт в отдельном чистом
  // модуле js/mu-vote-reconstruct.js (тестируется из Node, см. tests/).
  var VR = app.MuVoteReconstruct;
  var buildVoteEvents = VR.buildVoteEvents;
  var canonVotings = VR.canonVotings;

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
