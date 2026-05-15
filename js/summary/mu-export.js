(function (app) {
  var roleCodeToMU = {
    peaceful: 1,
    sheriff: 2,
    mafia: 3,
    don: 4,
  };

  function pad2(x) {
    return x < 10 ? '0' + x : String(x);
  }

  function formatBonusComma(v) {
    if (typeof v !== 'number' || isNaN(v)) v = 0;
    return v.toFixed(2).replace('.', ',');
  }

  function bonusForPlayer(bk) {
    var m = app.bonusPointsByPlayerId;
    if (!m || typeof m !== 'object') return 0;
    var raw;
    if (Object.prototype.hasOwnProperty.call(m, bk)) raw = m[bk];
    else if (Object.prototype.hasOwnProperty.call(m, Number(bk))) raw = m[Number(bk)];
    var n = app.parseBonusFloat ? app.parseBonusFloat(raw) : Number(raw);
    return isNaN(n) ? 0 : n;
  }

  function formatBestMoveForMU(stored) {
    if (!app.isBestMoveTripleComplete || !app.isBestMoveTripleComplete(stored)) return '';
    var tr = app.parseBestMoveTriple(stored);
    return tr[0] + ',' + tr[1] + ',' + tr[2];
  }

  function formatDateForMU(ts) {
    var d = ts ? new Date(ts) : new Date();
    return (
      pad2(d.getDate()) +
      '-' +
      pad2(d.getMonth() + 1) +
      '-' +
      d.getFullYear() +
      ' ' +
      pad2(d.getHours()) +
      ':' +
      pad2(d.getMinutes())
    );
  }

  function firstGameTimestamp() {
    if (!Array.isArray(app.gameLog) || !app.gameLog.length) return null;
    for (var i = 0; i < app.gameLog.length; i++) {
      var ev = app.gameLog[i];
      if (ev && typeof ev.ts === 'number') return ev.ts;
    }
    return null;
  }

  function winnerForMU() {
    if (app.winningTeam === 'mafia') return 'mafia';
    if (app.winningTeam === 'peaceful') return 'peaceful';
    return null;
  }

  function candidatesFromEvent(ev) {
    var cs = (ev && ev.candidateIds) || [];
    var vs = (ev && ev.votes) || [];
    var out = [];
    for (var i = 0; i < cs.length; i++) {
      out.push({
        playerNumber: cs[i],
        votesCount: typeof vs[i] === 'number' ? vs[i] : 0,
      });
    }
    return out;
  }

  function buildVotings() {
    var votings = [];
    if (!app.inferRoundsForExport) return votings;
    var rounds = app.inferRoundsForExport(app.gameLog);
    for (var r = 0; r < rounds.length; r++) {
      var round = rounds[r];
      if (round.kind === 'skip') continue;
      if (round.kind === 'single') {
        var sev = round.events[0];
        var pool = typeof sev.votePoolTotal === 'number' ? sev.votePoolTotal : 0;
        votings.push({
          candidates: [{ playerNumber: sev.playerId, votesCount: pool }],
        });
        continue;
      }
      var cluster = round.events || [];
      for (var i = 0; i < cluster.length; i++) {
        var ev = cluster[i];
        if (ev.type === 'vote_tie') {
          var cands = candidatesFromEvent(ev);
          if (cands.length) votings.push({ candidates: cands });
        } else if (ev.type === 'vote_hang' && !ev.viaRaiseAll) {
          var cands2 = candidatesFromEvent(ev);
          if (cands2.length) votings.push({ candidates: cands2 });
        }
      }
    }
    return votings;
  }

  function buildPlayers() {
    var out = [];
    var firstShot =
      typeof app.getFirstShotPlayerIdFromLog === 'function'
        ? app.getFirstShotPlayerIdFromLog()
        : null;
    var n = app.players ? app.players.length : 0;
    for (var i = 0; i < n; i++) {
      var pl = app.players[i];
      if (!pl) continue;
      var sid = pl.id;
      var bk = String(sid);
      var code = app.getEffectiveSummaryRoleCode
        ? app.getEffectiveSummaryRoleCode(sid, i)
        : 'peaceful';
      var roleId = roleCodeToMU[code] || 1;
      var bm = app.bestMoveByPlayerId && app.bestMoveByPlayerId[bk];
      var bestMove = formatBestMoveForMU(bm);
      var bonus = bonusForPlayer(bk);
      var bonusPlus = bonus > 0 ? formatBonusComma(bonus) : '0,00';
      var bonusMinus = bonus < 0 ? formatBonusComma(Math.abs(bonus)) : '0,00';

      out.push({
        position: sid,
        nick: pl.nick != null ? String(pl.nick).trim() : '',
        roleId: roleId,
        fouls: pl.fouls || 0,
        killedFirst: firstShot === sid,
        bestMove: bestMove,
        bonusPlus: bonusPlus,
        bonusMinus: bonusMinus,
        techMinus: '0,00',
      });
    }
    return out;
  }

  function buildExportObject() {
    return {
      version: 1,
      source: 'mafia-host-app',
      dateOfGame: formatDateForMU(firstGameTimestamp()),
      host: app.summaryHostName != null ? String(app.summaryHostName).trim() : '',
      winner: winnerForMU(),
      scoreCoefficient: '1.0',
      players: buildPlayers(),
      votings: buildVotings(),
    };
  }

  function copyTextFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-2000px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(ta);
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        copyTextFallback(text);
      });
    }
    copyTextFallback(text);
    return Promise.resolve();
  }

  app.buildGameExportMUJson = function () {
    return buildExportObject();
  };

  app.buildGameExportMUJsonText = function () {
    return JSON.stringify(buildExportObject(), null, 2);
  };

  app.copyMUJsonToClipboard = function () {
    var text = app.buildGameExportMUJsonText();
    return copyTextToClipboard(text).then(function () {
      if (app.showToast) app.showToast('MU JSON скопирован в буфер');
    });
  };
})(window.MafiaApp);
