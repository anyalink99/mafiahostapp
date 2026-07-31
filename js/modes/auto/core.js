/**
 * Автономный режим — внутреннее ядро (app._auto).
 *
 * Здесь живёт всё, что разделяют файлы modes/auto/*:
 *   • константы и ключи хранилищ;
 *   • variant-предикаты (тонкие обёртки над game/variants.js);
 *   • app.autoState / app._autoEphemeral и makeFreshState;
 *   • prepareConfig + experimental modes API;
 *   • persistence (saveAuto / loadAuto);
 *   • snapshot-история (pushHistory / popHistory / mutate);
 *   • helpers (el, seatById, aliveSeats, навигация, win-предикаты);
 *   • clearAllAutoTimers и аудио (playSfx / playSfxSequence / cancelSfx).
 *
 * Файлы фаз (setup/reveal/intro/night/day/vote/last-words/endgame/gestures)
 * читают это через `var A = app._auto` и добавляют в A свои кросс-файловые
 * функции. Снаружи (events/*, migration) использовать app._autoInternals
 * (собирается в mode.js).
 *
 * Источники правды:
 *   • app.autoState        — игровое состояние, персистится через STORAGE_KEY.
 *   • app.prepareConfig    — выбранный режим/вариант, персистится отдельно.
 *   • app.experimentalModesEnabled — флаг доступности Каспера/Мерлина.
 *   • app._autoEphemeral   — таймеры/состояния UI, НЕ персистится.
 *
 * Любое мутирующее действие пользователя должно вызывать pushHistory() перед
 * мутацией (или использовать mutate() обёртку), чтобы работал откат 5-сек
 * удержанием / Backspace.
 */
