window.MafiaApp = window.MafiaApp || {};

(function (app) {
  app.STORAGE_KEY = 'mafia_host_state';

  function definePlayerModelAliases(player) {
    if (!player || typeof player !== 'object') return player;
    if (!Object.prototype.hasOwnProperty.call(player, 'eliminationReason')) player.eliminationReason = null;
    return player;
  }

  function createPlayer(id, nick) {
    return definePlayerModelAliases({
      id: id,
      fouls: 0,
      eliminationReason: null,
      nick: nick || '',
    });
  }

  function ensurePlayersSchema(players) {
    if (!Array.isArray(players)) return [];
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (!player || typeof player !== 'object') {
        players[i] = createPlayer(i + 1, '');
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(player, 'nick')) player.nick = '';
      definePlayerModelAliases(player);
    }
    return players;
  }

  app.roles = ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'];
  app.players = ensurePlayersSchema(Array.from({ length: 10 }, function (_, i) { return createPlayer(i + 1, ''); }));
  app.nomineeQueue = [];
  app.activeVoteRound = null;
  app.revealedIndices = [];
  app.timerInterval = null;
  app.timeLeft = 60;
  app.timerVoiceEnabled = false;
  app.timerVoiceDuckEnabled = true;
  app.timerVoiceDuckMul = 0.38;
  app.timerVoiceVolume = 0.92;
  app.voiceVolumeNoMusic = 0.92;
  app.voiceVolumeWithMusic = 0.92;
  app.voiceRate = 1.0;
  app.nightActionsWaitSec = 10;
  app.canCloseRole = false;

  app.gameLog = [];

  app.playerRoleOverrides = {};

  app.winningTeam = null;

  app.bonusPointsByPlayerId = {};

  app.summaryRoleByPlayerId = {};

  app.bonusNoteByPlayerId = {};

  app.bestMoveByPlayerId = {};

  app.summaryHostName = '';

  app.summarySyntheticFirstDayLine = null;

  app.summarySkipLineOverrides = {};

  app.saveState = function () {
    try {
      const payload = {
        roles: app.roles,
        players: app.players,
        nomineeQueue: app.nomineeQueue,
        activeVoteRound: app.activeVoteRound,
        revealedIndices: app.revealedIndices,
        timeLeft: app.timeLeft,
        gameLog: app.gameLog,
        playerRoleOverrides: app.playerRoleOverrides,
        winningTeam: app.winningTeam,
        bonusPointsByPlayerId: app.bonusPointsByPlayerId,
        summaryRoleByPlayerId: app.summaryRoleByPlayerId,
        bonusNoteByPlayerId: app.bonusNoteByPlayerId,
        bestMoveByPlayerId: app.bestMoveByPlayerId,
        summaryHostName: app.summaryHostName,
        summarySyntheticFirstDayLine: app.summarySyntheticFirstDayLine,
        summarySkipLineOverrides: app.summarySkipLineOverrides,
      };
      localStorage.setItem(app.STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  };

  app.loadState = function () {
    try {
      const raw = localStorage.getItem(app.STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.roles && Array.isArray(data.roles)) app.roles = data.roles;
      if (data.players && Array.isArray(data.players)) {
        app.players = ensurePlayersSchema(data.players);
      }
      if (data.nomineeQueue && Array.isArray(data.nomineeQueue)) {
        app.nomineeQueue = data.nomineeQueue;
        app.nomineeQueue = app.nomineeQueue.filter(function (vid) {
          var pl = app.players.find(function (x) {
            return x.id === vid;
          });
          return pl && !pl.eliminationReason;
        });
      }
      if (data.activeVoteRound && typeof data.activeVoteRound === 'object') {
        app.activeVoteRound = data.activeVoteRound;
        var vs = app.activeVoteRound;
        if (
          vs &&
          vs.phase === 'counting' &&
          vs.tieRevote &&
          Array.isArray(vs.candidateIds) &&
          vs.candidateIds.length
        ) {
          app.nomineeQueue = vs.candidateIds.slice();
        }
      }
      if (data.revealedIndices && Array.isArray(data.revealedIndices)) app.revealedIndices = data.revealedIndices;
      if (typeof data.timeLeft === 'number') app.timeLeft = data.timeLeft;
      if (data.gameLog && Array.isArray(data.gameLog)) app.gameLog = data.gameLog;
      else app.gameLog = [];
      app.gameLog = app.gameLog.filter(function (ev) {
        return ev && ev.type !== 'vote_round_skipped';
      });
      if (data.playerRoleOverrides && typeof data.playerRoleOverrides === 'object' && !Array.isArray(data.playerRoleOverrides)) {
        app.playerRoleOverrides = data.playerRoleOverrides;
      } else app.playerRoleOverrides = {};
      if (data.winningTeam === 'mafia' || data.winningTeam === 'peaceful' || data.winningTeam === null) {
        app.winningTeam = data.winningTeam;
      } else if (data.summary && typeof data.summary === 'object' && typeof data.summary.winningTeam === 'string') {
        var wt = data.summary.winningTeam;
        if (wt === 'mafia') app.winningTeam = 'mafia';
        else if (wt === 'peaceful' || wt === 'civilian') app.winningTeam = 'peaceful';
        else app.winningTeam = null;
      } else app.winningTeam = null;
      if (data.bonusPointsByPlayerId && typeof data.bonusPointsByPlayerId === 'object' && !Array.isArray(data.bonusPointsByPlayerId)) {
        app.bonusPointsByPlayerId = data.bonusPointsByPlayerId;
      } else if (data.summary && data.summary.bonusByPlayer && typeof data.summary.bonusByPlayer === 'object') {
        app.bonusPointsByPlayerId = data.summary.bonusByPlayer;
      } else app.bonusPointsByPlayerId = {};
      if (data.summaryRoleByPlayerId && typeof data.summaryRoleByPlayerId === 'object' && !Array.isArray(data.summaryRoleByPlayerId)) {
        app.summaryRoleByPlayerId = data.summaryRoleByPlayerId;
      } else app.summaryRoleByPlayerId = {};
      if (data.bonusNoteByPlayerId && typeof data.bonusNoteByPlayerId === 'object' && !Array.isArray(data.bonusNoteByPlayerId)) {
        app.bonusNoteByPlayerId = data.bonusNoteByPlayerId;
      } else app.bonusNoteByPlayerId = {};
      if (data.bestMoveByPlayerId && typeof data.bestMoveByPlayerId === 'object' && !Array.isArray(data.bestMoveByPlayerId)) {
        app.bestMoveByPlayerId = data.bestMoveByPlayerId;
      } else app.bestMoveByPlayerId = {};
      if (typeof data.summaryHostName === 'string') app.summaryHostName = data.summaryHostName;
      else app.summaryHostName = '';
      if (typeof data.summarySyntheticFirstDayLine === 'string') app.summarySyntheticFirstDayLine = data.summarySyntheticFirstDayLine;
      else app.summarySyntheticFirstDayLine = null;
      if (data.summarySkipLineOverrides && typeof data.summarySkipLineOverrides === 'object' && !Array.isArray(data.summarySkipLineOverrides)) {
        app.summarySkipLineOverrides = data.summarySkipLineOverrides;
      } else app.summarySkipLineOverrides = {};
      if (!app.playerRoleOverrides || !Object.keys(app.playerRoleOverrides).length) {
        if (data.summary && Array.isArray(data.summary.rolesManual)) {
          for (var rmi = 0; rmi < data.summary.rolesManual.length; rmi++) {
            var rm = data.summary.rolesManual[rmi];
            if (rm && typeof rm.playerId === 'number') {
              if (rm.role === 'don' || rm.role === 'Дон') app.playerRoleOverrides[String(rm.playerId)] = 'don';
              else if (rm.role === 'sheriff' || rm.role === 'Шериф') app.playerRoleOverrides[String(rm.playerId)] = 'sheriff';
            } else if (typeof rm === 'string') {
              var seat = rmi + 1;
              if (rm === 'Дон') app.playerRoleOverrides[String(seat)] = 'don';
              else if (rm === 'Шериф') app.playerRoleOverrides[String(seat)] = 'sheriff';
            }
          }
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  };

  app.resetGameState = function (opts) {
    opts = opts || {};
    var keepNicks = !opts.resetNicknames;
    var prevNicks = app.players.map(function (p) {
      return p && p.nick != null ? String(p.nick).slice(0, 32) : '';
    });
    app.roles = ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'];
    app.players = ensurePlayersSchema(
      Array.from({ length: 10 }, function (_, i) {
        return createPlayer(i + 1, keepNicks ? prevNicks[i] || '' : '');
      })
    );
    app.nomineeQueue = [];
    app.activeVoteRound = null;
    app.revealedIndices = [];
    app.timeLeft = 60;
    app.gameLog = [];
    app.playerRoleOverrides = {};
    app.winningTeam = null;
    app.bonusPointsByPlayerId = {};
    app.summaryRoleByPlayerId = {};
    app.bonusNoteByPlayerId = {};
    app.bestMoveByPlayerId = {};
    app.summaryHostName = '';
    app.summarySyntheticFirstDayLine = null;
    app.summarySkipLineOverrides = {};
    if (app.timerInterval) clearInterval(app.timerInterval);
    app.timerInterval = null;
    app.saveState();
    app.navigateToScreen('menu-screen');
    app.updateResetButtonVisibility();
  };

  app.hasSavedState = function () {
    try {
      return localStorage.getItem(app.STORAGE_KEY) !== null;
    } catch (e) {
      return false;
    }
  };

  app.hasResettableState = function () {
    if (app.timeLeft !== 60) return true;
    if (app.revealedIndices && app.revealedIndices.length > 0) return true;
    if (app.nomineeQueue && app.nomineeQueue.length > 0) return true;
    if (app.activeVoteRound) return true;
    if (app.gameLog && app.gameLog.length > 0) return true;
    if (app.playerRoleOverrides && Object.keys(app.playerRoleOverrides).length > 0) return true;
    if (app.winningTeam) return true;
    if (app.bonusPointsByPlayerId && Object.keys(app.bonusPointsByPlayerId).length > 0) return true;
    if (app.summaryRoleByPlayerId && Object.keys(app.summaryRoleByPlayerId).length > 0) return true;
    if (app.bonusNoteByPlayerId && Object.keys(app.bonusNoteByPlayerId).length > 0) return true;
    if (app.bestMoveByPlayerId && Object.keys(app.bestMoveByPlayerId).length > 0) return true;
    if (app.summaryHostName && app.summaryHostName.trim() !== '') return true;
    if (app.summarySyntheticFirstDayLine !== null) return true;
    if (app.summarySkipLineOverrides && Object.keys(app.summarySkipLineOverrides).length > 0) return true;
    if (Array.isArray(app.players)) {
      for (var i = 0; i < app.players.length; i++) {
        var p = app.players[i];
        if (!p) continue;
        if ((p.fouls || 0) > 0) return true;
        if (p.eliminationReason) return true;
        if (typeof p.nick === 'string' && p.nick.trim() !== '') return true;
      }
    }
    return false;
  };

  app.updateResetButtonVisibility = function () {
    var gameBtn = document.getElementById('btn-reset-game');
    if (gameBtn) {
      var gameVisible = app.hasSavedState() && app.hasResettableState();
      gameBtn.style.visibility = gameVisible ? 'visible' : 'hidden';
      gameBtn.style.opacity = gameVisible ? '1' : '0';
      gameBtn.style.pointerEvents = gameVisible ? 'auto' : 'none';
    }
  };
})(window.MafiaApp);
