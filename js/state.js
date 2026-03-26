window.MafiaApp = window.MafiaApp || {};

(function (app) {
  app.STORAGE_KEY = 'mafia_host_state';

  app.roles = ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'];
  app.players = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    fouls: 0,
    outReason: null,
    nick: '',
  }));
  app.votingOrder = [];
  app.voteSession = null;
  app.revealedIndices = [];
  app.timerInterval = null;
  app.timeLeft = 60;
  app.timerVoiceEnabled = false;
  app.timerVoiceDuckEnabled = true;
  app.timerVoiceDuckMul = 0.38;
  // Back-compat: старый единый слайдер громкости озвучки.
  app.timerVoiceVolume = 0.92;
  // Новые настройки: раздельная громкость (без музыки / с музыкой) и скорость озвучки.
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

  /** Ручная правка текста синтетической строки «пропуск дня 1» в «Ход игры»; null = стандартный текст. */
  app.summarySyntheticFirstDayLine = null;

  /** Ручные правки текста синтетических строк «пропуск» между двумя ночными вылетами (ключ pair-<индекс>). */
  app.summarySkipLineOverrides = {};

  app.saveState = function () {
    try {
      const payload = {
        roles: app.roles,
        players: app.players,
        votingOrder: app.votingOrder,
        voteSession: app.voteSession,
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
        app.players = data.players;
        for (var pi = 0; pi < app.players.length; pi++) {
          if (!Object.prototype.hasOwnProperty.call(app.players[pi], 'outReason')) {
            app.players[pi].outReason = null;
          }
          if (app.players[pi].outReason === 'removed') {
            app.players[pi].outReason = 'disqual';
          }
          if (!Object.prototype.hasOwnProperty.call(app.players[pi], 'nick')) {
            app.players[pi].nick = '';
          }
        }
      }
      if (data.votingOrder && Array.isArray(data.votingOrder)) {
        app.votingOrder = data.votingOrder;
        app.votingOrder = app.votingOrder.filter(function (vid) {
          var pl = app.players.find(function (x) {
            return x.id === vid;
          });
          return pl && !pl.outReason;
        });
      }
      if (data.voteSession && typeof data.voteSession === 'object') {
        app.voteSession = data.voteSession;
        var vs = app.voteSession;
        if (
          vs &&
          vs.phase === 'counting' &&
          vs.tieRevote &&
          Array.isArray(vs.candidateIds) &&
          vs.candidateIds.length
        ) {
          app.votingOrder = vs.candidateIds.slice();
        }
      }
      if (data.revealedIndices && Array.isArray(data.revealedIndices)) app.revealedIndices = data.revealedIndices;
      if (typeof data.timeLeft === 'number') app.timeLeft = data.timeLeft;
      if (data.gameLog && Array.isArray(data.gameLog)) app.gameLog = data.gameLog;
      else if (data.gameHistory && Array.isArray(data.gameHistory)) app.gameLog = data.gameHistory;
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

  app.fullReset = function () {
    try {
      localStorage.removeItem(app.STORAGE_KEY);
    } catch (e) {}
    app.roles = ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'];
    app.players = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      fouls: 0,
      outReason: null,
      nick: '',
    }));
    app.votingOrder = [];
    app.voteSession = null;
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
    app.showScreen('menu-screen');
    app.updateResetButtonVisibility();
  };

  app.hasSavedState = function () {
    try {
      return localStorage.getItem(app.STORAGE_KEY) !== null;
    } catch (e) {
      return false;
    }
  };

  app.updateResetButtonVisibility = function () {
    const btn = document.getElementById('btn-reset');
    if (!btn) return;
    const visible = app.hasSavedState();
    btn.style.visibility = visible ? 'visible' : 'hidden';
    btn.style.opacity = visible ? '1' : '0';
    btn.style.pointerEvents = visible ? 'auto' : 'none';
  };
})(window.MafiaApp);