(function (app) {
  'use strict';

  var A = (app._auto = {});

  var STORAGE_KEY = 'mafia_auto_state';
  var PREPARE_CONFIG_KEY = 'mafia_prepare_config';
  var EXP_MODES_KEY = 'mafia_experimental_modes';
  var ROLE_ICONS = {
    peaceful: 'icon-peaceful',
    mafia: 'icon-mafia',
    don: 'icon-don',
    sheriff: 'icon-sheriff',
    merlin: 'icon-merlin',
  };
  A.ROLE_NAMES = {
    peaceful: 'Мирный',
    mafia: 'Мафия',
    don: 'Дон',
    sheriff: 'Шериф',
    merlin: 'Мерлин',
  };
  A.TEAM_NAMES = { peaceful: 'Мирные жители', mafia: 'Мафия' };

  A.DEFAULT_PLAYER_COUNT = 10;
  A.INTRO_PRE_SEC = 10;
  A.INTRO_MAIN_SEC = 60;
  A.LAST_WORDS_SEC = 60;
  A.DEFAULT_DAY_SEC = 60;
  A.REVOTE_SEC = 30;
  A.REVEAL_SEC = 3;
  A.NIGHT_TURN_RECOMMENDED_SEC = 7;
  A.BACK_HOLD_MS = 5000;
  A.BACK_MOVE_THRESHOLD_PX = 24;
  var HISTORY_LIMIT = 120;

  if (app.gameRepository) {
    app.gameRepository.register(STORAGE_KEY, {
      version: 1,
      migrations: {
        1: function (snapshot) {
          return snapshot;
        },
      },
      validate: function (snapshot) {
        return !snapshot.seats || Array.isArray(snapshot.seats);
      },
    });
  }

  var STATE_KEYS = [
    'phase',
    'seats',
    'reveal',
    'nightNum',
    'night',
    'day',
    'vote',
    'lastWords',
    'result',
    'dayNum',
    'playerCount',
    'variant',
    'hangedBlacks',
    'merlinGuess',
  ];

  function playerCount() {
    return A.DEFAULT_PLAYER_COUNT;
  }
  A.playerCount = playerCount;

  // VARIANTS живут в game/variants.js + game/{standard,kasper,merlin,donskaya}.js.
  // Здесь — только тонкие обёртки, которые тянут конфиг из реестра по текущему стейту.
  function variantConfig(name) {
    return app.variantConfig(name);
  }
  A.variantConfig = variantConfig;
  function getVariant() {
    return variantConfig(app.autoState && app.autoState.variant);
  }
  A.getVariant = getVariant;
  function getPrepareVariant() {
    return variantConfig(app.prepareConfig && app.prepareConfig.variant);
  }
  function isVariantSupported(name) {
    return app.SUPPORTED_VARIANTS.indexOf(name) !== -1;
  }
  function isAutoSupportedVariant(name) {
    var cfg = name && app.gameVariants ? app.gameVariants[name] : null;
    return !!cfg && !cfg.hostOnly;
  }
  A.isAutoSupportedVariant = isAutoSupportedVariant;
  A.dealRolesForVariant = function (v) {
    return variantConfig(v).dealRoles();
  };

  // Каспер — seat 10 is a phantom (no real player) until his auto-kill in night 1.
  // He sits in autoState.seats so his "vote" counts in day-1 voting pool, but is
  // hidden from reveal turns, night turns, nomination, fouls, modal interaction.
  function isPhantomSeat(seat) {
    return !!(seat && seat.phantom);
  }
  A.isPhantomSeat = isPhantomSeat;
  A.activeSeats = function () {
    return app.autoState.seats.filter(function (s) {
      return !isPhantomSeat(s);
    });
  };
  A.aliveActiveSeats = function () {
    return app.autoState.seats.filter(function (s) {
      return s.alive && !isPhantomSeat(s);
    });
  };

  // Variant-derived predicates — single source of truth for game-flow branching.
  A.isKasperKillNight = function (s) {
    s = s || app.autoState;
    if (!s || !s.night) return false;
    return !!variantConfig(s.variant).firstNightKillsKasper && s.night.nightNum === 1;
  };
  A.isSheriffRandomCheckNight = function (s) {
    s = s || app.autoState;
    if (!s || !s.night) return false;
    return !!variantConfig(s.variant).firstNightSheriffRandom && s.night.nightNum === 1;
  };

  // Cross-file API for role pickers (modes/host/players.js, summary/summary.js).
  app.getPrepareVariant = getPrepareVariant;

  function makeFreshState() {
    return {
      active: false,
      phase: 'setup',
      seats: [],
      reveal: {
        version: 2,
        cursor: 1,
        stage: 'pick',
        remainingRoles: [],
        selectedRole: null,
        showUntil: 0,
      },
      nightNum: 0,
      night: null,
      day: null,
      vote: null,
      lastWords: null,
      result: null,
      dayNum: 0,
      playerCount: A.DEFAULT_PLAYER_COUNT,
      variant: 'standard',
      hangedBlacks: [],
      merlinGuess: null,
      history: [],
    };
  }
  A.makeFreshState = makeFreshState;

  if (app.phaseMachine) {
    app.phaseMachine.register('auto', {
      transitions: {
        setup: ['reveal'],
        reveal: ['night-intro', 'night-pass'],
        'night-intro': ['day', 'night-pass'],
        'night-pass': ['night-action', 'night-result', 'day', 'gameover'],
        'night-action': ['night-pass', 'night-result'],
        'night-result': ['day', 'gameover', 'merlin-guess'],
        day: ['vote', 'night-pass', 'gameover', 'merlin-guess'],
        vote: ['day', 'last-words', 'night-pass', 'gameover', 'merlin-guess'],
        'last-words': ['night-pass', 'gameover', 'merlin-guess'],
        'merlin-guess': ['gameover'],
        gameover: ['setup'],
      },
    });
  }
  A.setPhase = function (target, context) {
    var state = app.autoState;
    if (!state || state.phase === target) return state;
    if (app.phaseMachine) return app.phaseMachine.transition('auto', state, target, context);
    state.phase = target;
    return state;
  };

  app.prepareConfig = { mode: 'host', variant: 'standard' };
  app.experimentalModesEnabled = false;

  function loadExperimentalModes() {
    try {
      app.experimentalModesEnabled = app.settingsRepository.getBoolean(EXP_MODES_KEY, false);
    } catch (e) {}
  }
  A.loadExperimentalModes = loadExperimentalModes;
  function saveExperimentalModes() {
    try {
      app.settingsRepository.setBoolean(EXP_MODES_KEY, app.experimentalModesEnabled);
    } catch (e) {}
  }
  function loadPrepareConfig() {
    try {
      var d = app.settingsRepository.getJson(PREPARE_CONFIG_KEY, null);
      if (!d) return;
      if (!d || typeof d !== 'object') return;
      if (d.mode === 'host' || d.mode === 'auto') app.prepareConfig.mode = d.mode;
      if (isVariantSupported(d.variant)) {
        app.prepareConfig.variant = d.variant;
      } else if (d.count === 9) {
        app.prepareConfig.variant = 'kasper';
      } else if (d.count === 8) {
        app.prepareConfig.variant = 'merlin';
      } else {
        app.prepareConfig.variant = 'standard';
      }
    } catch (e) {}
  }
  A.loadPrepareConfig = loadPrepareConfig;

  function savePrepareConfig() {
    try {
      app.settingsRepository.setJson(PREPARE_CONFIG_KEY, app.prepareConfig);
    } catch (e) {}
  }
  A.savePrepareConfig = savePrepareConfig;

  app.setExperimentalModes = function (enabled) {
    app.experimentalModesEnabled = !!enabled;
    // Автономный ведущий теперь считается экспериментальным — при выключении
    // флага возвращаем mode и variant к стандартным.
    var changed = false;
    if (!app.experimentalModesEnabled) {
      if (app.prepareConfig.variant !== 'standard') {
        app.prepareConfig.variant = 'standard';
        changed = true;
      }
      if (app.prepareConfig.mode !== 'host') {
        app.prepareConfig.mode = 'host';
        changed = true;
      }
    }
    if (changed) savePrepareConfig();
    saveExperimentalModes();
    app.syncExperimentalModesCheckbox();
  };

  app.syncExperimentalModesCheckbox = function () {
    var cb = el('setting-experimental-modes');
    if (cb) cb.checked = !!app.experimentalModesEnabled;
  };

  app.autoState = makeFreshState();
  app._autoEphemeral = {
    revealInterval: null,
    revealTimeout: null,
    nightTurnTimer: null,
    nightTurnTickEnd: 0,
    dayTimerInterval: null,
    introPreInterval: null,
    introMainInterval: null,
    introMainEnd: 0,
    lastWordsInterval: null,
    lastWordsEnd: 0,
    backHold: null,
    _backBound: false,
    _autoGesturesBound: false,
  };

  // ============ Persistence ============

  function saveAuto() {
    try {
      var s = app.autoState;
      var payload = {
        active: s.active,
        history: s.history || [],
      };
      for (var i = 0; i < STATE_KEYS.length; i++) {
        var k = STATE_KEYS[i];
        if (k === 'day') {
          payload.day = s.day
            ? { dayNum: s.day.dayNum, timeLeft: s.day.timeLeft, nominees: s.day.nominees }
            : null;
        } else {
          payload[k] = s[k];
        }
      }
      app.gameRepository.write(STORAGE_KEY, payload);
      if (app.scheduleCurrentGameHistorySync) app.scheduleCurrentGameHistorySync();
    } catch (e) {}
  }
  A.saveAuto = saveAuto;

  function loadAuto() {
    try {
      var d = app.gameRepository.read(STORAGE_KEY, null);
      if (!d) return;
      if (!d || typeof d !== 'object') return;
      var s = makeFreshState();
      s.active = !!d.active;
      s.phase = typeof d.phase === 'string' ? d.phase : 'setup';
      s.seats = Array.isArray(d.seats) ? d.seats : [];
      s.reveal = d.reveal && typeof d.reveal === 'object' ? d.reveal : { cursor: 1 };
      s.nightNum = typeof d.nightNum === 'number' ? d.nightNum : 0;
      s.night = d.night && typeof d.night === 'object' ? d.night : null;
      if (d.day && typeof d.day === 'object') {
        s.day = {
          dayNum: d.day.dayNum || 1,
          timeLeft: typeof d.day.timeLeft === 'number' ? d.day.timeLeft : A.DEFAULT_DAY_SEC,
          nominees: Array.isArray(d.day.nominees) ? d.day.nominees : [],
        };
      }
      s.vote = d.vote && typeof d.vote === 'object' ? d.vote : null;
      s.lastWords = d.lastWords && typeof d.lastWords === 'object' ? d.lastWords : null;
      s.result = d.result || null;
      s.dayNum = typeof d.dayNum === 'number' ? d.dayNum : 0;
      if (isAutoSupportedVariant(d.variant)) {
        s.variant = d.variant;
      } else if (d.is9) {
        s.variant = 'kasper';
      } else {
        s.variant = 'standard';
      }
      s.playerCount = A.DEFAULT_PLAYER_COUNT;
      s.hangedBlacks = Array.isArray(d.hangedBlacks) ? d.hangedBlacks.slice() : [];
      s.merlinGuess = d.merlinGuess && typeof d.merlinGuess === 'object' ? d.merlinGuess : null;
      s.history = Array.isArray(d.history) ? d.history : [];
      app.autoState = s;
      if (A.normalizeRevealState && A.normalizeRevealState(s)) saveAuto();
    } catch (e) {}
  }
  A.loadAuto = loadAuto;

  // ============ Snapshot history ============

  function snapshotState() {
    var o = {};
    for (var i = 0; i < STATE_KEYS.length; i++) o[STATE_KEYS[i]] = app.autoState[STATE_KEYS[i]];
    return JSON.parse(JSON.stringify(o));
  }

  function pushHistory() {
    var s = app.autoState;
    if (!Array.isArray(s.history)) s.history = [];
    s.history.push(snapshotState());
    while (s.history.length > HISTORY_LIMIT) s.history.shift();
  }
  A.pushHistory = pushHistory;

  function popHistory() {
    var s = app.autoState;
    if (!Array.isArray(s.history) || !s.history.length) return null;
    var snap = s.history.pop();
    for (var k in snap) if (Object.prototype.hasOwnProperty.call(snap, k)) s[k] = snap[k];
    return snap;
  }
  A.popHistory = popHistory;

  // Wraps a state mutation in pushHistory/saveAuto bracketing.
  // fn(s) gets the live state. Returning false rolls back the history push.
  function mutate(fn) {
    pushHistory();
    var ret = fn(app.autoState);
    if (ret === false) {
      popHistory();
      return false;
    }
    saveAuto();
    return true;
  }
  A.mutate = mutate;

  // ============ Helpers ============
  // mutate(fn): user action that should be undoable — snapshots history, runs fn,
  //   persists. Use for any state change initiated by a user tap.
  // navAfter(screenId): persist + navigate without snapshotting. Use for internal
  //   transitions driven by timers/sequences (where back-navigation should pop
  //   the user action that started the chain, not the intermediate step).

  function escapeHtml(v) {
    return app.escapeHtml(String(v));
  }
  A.escapeHtml = escapeHtml;
  function el(id) {
    return document.getElementById(id);
  }
  A.el = el;

  function seatById(id) {
    var seats = app.autoState.seats;
    for (var i = 0; i < seats.length; i++) if (seats[i].id === id) return seats[i];
    return null;
  }
  A.seatById = seatById;

  A.navAfter = function (screenId) {
    saveAuto();
    if (screenId) app.navigateToScreen(screenId);
  };

  function aliveSeats() {
    return app.autoState.seats.filter(function (s) {
      return s.alive;
    });
  }
  function isMafiaSide(role) {
    return role === 'mafia' || role === 'don';
  }
  A.isMafiaSide = isMafiaSide;
  A.aliveMafiaIds = function () {
    return aliveSeats()
      .filter(function (s) {
        return isMafiaSide(s.role);
      })
      .map(function (s) {
        return s.id;
      });
  };
  function aliveCount() {
    return aliveSeats().length;
  }
  A.aliveCount = aliveCount;
  A.isMafiaWin = function () {
    var mc = aliveSeats().filter(function (s) {
      return isMafiaSide(s.role);
    }).length;
    var civ = aliveCount() - mc;
    return mc > 0 && mc >= civ;
  };
  A.isPeacefulWin = function () {
    return (
      aliveSeats().filter(function (s) {
        return isMafiaSide(s.role);
      }).length === 0
    );
  };

  A.roleIconEl = function (role, size) {
    var iconId = ROLE_ICONS[role] || ROLE_ICONS.peaceful;
    return app.svgIcon(iconId, 'role-icon' + (size ? ' ' + size : ''));
  };

  A.phaseLabel = function (phase) {
    if (phase === 'reveal') return 'раздача ролей';
    if (phase === 'night-intro') return 'ночь 0 — знакомство';
    if (phase === 'night-pass' || phase === 'night-action') return 'ночные действия';
    if (phase === 'night-result') return 'утро';
    if (phase === 'day') return 'день';
    if (phase === 'vote') return 'голосование';
    if (phase === 'last-words') return 'последние слова';
    if (phase === 'gameover') return 'игра окончена';
    return phase;
  };

  A.resolvePendingPhase = function (phase) {
    if (phase === 'reveal') return 'auto-reveal-screen';
    if (phase === 'night-intro') return 'auto-night-intro-screen';
    if (phase === 'night-pass') return 'auto-night-pass-screen';
    if (phase === 'night-action') return 'auto-night-action-screen';
    if (phase === 'night-result') return 'auto-night-result-screen';
    if (phase === 'day') return 'auto-day-screen';
    if (phase === 'vote') return 'auto-vote-screen';
    if (phase === 'last-words') return 'auto-last-words-screen';
    if (phase === 'merlin-guess') return 'auto-merlin-guess-screen';
    if (phase === 'gameover') return 'auto-end-screen';
    return 'auto-setup-screen';
  };

  A.trackHangIfBlack = function (seatId) {
    if (!getVariant().postGameMerlinGuess) return;
    var s = app.autoState;
    var seat = seatById(seatId);
    if (!seat) return;
    if (seat.role !== 'mafia' && seat.role !== 'don') return;
    if (!Array.isArray(s.hangedBlacks)) s.hangedBlacks = [];
    if (s.hangedBlacks.indexOf(seatId) === -1) s.hangedBlacks.push(seatId);
  };

  A.untrackHang = function (seatId) {
    var s = app.autoState;
    if (!Array.isArray(s.hangedBlacks)) return;
    var ix = s.hangedBlacks.indexOf(seatId);
    if (ix !== -1) s.hangedBlacks.splice(ix, 1);
  };

  A.clearAllAutoTimers = function () {
    var e = app._autoEphemeral;
    if (app.clockApi) {
      app.clockApi.stop('auto-reveal');
      app.clockApi.stop('auto-night-turn');
      app.clockApi.stop('auto-day');
      app.clockApi.stop('auto-last-words');
      app.clockApi.stop('auto-intro-pre');
      app.clockApi.stop('auto-intro-main');
      app.clockApi.stop('auto-intro-gap');
      app.clockApi.stop('auto-intro-freesit');
      app.clockApi.stop('auto-best-move');
    }
    if (e.revealInterval) {
      if (!app.clockApi) clearInterval(e.revealInterval);
      e.revealInterval = null;
    }
    if (e.revealTimeout) {
      if (!app.clockApi) clearTimeout(e.revealTimeout);
      e.revealTimeout = null;
    }
    if (e.nightTurnTimer) {
      if (!app.clockApi) clearInterval(e.nightTurnTimer);
      e.nightTurnTimer = null;
    }
    if (e.dayTimerInterval) {
      if (!app.clockApi) clearInterval(e.dayTimerInterval);
      e.dayTimerInterval = null;
    }
    if (e.introPreInterval) {
      if (!app.clockApi) clearInterval(e.introPreInterval);
      e.introPreInterval = null;
    }
    if (e.introMainInterval) {
      if (!app.clockApi) clearInterval(e.introMainInterval);
      e.introMainInterval = null;
    }
    if (e.introGapInterval) {
      if (!app.clockApi) clearInterval(e.introGapInterval);
      e.introGapInterval = null;
    }
    if (e.introFreesitInterval) {
      if (!app.clockApi) clearInterval(e.introFreesitInterval);
      e.introFreesitInterval = null;
    }
    if (e.lastWordsInterval) {
      if (!app.clockApi) clearInterval(e.lastWordsInterval);
      e.lastWordsInterval = null;
    }
    if (e.bestMoveTimer) {
      if (!app.clockApi) clearInterval(e.bestMoveTimer);
      e.bestMoveTimer = null;
    }
    cancelSfx();
    if (A.stopAutoMusic) {
      A.stopAutoMusic();
    } else if (e.introMusicActive) {
      if (app.stopMusic) {
        try {
          app.stopMusic();
        } catch (_) {}
      }
      e.introMusicActive = false;
    }
  };

  A.playSfx = function (filename) {
    if (app.playSfxVoiceFile) {
      try {
        app.playSfxVoiceFile(filename);
      } catch (_) {}
    }
  };

  var sfxSeqGen = 0;
  A.playSfxSequence = function (files) {
    if (!app.playSfxVoiceFile) return Promise.resolve();
    sfxSeqGen++;
    var gen = sfxSeqGen;
    return files.reduce(function (chain, fname) {
      return chain.then(function () {
        if (gen !== sfxSeqGen) return null;
        try {
          return app.playSfxVoiceFile(fname);
        } catch (_) {
          return null;
        }
      });
    }, Promise.resolve());
  };

  function cancelSfx() {
    sfxSeqGen++;
    if (app.cancelSfxVoice) {
      try {
        app.cancelSfxVoice();
      } catch (_) {}
    }
  }

  A.dayOpenerSeatId = function (dayNum) {
    var s = app.autoState;
    var aliveSet = {};
    for (var i = 0; i < s.seats.length; i++) {
      if (s.seats[i].alive && !isPhantomSeat(s.seats[i])) aliveSet[s.seats[i].id] = true;
    }
    var pc = playerCount();
    var startCandidate = ((dayNum - 1) % pc) + 1;
    for (var k = 0; k < pc; k++) {
      var seatId = ((startCandidate - 1 + k) % pc) + 1;
      if (aliveSet[seatId]) return seatId;
    }
    return null;
  };
})(window.MafiaApp);
