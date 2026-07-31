window.MafiaApp = window.MafiaApp || {};

(function (app) {
  app.STORAGE_KEY = 'mafia_host_state';
  if (app.gameRepository) {
    app.gameRepository.register(app.STORAGE_KEY, {
      version: 1,
      migrations: {
        1: function (snapshot) {
          return snapshot;
        },
      },
      validate: function (snapshot) {
        return !snapshot.players || Array.isArray(snapshot.players);
      },
    });
  }

  function definePlayerModelAliases(player) {
    if (!player || typeof player !== 'object') return player;
    if (!Object.prototype.hasOwnProperty.call(player, 'eliminationReason'))
      player.eliminationReason = null;
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

  app.roles = [
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Шериф',
    'Мафия',
    'Мафия',
    'Дон',
  ];
  app.players = ensurePlayersSchema(
    Array.from({ length: 10 }, function (_, i) {
      return createPlayer(i + 1, '');
    })
  );
  app.nomineeQueue = [];
  app.activeVoteRound = null;
  app.urbanNightDraft = null;
  app.revealedIndices = [];
  app.timerInterval = null;
  app.timeLeft = 60;
  app.timerRunning = false;
  app.timerEndsAt = null;
  app.timerMainSec = 60;
  app.timerShortSec = 30;
  app.timerVoiceEnabled = false;
  app.timerVoiceDuckEnabled = true;
  app.timerVoiceDuckMul = 0.38;
  app.timerVoiceVolume = 0.92;
  app.voiceVolumeNoMusic = 0.92;
  app.voiceVolumeWithMusic = 0.92;
  app.voiceRate = 1.0;
  app.nightActionsWaitSec = 10;
  // Знакомство мафии: за сколько секунд до дропа включать трек и какой процент
  // этого «проигрыша» музыка плавно нарастает от 0 до 100% громкости.
  app.musicIntroLeadInSec = 10;
  app.musicIntroFadePercent = 70;
  app.canCloseRole = false;

  app.gameLog = [];

  app.playerRoleOverrides = {};

  app.winningTeam = null;

  app.bonusPointsByPlayerId = {};

  app.roleState = {
    version: 1,
    assignmentsByPlayerId: {},
    source: null,
    revision: 0,
  };

  app.summaryRoleCorrections = {};
  // Совместимый alias для старых сохранений/интеграций. Новому коду следует
  // использовать rolesApi.setSummaryCorrection().
  app.summaryRoleByPlayerId = app.summaryRoleCorrections;

  app.bonusNoteByPlayerId = {};

  app.bestMoveByPlayerId = {};

  app.protocolByPlayerId = {};

  app.opinionByPlayerId = {};

  app.summaryHostName = '';

  app.summarySyntheticFirstDayLine = null;

  app.summarySkipLineOverrides = {};

  app.gameSideShowRoles = false;

  app.gameSideNotes = '';

  app.gameSideNotesCollapsed = false;

  app.saveState = function () {
    try {
      const payload = {
        roles: app.roles,
        players: app.players,
        nomineeQueue: app.nomineeQueue,
        activeVoteRound: app.activeVoteRound,
        urbanNightDraft: app.urbanNightDraft,
        revealedIndices: app.revealedIndices,
        timeLeft: app.timeLeft,
        timerRunning: app.timerRunning,
        timerEndsAt: app.timerEndsAt,
        gameLog: app.gameLog,
        playerRoleOverrides: app.playerRoleOverrides,
        roleState: app.rolesApi ? app.rolesApi.serialize() : app.roleState,
        winningTeam: app.winningTeam,
        bonusPointsByPlayerId: app.bonusPointsByPlayerId,
        summaryRoleCorrections: app.summaryRoleCorrections,
        summaryRoleByPlayerId: app.summaryRoleCorrections,
        bonusNoteByPlayerId: app.bonusNoteByPlayerId,
        bestMoveByPlayerId: app.bestMoveByPlayerId,
        protocolByPlayerId: app.protocolByPlayerId,
        opinionByPlayerId: app.opinionByPlayerId,
        summaryHostName: app.summaryHostName,
        summarySyntheticFirstDayLine: app.summarySyntheticFirstDayLine,
        summarySkipLineOverrides: app.summarySkipLineOverrides,
        gameSideShowRoles: app.gameSideShowRoles,
        gameSideNotes: app.gameSideNotes,
        gameSideNotesCollapsed: app.gameSideNotesCollapsed,
      };
      app.gameRepository.write(app.STORAGE_KEY, payload);
      if (app.scheduleCurrentGameHistorySync) app.scheduleCurrentGameHistorySync();
    } catch (e) {}
  };

  app.loadState = function () {
    try {
      const data = app.gameRepository.read(app.STORAGE_KEY, null);
      if (!data) return false;
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
      app.urbanNightDraft =
        data.urbanNightDraft && typeof data.urbanNightDraft === 'object'
          ? data.urbanNightDraft
          : null;
      if (data.revealedIndices && Array.isArray(data.revealedIndices))
        app.revealedIndices = data.revealedIndices;
      if (typeof data.timeLeft === 'number') app.timeLeft = data.timeLeft;
      app.timerRunning = !!data.timerRunning;
      app.timerEndsAt = typeof data.timerEndsAt === 'number' ? data.timerEndsAt : null;
      if (data.gameLog && Array.isArray(data.gameLog)) app.gameLog = data.gameLog;
      else app.gameLog = [];
      app.gameLog = app.gameLog.filter(function (ev) {
        return ev && ev.type !== 'vote_round_skipped';
      });
      if (
        data.playerRoleOverrides &&
        typeof data.playerRoleOverrides === 'object' &&
        !Array.isArray(data.playerRoleOverrides)
      ) {
        app.playerRoleOverrides = data.playerRoleOverrides;
      } else app.playerRoleOverrides = {};
      if (
        data.winningTeam === 'mafia' ||
        data.winningTeam === 'peaceful' ||
        data.winningTeam === null
      ) {
        app.winningTeam = data.winningTeam;
      } else if (
        data.summary &&
        typeof data.summary === 'object' &&
        typeof data.summary.winningTeam === 'string'
      ) {
        var wt = data.summary.winningTeam;
        if (wt === 'mafia') app.winningTeam = 'mafia';
        else if (wt === 'peaceful' || wt === 'civilian') app.winningTeam = 'peaceful';
        else app.winningTeam = null;
      } else app.winningTeam = null;
      if (
        data.bonusPointsByPlayerId &&
        typeof data.bonusPointsByPlayerId === 'object' &&
        !Array.isArray(data.bonusPointsByPlayerId)
      ) {
        app.bonusPointsByPlayerId = data.bonusPointsByPlayerId;
      } else if (
        data.summary &&
        data.summary.bonusByPlayer &&
        typeof data.summary.bonusByPlayer === 'object'
      ) {
        app.bonusPointsByPlayerId = data.summary.bonusByPlayer;
      } else app.bonusPointsByPlayerId = {};
      var loadedSummaryCorrections =
        data.summaryRoleCorrections &&
        typeof data.summaryRoleCorrections === 'object' &&
        !Array.isArray(data.summaryRoleCorrections)
          ? data.summaryRoleCorrections
          : data.summaryRoleByPlayerId &&
              typeof data.summaryRoleByPlayerId === 'object' &&
              !Array.isArray(data.summaryRoleByPlayerId)
            ? data.summaryRoleByPlayerId
            : {};
      app.summaryRoleCorrections = loadedSummaryCorrections;
      app.summaryRoleByPlayerId = app.summaryRoleCorrections;
      if (
        data.bonusNoteByPlayerId &&
        typeof data.bonusNoteByPlayerId === 'object' &&
        !Array.isArray(data.bonusNoteByPlayerId)
      ) {
        app.bonusNoteByPlayerId = data.bonusNoteByPlayerId;
      } else app.bonusNoteByPlayerId = {};
      if (
        data.bestMoveByPlayerId &&
        typeof data.bestMoveByPlayerId === 'object' &&
        !Array.isArray(data.bestMoveByPlayerId)
      ) {
        app.bestMoveByPlayerId = data.bestMoveByPlayerId;
      } else app.bestMoveByPlayerId = {};
      if (
        data.protocolByPlayerId &&
        typeof data.protocolByPlayerId === 'object' &&
        !Array.isArray(data.protocolByPlayerId)
      ) {
        app.protocolByPlayerId = data.protocolByPlayerId;
      } else app.protocolByPlayerId = {};
      if (
        data.opinionByPlayerId &&
        typeof data.opinionByPlayerId === 'object' &&
        !Array.isArray(data.opinionByPlayerId)
      ) {
        app.opinionByPlayerId = data.opinionByPlayerId;
      } else app.opinionByPlayerId = {};
      if (typeof data.summaryHostName === 'string') app.summaryHostName = data.summaryHostName;
      else app.summaryHostName = '';
      if (typeof data.summarySyntheticFirstDayLine === 'string')
        app.summarySyntheticFirstDayLine = data.summarySyntheticFirstDayLine;
      else app.summarySyntheticFirstDayLine = null;
      if (
        data.summarySkipLineOverrides &&
        typeof data.summarySkipLineOverrides === 'object' &&
        !Array.isArray(data.summarySkipLineOverrides)
      ) {
        app.summarySkipLineOverrides = data.summarySkipLineOverrides;
      } else app.summarySkipLineOverrides = {};
      app.gameSideShowRoles = !!data.gameSideShowRoles;
      app.gameSideNotes = typeof data.gameSideNotes === 'string' ? data.gameSideNotes : '';
      app.gameSideNotesCollapsed = !!data.gameSideNotesCollapsed;
      if (app.rolesApi && app.rolesApi.hydrate) {
        app.rolesApi.hydrate(data.roleState, {
          summaryRoleCorrections: loadedSummaryCorrections,
          winnerChosen: app.winningTeam === 'mafia' || app.winningTeam === 'peaceful',
        });
      }
      if (!app.playerRoleOverrides || !Object.keys(app.playerRoleOverrides).length) {
        if (data.summary && Array.isArray(data.summary.rolesManual)) {
          for (var rmi = 0; rmi < data.summary.rolesManual.length; rmi++) {
            var rm = data.summary.rolesManual[rmi];
            if (rm && typeof rm.playerId === 'number') {
              if (rm.role === 'don' || rm.role === 'Дон')
                app.playerRoleOverrides[String(rm.playerId)] = 'don';
              else if (rm.role === 'sheriff' || rm.role === 'Шериф')
                app.playerRoleOverrides[String(rm.playerId)] = 'sheriff';
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
    // Сброс — граница между партиями. Текущую игру сначала архивируем,
    // затем отвязываем новую пустую партию от сохранённой записи.
    if (app.hasResettableState && app.hasResettableState() && app.saveCurrentGameToHistory) {
      app.saveCurrentGameToHistory({ silent: true });
    }
    if (app.clearCurrentHistoryLink) app.clearCurrentHistoryLink();
    var keepNicks = !opts.resetNicknames;
    var prevNicks = app.players.map(function (p) {
      return p && p.nick != null ? String(p.nick).slice(0, 32) : '';
    });
    app.roles = [
      'Мирный',
      'Мирный',
      'Мирный',
      'Мирный',
      'Мирный',
      'Мирный',
      'Шериф',
      'Мафия',
      'Мафия',
      'Дон',
    ];
    app.players = ensurePlayersSchema(
      Array.from({ length: 10 }, function (_, i) {
        return createPlayer(i + 1, keepNicks ? prevNicks[i] || '' : '');
      })
    );
    app.nomineeQueue = [];
    app.activeVoteRound = null;
    app.urbanNightDraft = null;
    app.revealedIndices = [];
    app.timeLeft =
      typeof app.timerMainSec === 'number' && app.timerMainSec > 0 ? app.timerMainSec : 60;
    app.timerRunning = false;
    app.timerEndsAt = null;
    app.gameLog = [];
    app.playerRoleOverrides = {};
    app.winningTeam = null;
    app.bonusPointsByPlayerId = {};
    if (app.rolesApi) {
      app.rolesApi.reset({ clearDeal: false, save: false, emit: false });
    } else {
      app.roleState = {
        version: 1,
        assignmentsByPlayerId: {},
        source: null,
        revision: 0,
      };
      app.summaryRoleCorrections = {};
      app.summaryRoleByPlayerId = app.summaryRoleCorrections;
    }
    app.bonusNoteByPlayerId = {};
    app.bestMoveByPlayerId = {};
    app.protocolByPlayerId = {};
    app.opinionByPlayerId = {};
    app.summaryHostName = '';
    app.summarySyntheticFirstDayLine = null;
    app.summarySkipLineOverrides = {};
    app.gameSideNotes = '';
    app.gameSideNotesCollapsed = false;
    if (app.clockApi) app.clockApi.stop('host-main');
    else if (app.timerInterval) clearInterval(app.timerInterval);
    app.timerInterval = null;
    app.saveState();
    // После сброса возвращаем пользователя в начало флоу подготовки.
    // prepare-enter сам решает, куда роутить: prepare-mode-screen (если
    // включены эксперименты + игра пустая) или прямо prepare-screen.
    var enter = app.uiActionHandlers && app.uiActionHandlers['prepare-enter'];
    if (enter) {
      enter();
    } else {
      // Fallback на случай если handler ещё не зарегистрирован —
      // остаёмся на текущем экране (хотя бы перерендерится).
      var current = (document.querySelector('.screen.active') || {}).id || 'menu-screen';
      app.navigateToScreen(current);
    }
    app.updateResetButtonVisibility();
  };

  app.hasSavedState = function () {
    try {
      return app.gameRepository.has(app.STORAGE_KEY);
    } catch (e) {
      return false;
    }
  };

  app.hasResettableState = function () {
    if (app.timeLeft !== 60) return true;
    if (app.revealedIndices && app.revealedIndices.length > 0) return true;
    if (app.nomineeQueue && app.nomineeQueue.length > 0) return true;
    if (app.activeVoteRound) return true;
    if (app.urbanNightDraft) return true;
    if (app.gameLog && app.gameLog.length > 0) return true;
    if (
      app.roleState &&
      app.roleState.assignmentsByPlayerId &&
      Object.keys(app.roleState.assignmentsByPlayerId).length > 0
    )
      return true;
    if (app.playerRoleOverrides && Object.keys(app.playerRoleOverrides).length > 0) return true;
    if (app.winningTeam) return true;
    if (app.bonusPointsByPlayerId && Object.keys(app.bonusPointsByPlayerId).length > 0) return true;
    if (app.summaryRoleByPlayerId && Object.keys(app.summaryRoleByPlayerId).length > 0) return true;
    if (app.bonusNoteByPlayerId && Object.keys(app.bonusNoteByPlayerId).length > 0) return true;
    if (app.bestMoveByPlayerId && Object.keys(app.bestMoveByPlayerId).length > 0) return true;
    if (app.protocolByPlayerId && Object.keys(app.protocolByPlayerId).length > 0) return true;
    if (app.opinionByPlayerId && Object.keys(app.opinionByPlayerId).length > 0) return true;
    if (app.summaryHostName && app.summaryHostName.trim() !== '') return true;
    if (app.summarySyntheticFirstDayLine !== null) return true;
    if (app.summarySkipLineOverrides && Object.keys(app.summarySkipLineOverrides).length > 0)
      return true;
    if (typeof app.gameSideNotes === 'string' && app.gameSideNotes.trim() !== '') return true;
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
