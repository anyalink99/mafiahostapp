(function (app) {
  'use strict';

  var STORAGE_KEY = 'mafia_auto_state';
  var PREPARE_CONFIG_KEY = 'mafia_prepare_config';
  var ROLE_ICONS = { peaceful: 'icon-peaceful', mafia: 'icon-mafia', don: 'icon-don', sheriff: 'icon-sheriff' };
  var ROLE_NAMES = { peaceful: 'Мирный', mafia: 'Мафия', don: 'Дон', sheriff: 'Шериф' };
  var TEAM_NAMES = { peaceful: 'Мирные жители', mafia: 'Мафия' };
  var ELIM_REASON_TITLES = { disqual: 'Удалён', hang: 'Казнён', shot: 'Убит' };

  var DEFAULT_PLAYER_COUNT = 10;
  var SUPPORTED_AUTO_COUNTS = [9, 10];
  var NIGHT_TURN_SEC = 10;
  var INTRO_PRE_SEC = 10;
  var INTRO_MAIN_SEC = 60;
  var LAST_WORDS_SEC = 60;
  var DEFAULT_DAY_SEC = 60;
  var REVOTE_SEC = 30;
  var BACK_HOLD_MS = 5000;
  var BACK_MOVE_THRESHOLD_PX = 24;
  var HISTORY_LIMIT = 120;

  var STATE_KEYS = ['phase','seats','reveal','nightNum','night','day','vote','lastWords','result','dayNum','playerCount','is9'];

  function playerCount() {
    var n = app.autoState && app.autoState.playerCount;
    return (n === 9 || n === 10) ? n : DEFAULT_PLAYER_COUNT;
  }

  function makeFreshState() {
    return {
      active: false,
      phase: 'setup',
      seats: [],
      reveal: { cursor: 1 },
      nightNum: 0,
      night: null,
      day: null,
      vote: null,
      lastWords: null,
      result: null,
      dayNum: 0,
      playerCount: DEFAULT_PLAYER_COUNT,
      is9: false,
      history: [],
    };
  }

  app.prepareConfig = { mode: 'host', count: DEFAULT_PLAYER_COUNT };

  function loadPrepareConfig() {
    try {
      var raw = localStorage.getItem(PREPARE_CONFIG_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return;
      if (d.mode === 'host' || d.mode === 'auto') app.prepareConfig.mode = d.mode;
      if (SUPPORTED_AUTO_COUNTS.indexOf(d.count) !== -1) app.prepareConfig.count = d.count;
    } catch (e) {}
  }

  function savePrepareConfig() {
    try { localStorage.setItem(PREPARE_CONFIG_KEY, JSON.stringify(app.prepareConfig)); } catch (e) {}
  }

  app.autoState = makeFreshState();
  app._autoEphemeral = {
    holdActive: false,
    holdPid: null,
    holdViewed: false,
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
          payload.day = s.day ? { dayNum: s.day.dayNum, timeLeft: s.day.timeLeft, nominees: s.day.nominees } : null;
        } else {
          payload[k] = s[k];
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function loadAuto() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
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
          timeLeft: typeof d.day.timeLeft === 'number' ? d.day.timeLeft : DEFAULT_DAY_SEC,
          nominees: Array.isArray(d.day.nominees) ? d.day.nominees : [],
        };
      }
      s.vote = d.vote && typeof d.vote === 'object' ? d.vote : null;
      s.lastWords = d.lastWords && typeof d.lastWords === 'object' ? d.lastWords : null;
      s.result = d.result || null;
      s.dayNum = typeof d.dayNum === 'number' ? d.dayNum : 0;
      s.playerCount = (d.playerCount === 9 || d.playerCount === 10) ? d.playerCount : DEFAULT_PLAYER_COUNT;
      s.is9 = !!d.is9;
      s.history = Array.isArray(d.history) ? d.history : [];
      app.autoState = s;
    } catch (e) {}
  }

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

  function popHistory() {
    var s = app.autoState;
    if (!Array.isArray(s.history) || !s.history.length) return null;
    var snap = s.history.pop();
    for (var k in snap) if (Object.prototype.hasOwnProperty.call(snap, k)) s[k] = snap[k];
    return snap;
  }

  function clearHistory() {
    app.autoState.history = [];
  }

  // ============ Helpers ============

  function escapeHtml(v) { return app.escapeHtml(String(v)); }
  function el(id) { return document.getElementById(id); }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function rolesForCount(n) {
    if (n === 9) return ['peaceful','peaceful','peaceful','peaceful','peaceful','sheriff','mafia','mafia','don'];
    return ['peaceful','peaceful','peaceful','peaceful','peaceful','peaceful','sheriff','mafia','mafia','don'];
  }

  function seatById(id) {
    var seats = app.autoState.seats;
    for (var i = 0; i < seats.length; i++) if (seats[i].id === id) return seats[i];
    return null;
  }

  function aliveSeats() { return app.autoState.seats.filter(function (s) { return s.alive; }); }
  function isMafiaSide(role) { return role === 'mafia' || role === 'don'; }
  function aliveMafiaIds() { return aliveSeats().filter(function (s) { return isMafiaSide(s.role); }).map(function (s) { return s.id; }); }
  function aliveCount() { return aliveSeats().length; }
  function isMafiaWin() { var mc = aliveSeats().filter(function (s) { return isMafiaSide(s.role); }).length; var civ = aliveCount() - mc; return mc > 0 && mc >= civ; }
  function isPeacefulWin() { return aliveSeats().filter(function (s) { return isMafiaSide(s.role); }).length === 0; }

  function renderRoleIcon(role, size) {
    var iconId = ROLE_ICONS[role] || ROLE_ICONS.peaceful;
    var cls = 'role-icon' + (size ? ' ' + size : '');
    return '<svg class="' + cls + '" aria-hidden="true"><use href="#' + iconId + '"/></svg>';
  }

  function phaseLabel(phase) {
    if (phase === 'reveal') return 'раздача ролей';
    if (phase === 'night-intro') return 'ночь 0 — знакомство';
    if (phase === 'night-pass' || phase === 'night-action') return 'ночные действия';
    if (phase === 'night-result') return 'утро';
    if (phase === 'day') return 'день';
    if (phase === 'vote') return 'голосование';
    if (phase === 'last-words') return 'последние слова';
    if (phase === 'gameover') return 'игра окончена';
    return phase;
  }

  function resolvePendingPhase(phase) {
    if (phase === 'reveal') return 'auto-reveal-screen';
    if (phase === 'night-intro') return 'auto-night-intro-screen';
    if (phase === 'night-pass') return 'auto-night-pass-screen';
    if (phase === 'night-action') return 'auto-night-action-screen';
    if (phase === 'night-result') return 'auto-night-result-screen';
    if (phase === 'day') return 'auto-day-screen';
    if (phase === 'vote') return 'auto-vote-screen';
    if (phase === 'last-words') return 'auto-last-words-screen';
    if (phase === 'gameover') return 'auto-end-screen';
    return 'auto-setup-screen';
  }

  function clearAllAutoTimers() {
    var e = app._autoEphemeral;
    if (e.nightTurnTimer) { clearInterval(e.nightTurnTimer); e.nightTurnTimer = null; }
    if (e.dayTimerInterval) { clearInterval(e.dayTimerInterval); e.dayTimerInterval = null; }
    if (e.introPreInterval) { clearInterval(e.introPreInterval); e.introPreInterval = null; }
    if (e.introMainInterval) { clearInterval(e.introMainInterval); e.introMainInterval = null; }
    if (e.introGapInterval) { clearInterval(e.introGapInterval); e.introGapInterval = null; }
    if (e.introFreesitInterval) { clearInterval(e.introFreesitInterval); e.introFreesitInterval = null; }
    if (e.lastWordsInterval) { clearInterval(e.lastWordsInterval); e.lastWordsInterval = null; }
    if (e.bestMoveTimer) { clearInterval(e.bestMoveTimer); e.bestMoveTimer = null; }
    cancelSfx();
    if (e.introMusicActive) {
      if (app.stopMusic) { try { app.stopMusic(); } catch (_) {} }
      e.introMusicActive = false;
    }
  }

  function playSfx(filename) {
    if (app.playSfxVoiceFile) {
      try { app.playSfxVoiceFile(filename); } catch (_) {}
    }
  }

  var sfxSeqGen = 0;
  function playSfxSequence(files) {
    if (!app.playSfxVoiceFile) return Promise.resolve();
    sfxSeqGen++;
    var gen = sfxSeqGen;
    return files.reduce(function (chain, fname) {
      return chain.then(function () {
        if (gen !== sfxSeqGen) return null;
        try { return app.playSfxVoiceFile(fname); } catch (_) { return null; }
      });
    }, Promise.resolve());
  }

  function cancelSfx() {
    sfxSeqGen++;
    if (app.cancelSfxVoice) {
      try { app.cancelSfxVoice(); } catch (_) {}
    }
  }

  // ============ Setup ============

  app.renderAutoSetup = function () {
    var s = app.autoState;
    var hasInProgress = s.active && s.phase !== 'setup' && s.phase !== 'gameover';
    var resumeBlock = el('auto-resume-block');
    var freshBlock = el('auto-fresh-block');
    if (resumeBlock) resumeBlock.classList.toggle('hidden', !hasInProgress);
    if (freshBlock) freshBlock.classList.toggle('hidden', hasInProgress);
    if (hasInProgress) {
      var phEl = el('auto-resume-phase');
      if (phEl) phEl.textContent = phaseLabel(s.phase);
    } else {
      var summ = el('auto-fresh-summary');
      if (summ) {
        var n = app.prepareConfig.count;
        if (n === 9) {
          summ.innerHTML = '<strong class="text-mafia-gold">9 игроков:</strong> 5 мирных, шериф, 2 мафии, дон. 10-й — фантом-мирный, в первую активную ночь считается убитым; в нулевой круг голосование не проводится.';
        } else {
          summ.innerHTML = '<strong class="text-mafia-gold">10 игроков:</strong> 6 мирных, шериф, 2 мафии, дон.';
        }
      }
    }
  };

  // ============ Prepare-mode screen (host vs auto + count) ============

  app.renderPrepareModeScreen = function () {
    var modeContainer = el('prepare-mode-options');
    if (modeContainer) {
      modeContainer.innerHTML = '';
      var modes = [
        { value: 'host', label: 'Обычный ведущий' },
        { value: 'auto', label: 'Автономный ведущий' }
      ];
      modes.forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-action', 'prepare-mode-pick');
        b.setAttribute('data-mode', m.value);
        b.className = 'prepare-toggle-btn' + (app.prepareConfig.mode === m.value ? ' prepare-toggle-active' : '');
        b.textContent = m.label;
        modeContainer.appendChild(b);
      });
    }
    var countSection = el('prepare-count-section');
    if (countSection) countSection.classList.toggle('hidden', app.prepareConfig.mode !== 'auto');
    if (app.prepareConfig.mode === 'auto') {
      var countContainer = el('prepare-count-options');
      if (countContainer) {
        countContainer.innerHTML = '';
        SUPPORTED_AUTO_COUNTS.forEach(function (n) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('data-action', 'prepare-count-pick');
          b.setAttribute('data-count', String(n));
          b.className = 'prepare-toggle-btn' + (app.prepareConfig.count === n ? ' prepare-toggle-active' : '');
          b.textContent = String(n) + ' игроков';
          countContainer.appendChild(b);
        });
      }
      var hint = el('prepare-count-hint');
      if (hint) {
        if (app.prepareConfig.count === 9) {
          hint.textContent = '10-й считается мирным и убитым в первую активную ночь. В тот же круг голосование не проводится. Шериф в первую активную ночь получает случайную проверку среди 1–9.';
        } else {
          hint.textContent = 'Стандартный состав: 6 мирных, шериф, 2 мафии, дон.';
        }
      }
    }
  };

  app.startFreshAutoGame = function () {
    loadPrepareConfig();
    var count = SUPPORTED_AUTO_COUNTS.indexOf(app.prepareConfig.count) !== -1 ? app.prepareConfig.count : DEFAULT_PLAYER_COUNT;
    var roles = rolesForCount(count);
    var shuffled = shuffle(roles);
    var fresh = makeFreshState();
    fresh.active = true;
    fresh.phase = 'reveal';
    fresh.reveal = { cursor: 1 };
    fresh.dayNum = 0;
    fresh.nightNum = 0;
    fresh.playerCount = count;
    fresh.is9 = (count === 9);
    for (var i = 0; i < count; i++) {
      fresh.seats.push({ id: i + 1, role: shuffled[i], alive: true, fouls: 0, nick: '' });
    }
    app.autoState = fresh;
    saveAuto();
    app.navigateToScreen('auto-reveal-screen');
  };

  app.resumeAutoGame = function () {
    var s = app.autoState;
    if (!s.active) return;
    app.navigateToScreen(resolvePendingPhase(s.phase));
  };

  app.restartAutoGame = function () {
    clearAllAutoTimers();
    app.autoState = makeFreshState();
    saveAuto();
    app.renderAutoSetup();
  };

  // ============ Reveal ============

  app.renderAutoReveal = function () {
    var s = app.autoState;
    var n = s.reveal.cursor;
    if (n > playerCount()) {
      transitionToNightIntro();
      return;
    }
    var numEl = el('auto-reveal-num');
    if (numEl) numEl.textContent = '№' + n;
    var holdBtn = el('auto-reveal-hold-btn');
    if (holdBtn) {
      holdBtn.classList.remove('auto-reveal-active');
      holdBtn.classList.remove('hidden');
    }
    var conf = el('auto-reveal-confirm');
    if (conf) conf.classList.add('hidden');
    var prompt = el('auto-reveal-prompt');
    if (prompt) prompt.textContent = 'Удерживай круг, чтобы увидеть свою роль. Отпустишь — экран очистится.';
    hideRevealOverlay();
    app._autoEphemeral.holdActive = false;
    app._autoEphemeral.holdViewed = false;
    app._autoEphemeral.holdPid = null;
  };

  function showRevealOverlay(role) {
    var ov = el('auto-reveal-overlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    ov.classList.add('is-open');
    var bg = el('auto-reveal-overlay-bg');
    if (bg) bg.className = 'absolute inset-0 ' + (isMafiaSide(role) ? 'bg-mafia-black' : 'bg-mafia-blood');
    var iconWrap = el('auto-reveal-overlay-icon');
    if (iconWrap) iconWrap.innerHTML = renderRoleIcon(role, 'role-icon--large');
    var nameEl = el('auto-reveal-overlay-name');
    if (nameEl) nameEl.textContent = ROLE_NAMES[role] || role;
  }

  function hideRevealOverlay() {
    var ov = el('auto-reveal-overlay');
    if (!ov) return;
    ov.classList.add('hidden');
    ov.classList.remove('is-open');
  }

  function bindRevealHoldGestures() {
    var btn = el('auto-reveal-hold-btn');
    if (!btn || btn._autoBound) return;
    btn._autoBound = true;
    var startHold = function (e) {
      if (e && e.cancelable) e.preventDefault();
      var s = app.autoState;
      if (s.phase !== 'reveal') return;
      var seat = seatById(s.reveal.cursor);
      if (!seat) return;
      app._autoEphemeral.holdActive = true;
      app._autoEphemeral.holdPid = (e && e.pointerId !== undefined) ? e.pointerId : null;
      btn.classList.add('auto-reveal-active');
      showRevealOverlay(seat.role);
      if (e && e.pointerId !== undefined && btn.setPointerCapture) {
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };
    var endHold = function (e) {
      if (!app._autoEphemeral.holdActive) return;
      if (e && e.pointerId !== undefined && app._autoEphemeral.holdPid !== null && e.pointerId !== app._autoEphemeral.holdPid) return;
      app._autoEphemeral.holdActive = false;
      app._autoEphemeral.holdViewed = true;
      btn.classList.remove('auto-reveal-active');
      hideRevealOverlay();
      btn.classList.add('hidden');
      var conf = el('auto-reveal-confirm');
      if (conf) conf.classList.remove('hidden');
      var prompt = el('auto-reveal-prompt');
      if (prompt) {
        var s = app.autoState;
        var next = (s.reveal.cursor || 1) + 1;
        if (next > playerCount()) {
          prompt.textContent = 'Запомнил? Кладите телефон в центр стола.';
        } else {
          prompt.textContent = 'Запомнил? Передавай дальше, игроку №' + next + '.';
        }
      }
    };
    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', startHold);
      btn.addEventListener('pointerup', endHold);
      btn.addEventListener('pointercancel', endHold);
      btn.addEventListener('pointerleave', endHold);
    } else {
      btn.addEventListener('mousedown', startHold);
      btn.addEventListener('mouseup', endHold);
      btn.addEventListener('mouseleave', endHold);
      btn.addEventListener('touchstart', function (e) { startHold(e); }, { passive: false });
      btn.addEventListener('touchend', endHold);
      btn.addEventListener('touchcancel', endHold);
    }
  }

  app.advanceReveal = function () {
    pushHistory();
    var s = app.autoState;
    s.reveal.cursor = (s.reveal.cursor || 1) + 1;
    if (s.reveal.cursor > playerCount()) {
      s.reveal.cursor = playerCount();
      saveAuto();
      transitionToNightIntro();
      return;
    }
    saveAuto();
    app.renderAutoReveal();
  };

  // ============ Night 0 — intro ============

  function transitionToNightIntro() {
    var s = app.autoState;
    s.phase = 'night-intro';
    s.nightNum = 0;
    saveAuto();
    app.navigateToScreen('auto-night-intro-screen');
  }

  var FREESIT_SEC = 30;
  var INTRO_GAP_SEC = 5;

  function showIntroStage(name) {
    var names = ['pre', 'main', 'gap', 'freesit'];
    for (var i = 0; i < names.length; i++) {
      var x = el('auto-intro-stage-' + names[i]);
      if (x) x.classList.toggle('hidden', names[i] !== name);
    }
  }

  function clearIntroTimers() {
    var e = app._autoEphemeral;
    if (e.introPreInterval) { clearInterval(e.introPreInterval); e.introPreInterval = null; }
    if (e.introMainInterval) { clearInterval(e.introMainInterval); e.introMainInterval = null; }
    if (e.introGapInterval) { clearInterval(e.introGapInterval); e.introGapInterval = null; }
    if (e.introFreesitInterval) { clearInterval(e.introFreesitInterval); e.introFreesitInterval = null; }
  }

  function startNightIntroMusic() {
    if (app._autoEphemeral.introMusicActive) return;
    var hasLocal = false, hasSpotify = false;
    if (app.musicGetSlotPlayablePool) {
      try { hasLocal = (app.musicGetSlotPlayablePool('2') || []).length > 0; } catch (_) {}
    }
    if (app.spotifyGetSlotPlaylist && app.spotifyIsAuthenticated) {
      try {
        var sp = app.spotifyGetSlotPlaylist('2');
        hasSpotify = !!(sp && sp.playlistId && app.spotifyIsAuthenticated());
      } catch (_) {}
    }
    if (!hasLocal && !hasSpotify) return;
    if (!app.musicStartSlot) return;
    if (app.musicSetSessionVolumeMul) app.musicSetSessionVolumeMul(null);
    try { app.musicStartSlot('2'); } catch (_) {}
    app._autoEphemeral.introMusicActive = true;
  }

  function stopIntroMusic() {
    if (!app._autoEphemeral.introMusicActive) return;
    if (app.stopMusic) { try { app.stopMusic(); } catch (_) {} }
    app._autoEphemeral.introMusicActive = false;
  }

  app.renderAutoNightIntro = function () {
    clearIntroTimers();
    showIntroStage('pre');
    var preEl = el('auto-intro-pre-countdown');
    if (preEl) preEl.textContent = String(INTRO_PRE_SEC);
    startNightIntroMusic();
    var preLeft = INTRO_PRE_SEC;
    app._autoEphemeral.introPreInterval = setInterval(function () {
      preLeft--;
      var p = el('auto-intro-pre-countdown');
      if (p) p.textContent = String(Math.max(0, preLeft));
      if (preLeft <= 0) {
        clearInterval(app._autoEphemeral.introPreInterval);
        app._autoEphemeral.introPreInterval = null;
        startIntroBriefing();
      }
    }, 1000);
  };

  function startIntroBriefing() {
    showIntroStage('main');
    var mainEl = el('auto-intro-main-countdown');
    if (mainEl) mainEl.textContent = String(INTRO_MAIN_SEC);
    playSfx('mafia-wakes-acquaintance.mp3');
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([60, 40, 60]); } catch (_) {}
    }
    app._autoEphemeral.introMainEnd = Date.now() + INTRO_MAIN_SEC * 1000;
    app._autoEphemeral.intro10Played = false;
    app._autoEphemeral.introMainInterval = setInterval(function () {
      var left = Math.max(0, Math.ceil((app._autoEphemeral.introMainEnd - Date.now()) / 1000));
      var m = el('auto-intro-main-countdown');
      if (m) m.textContent = String(left);
      if (left === 10 && !app._autoEphemeral.intro10Played) {
        app._autoEphemeral.intro10Played = true;
        playSfx('mafia-10-seconds acquaintance.mp3');
      }
      if (left <= 0) {
        clearInterval(app._autoEphemeral.introMainInterval);
        app._autoEphemeral.introMainInterval = null;
        startIntroGap();
      }
    }, 250);
  }

  function startIntroGap() {
    showIntroStage('gap');
    playSfx('mafia-leaves-acquaintance.mp3');
    if (app.musicSetSessionVolumeMul) app.musicSetSessionVolumeMul(0.5);
    var endTs = Date.now() + INTRO_GAP_SEC * 1000;
    var c = el('auto-intro-gap-countdown');
    if (c) c.textContent = String(INTRO_GAP_SEC);
    app._autoEphemeral.introGapInterval = setInterval(function () {
      var left = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
      var cd = el('auto-intro-gap-countdown');
      if (cd) cd.textContent = String(left);
      if (left <= 0) {
        clearInterval(app._autoEphemeral.introGapInterval);
        app._autoEphemeral.introGapInterval = null;
        startFreeSeating();
      }
    }, 250);
  }

  function startFreeSeating() {
    showIntroStage('freesit');
    playSfx('30-seconds-free-sit.mp3');
    var endTs = Date.now() + FREESIT_SEC * 1000;
    var c = el('auto-intro-freesit-countdown');
    if (c) c.textContent = String(FREESIT_SEC);
    app._autoEphemeral.introFreesitInterval = setInterval(function () {
      var left = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
      var cd = el('auto-intro-freesit-countdown');
      if (cd) cd.textContent = String(left);
      if (left <= 0) {
        clearInterval(app._autoEphemeral.introFreesitInterval);
        app._autoEphemeral.introFreesitInterval = null;
        finishFreeSeating();
      }
    }, 250);
  }

  function finishFreeSeating() {
    stopIntroMusic();
    var opener = dayOpenerSeatId(1);
    var seq = ['morning.mp3'];
    if (opener) seq.push(opener + '.mp3');
    playSfxSequence(seq);
    var s = app.autoState;
    s.dayNum = 1;
    transitionToDay(1);
  }

  app.handleIntroFinish = function () {
    pushHistory();
    if (app._autoEphemeral.introMainInterval) {
      clearInterval(app._autoEphemeral.introMainInterval);
      app._autoEphemeral.introMainInterval = null;
    }
    startIntroGap();
  };

  app.handleFreesitFinish = function () {
    pushHistory();
    if (app._autoEphemeral.introFreesitInterval) {
      clearInterval(app._autoEphemeral.introFreesitInterval);
      app._autoEphemeral.introFreesitInterval = null;
    }
    finishFreeSeating();
  };

  // ============ Night phase (kill nights) ============

  function dayOpenerSeatId(dayNum) {
    var s = app.autoState;
    var aliveSet = {};
    for (var i = 0; i < s.seats.length; i++) {
      if (s.seats[i].alive) aliveSet[s.seats[i].id] = true;
    }
    var pc = playerCount();
    var startCandidate = ((dayNum - 1) % pc) + 1;
    for (var k = 0; k < pc; k++) {
      var seatId = ((startCandidate - 1 + k) % pc) + 1;
      if (aliveSet[seatId]) return seatId;
    }
    return null;
  }

  function buildNightTurnOrder(nightNum) {
    var s = app.autoState;
    var aliveSet = {};
    for (var i = 0; i < s.seats.length; i++) {
      if (s.seats[i].alive) aliveSet[s.seats[i].id] = true;
    }
    var startCandidate = ((nightNum - 1) % playerCount()) + 1;
    var order = [];
    for (var k = 0; k < playerCount(); k++) {
      var seatId = ((startCandidate - 1 + k) % playerCount()) + 1;
      if (aliveSet[seatId]) order.push(seatId);
    }
    return order;
  }

  function transitionToNight(nightNum) {
    var s = app.autoState;
    var order = buildNightTurnOrder(nightNum);
    if (!order.length) { checkWinAndContinue(); return; }
    s.phase = 'night-pass';
    s.nightNum = nightNum;
    s.night = {
      nightNum: nightNum,
      turnOrder: order,
      cursor: 0,
      mafiaVotes: {},
      sheriffCheck: null,
      donCheck: null,
      donKillPicked: false,
      victimId: null,
      phantom10Kill: false,
      sheriffPredetermined: null,
    };
    if (s.is9 && nightNum === 1) {
      s.night.phantom10Kill = true;
      s.night.donKillPicked = true;
      var sheriffSeat = null;
      for (var si = 0; si < s.seats.length; si++) {
        if (s.seats[si].alive && s.seats[si].role === 'sheriff') { sheriffSeat = s.seats[si]; break; }
      }
      if (sheriffSeat) {
        var others = [];
        for (var oi = 0; oi < s.seats.length; oi++) {
          if (s.seats[oi].alive && s.seats[oi].id !== sheriffSeat.id) others.push(s.seats[oi]);
        }
        if (others.length) {
          var pick = others[Math.floor(Math.random() * others.length)];
          s.night.sheriffPredetermined = { target: pick.id, isMafia: isMafiaSide(pick.role) };
        }
      }
    }
    saveAuto();
    app.navigateToScreen('auto-night-pass-screen');
  }

  app.renderAutoNightPass = function () {
    var s = app.autoState;
    if (!s.night) { transitionToNight(s.nightNum && s.nightNum >= 1 ? s.nightNum : 1); return; }
    var idx = s.night.cursor;
    if (idx >= s.night.turnOrder.length) { transitionToNightResult(); return; }
    var seatId = s.night.turnOrder[idx];
    var numEl = el('auto-night-pass-num');
    if (numEl) numEl.textContent = '№' + seatId;
    var labelEl = el('auto-night-pass-label');
    if (labelEl) labelEl.textContent = 'Ночь ' + s.night.nightNum;
  };

  app.startNightTurn = function () {
    pushHistory();
    var s = app.autoState;
    if (!s.night) return;
    s.phase = 'night-action';
    saveAuto();
    app.navigateToScreen('auto-night-action-screen');
  };

  app.renderAutoNightAction = function () {
    var s = app.autoState;
    if (!s.night) return;
    var idx = s.night.cursor;
    if (idx >= s.night.turnOrder.length) { transitionToNightResult(); return; }
    var seatId = s.night.turnOrder[idx];
    var seat = seatById(seatId);
    if (!seat) return;
    var seatNumEl = el('auto-night-action-seat');
    if (seatNumEl) seatNumEl.textContent = String(seatId);
    var labelEl = el('auto-night-action-label');
    if (labelEl) labelEl.textContent = 'Ночь ' + s.night.nightNum;
    var body = el('auto-night-action-body');
    if (body) body.innerHTML = renderNightActionBodyHtml(seat);
  };

  function renderNightActionBodyHtml(seat) {
    var role = seat.role;
    if (role === 'mafia') return renderMafiaSection(seat, false);
    if (role === 'don') return renderMafiaSection(seat, true) + renderDonCheckSection(seat);
    if (role === 'sheriff') return renderSheriffSection(seat);
    return renderPeacefulSection();
  }

  function renderTargetGrid(candidates, selectedId, action) {
    if (!candidates.length) return '<p class="text-mafia-cream/60 text-sm text-center py-4">Целей нет.</p>';
    var out = '<div class="auto-target-grid">';
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var isSel = selectedId === c.id;
      var nick = c.nick && c.nick.trim() ? '<span class="auto-target-nick">' + escapeHtml(c.nick.trim()) + '</span>' : '';
      out += '<button type="button" class="auto-target-tile' + (isSel ? ' auto-target-selected' : '') + '" data-action="' + action + '" data-target-id="' + c.id + '">№' + c.id + nick + '</button>';
    }
    out += '</div>';
    return out;
  }

  function renderMafiaSection(seat, isDon) {
    var s = app.autoState;
    if (s.night.phantom10Kill) {
      var heading0 = isDon ? 'Выстрел мафии (ты — Дон)' : 'Выстрел мафии';
      return '<div class="auto-night-section">' +
        '<h2 class="font-display text-mafia-gold text-lg tracking-widest mb-1">' + heading0 + '</h2>' +
        '<p class="text-mafia-cream/85 text-sm">В первую активную ночь мафия не стреляет — 10-й считается убитым. Просто передавай дальше.</p>' +
        '</div>';
    }
    var alive = aliveSeats();
    var candidates = alive;
    var sel = s.night.mafiaVotes[seat.id] || null;
    var heading = isDon ? 'Выстрел мафии (ты — Дон)' : 'Выстрел мафии';
    var sub = 'Тапни № жертвы (можно любого живого, включая себя). Выстрелы других мафов скрыты — нужно единогласие, иначе промах.';
    return '<div class="auto-night-section">' +
      '<h2 class="font-display text-mafia-gold text-lg tracking-widest mb-1">' + heading + '</h2>' +
      '<p class="text-mafia-cream/65 text-xs mb-3">' + sub + '</p>' +
      renderTargetGrid(candidates, sel, 'auto-mafia-pick') +
      '</div>';
  }

  function renderDonCheckSection(seat) {
    var s = app.autoState;
    var locked = !s.night.donKillPicked;
    var alive = aliveSeats();
    var candidates = alive.filter(function (x) { return x.id !== seat.id; });
    var donCheck = s.night.donCheck;
    var resultBanner = '';
    if (donCheck && donCheck.by === seat.id) {
      var checkedSeat = seatById(donCheck.target);
      var nickPart = (checkedSeat && checkedSeat.nick && checkedSeat.nick.trim()) ? ' (' + escapeHtml(checkedSeat.nick.trim()) + ')' : '';
      resultBanner = '<div class="auto-night-result-banner">' +
        '№' + donCheck.target + nickPart + ' — ' + (donCheck.isSheriff ? '<span class="text-mafia-gold font-semibold">шериф</span>' : 'не шериф') +
        '</div>';
    }
    var sel = donCheck && donCheck.by === seat.id ? donCheck.target : null;
    return '<div class="auto-night-section' + (locked ? ' auto-section-locked' : '') + '">' +
      '<h2 class="font-display text-mafia-gold text-lg tracking-widest mb-1">Проверка на шерифа</h2>' +
      '<p class="text-mafia-cream/65 text-xs mb-3">Тапни №, чтобы проверить, шериф ли он.</p>' +
      renderTargetGrid(candidates, sel, 'auto-don-check') +
      resultBanner +
      '</div>';
  }

  function renderSheriffSection(seat) {
    var s = app.autoState;
    if (s.night.phantom10Kill && s.night.sheriffPredetermined) {
      var pre = s.night.sheriffPredetermined;
      var preSeat = seatById(pre.target);
      var preNick = (preSeat && preSeat.nick && preSeat.nick.trim()) ? ' (' + escapeHtml(preSeat.nick.trim()) + ')' : '';
      return '<div class="auto-night-section">' +
        '<h2 class="font-display text-mafia-gold text-lg tracking-widest mb-1">Случайная проверка шерифа</h2>' +
        '<p class="text-mafia-cream/85 text-sm mb-3">В первую активную ночь шериф не выбирает цель — проверка случайна.</p>' +
        '<div class="auto-night-result-banner">№' + pre.target + preNick + ' — ' +
        (pre.isMafia ? '<span class="text-mafia-gold font-semibold">мафия</span>' : 'не мафия') +
        '</div>' +
        '</div>';
    }
    var alive = aliveSeats();
    var candidates = alive.filter(function (x) { return x.id !== seat.id; });
    var check = s.night.sheriffCheck;
    var resultBanner = '';
    if (check && check.by === seat.id) {
      var t = seatById(check.target);
      var nickPart = (t && t.nick && t.nick.trim()) ? ' (' + escapeHtml(t.nick.trim()) + ')' : '';
      resultBanner = '<div class="auto-night-result-banner">' +
        '№' + check.target + nickPart + ' — ' + (check.isMafia ? '<span class="text-mafia-gold font-semibold">мафия</span>' : 'не мафия') +
        '</div>';
    }
    var sel = check && check.by === seat.id ? check.target : null;
    return '<div class="auto-night-section">' +
      '<h2 class="font-display text-mafia-gold text-lg tracking-widest mb-1">Проверка шерифа</h2>' +
      '<p class="text-mafia-cream/65 text-xs mb-3">Тапни №, чтобы проверить, мафия ли он.</p>' +
      renderTargetGrid(candidates, sel, 'auto-sheriff-check') +
      resultBanner +
      '</div>';
  }

  function renderPeacefulSection() {
    return '<div class="auto-night-section">' +
      '<h2 class="font-display text-mafia-gold text-lg tracking-widest mb-2">Твой ход</h2>' +
      '<p class="text-mafia-cream/85 text-sm leading-relaxed">' +
      'Сделай вид, что обдумываешь действие. Не показывай экран соседям. Жми «Готово», когда таймер истечёт.' +
      '</p>' +
      '<div class="mt-4 text-center text-mafia-gold/60 font-display text-7xl">♠</div>' +
      '</div>';
  }

  app.handleNightTurnDone = function () {
    var s = app.autoState;
    if (!s.night) return;
    pushHistory();
    s.night.cursor++;
    if (s.night.cursor >= s.night.turnOrder.length) {
      transitionToNightResult();
    } else {
      s.phase = 'night-pass';
      saveAuto();
      app.navigateToScreen('auto-night-pass-screen');
    }
  };

  app.handleMafiaPick = function (seatId, targetId) {
    var s = app.autoState;
    if (!s.night) return;
    var seat = seatById(seatId);
    if (!seat || !isMafiaSide(seat.role)) return;
    pushHistory();
    if (s.night.mafiaVotes[seatId] === targetId) {
      delete s.night.mafiaVotes[seatId];
      if (seat.role === 'don') {
        s.night.donKillPicked = false;
        if (s.night.donCheck && s.night.donCheck.by === seatId) s.night.donCheck = null;
      }
    } else {
      s.night.mafiaVotes[seatId] = targetId;
      if (seat.role === 'don') s.night.donKillPicked = true;
    }
    saveAuto();
    app.renderAutoNightAction();
  };

  app.handleDonCheck = function (seatId, targetId) {
    var s = app.autoState;
    if (!s.night) return;
    var seat = seatById(seatId);
    if (!seat || seat.role !== 'don') return;
    if (!s.night.donKillPicked) return;
    if (s.night.donCheck && s.night.donCheck.by === seatId) return;
    var target = seatById(targetId);
    if (!target) return;
    pushHistory();
    s.night.donCheck = { by: seatId, target: targetId, isSheriff: target.role === 'sheriff' };
    saveAuto();
    app.renderAutoNightAction();
  };

  app.handleSheriffCheck = function (seatId, targetId) {
    var s = app.autoState;
    if (!s.night) return;
    var seat = seatById(seatId);
    if (!seat || seat.role !== 'sheriff') return;
    if (s.night.sheriffCheck && s.night.sheriffCheck.by === seatId) return;
    var target = seatById(targetId);
    if (!target) return;
    pushHistory();
    s.night.sheriffCheck = { by: seatId, target: targetId, isMafia: isMafiaSide(target.role) };
    saveAuto();
    app.renderAutoNightAction();
  };

  function pickMafiaVictimUnanimous() {
    var s = app.autoState;
    if (!s.night) return null;
    var aliveM = aliveMafiaIds();
    if (!aliveM.length) return null;
    var first = s.night.mafiaVotes[aliveM[0]];
    if (!first) return null;
    for (var i = 1; i < aliveM.length; i++) {
      if (s.night.mafiaVotes[aliveM[i]] !== first) return null;
    }
    return first;
  }

  function transitionToNightResult() {
    var s = app.autoState;
    var victimId = (s.night && s.night.phantom10Kill) ? null : pickMafiaVictimUnanimous();
    if (s.night) s.night.victimId = victimId;
    if (victimId) {
      var v = seatById(victimId);
      if (v) {
        v.alive = false;
        v.eliminationReason = 'shot';
      }
    }
    s.phase = 'night-result';
    saveAuto();
    app.navigateToScreen('auto-night-result-screen');
    setTimeout(playNightResultAudio, 50);
  }

  function playNightResultAudio() {
    var s = app.autoState;
    if (!s.night) return;
    var phantom = !!s.night.phantom10Kill;
    var victimId = s.night.victimId;
    var nightNum = s.night.nightNum;
    var realKill = (victimId !== null && victimId !== undefined && !phantom);
    if (phantom) {
      var nextDay = (s.dayNum || 0) + 1;
      var opener = dayOpenerSeatId(nextDay);
      var seq = ['morning.mp3'];
      if (opener) seq.push(opener + '.mp3');
      playSfxSequence(seq);
      return;
    }
    if (!realKill) {
      playSfxSequence(['morning-miss.mp3']);
      return;
    }
    if (nightNum === 1) {
      playSfxSequence([
        'first-killed-best-predicition.mp3',
        victimId + '.mp3'
      ]).then(function () {
        startBestMoveCountdown(function () {
          playSfxSequence(['morning-last-speech.mp3', victimId + '.mp3']);
        });
      });
    } else {
      playSfxSequence(['morning-last-speech.mp3', victimId + '.mp3']);
    }
  }

  function startBestMoveCountdown(onDone) {
    var bm = el('auto-night-result-bestmove');
    if (bm) bm.classList.remove('hidden');
    var n = 10;
    var cd = el('auto-night-result-bestmove-countdown');
    if (cd) cd.textContent = String(n);
    if (app._autoEphemeral.bestMoveTimer) {
      clearInterval(app._autoEphemeral.bestMoveTimer);
      app._autoEphemeral.bestMoveTimer = null;
    }
    app._autoEphemeral.bestMoveTimer = setInterval(function () {
      n--;
      var c = el('auto-night-result-bestmove-countdown');
      if (c) c.textContent = String(Math.max(0, n));
      if (n <= 0) {
        clearInterval(app._autoEphemeral.bestMoveTimer);
        app._autoEphemeral.bestMoveTimer = null;
        var bm2 = el('auto-night-result-bestmove');
        if (bm2) bm2.classList.add('hidden');
        if (typeof onDone === 'function') onDone();
      }
    }, 1000);
  }

  app.renderAutoNightResult = function () {
    var s = app.autoState;
    var body = el('auto-night-result-body');
    var labelEl = el('auto-night-result-label');
    if (labelEl) labelEl.textContent = s.night ? 'Ночь ' + s.night.nightNum : 'Ночь';
    var bm = el('auto-night-result-bestmove');
    if (bm) bm.classList.add('hidden');
    if (!body) return;
    if (s.night && s.night.phantom10Kill) {
      body.innerHTML = '<p class="font-display text-mafia-gold/80 text-sm tracking-widest uppercase mb-1">Ночью убит</p>' +
        '<h1 class="font-display font-bold text-6xl text-mafia-blood drop-shadow-[0_0_10px_rgba(127,29,29,0.4)] mb-2">№10</h1>' +
        '<p class="text-mafia-cream/85 text-base">мирный житель</p>';
    } else if (s.night && s.night.victimId) {
      var v = seatById(s.night.victimId);
      var nick = v && v.nick && v.nick.trim() ? escapeHtml(v.nick.trim()) : '';
      body.innerHTML = '<p class="font-display text-mafia-gold/80 text-sm tracking-widest uppercase mb-1">Ночью убит</p>' +
        '<h1 class="font-display font-bold text-6xl text-mafia-blood drop-shadow-[0_0_10px_rgba(127,29,29,0.4)] mb-2">№' + s.night.victimId + '</h1>' +
        (nick ? '<p class="text-mafia-cream/85 text-base">' + nick + '</p>' : '');
    } else {
      body.innerHTML = '<h1 class="font-display font-bold text-4xl text-mafia-gold mb-2">Промах</h1>' +
        '<p class="text-mafia-cream/75 text-sm">Этой ночью никто не погиб — мафия не договорилась.</p>';
    }
  };

  app.continueAfterNightResult = function () {
    pushHistory();
    if (isPeacefulWin()) { endGame('peaceful'); return; }
    if (isMafiaWin()) { endGame('mafia'); return; }
    var s = app.autoState;
    s.dayNum = (s.dayNum || 0) + 1;
    transitionToDay(s.dayNum);
  };

  // ============ Day ============

  function transitionToDay(dayNum) {
    var s = app.autoState;
    s.phase = 'day';
    s.day = { dayNum: dayNum, timeLeft: DEFAULT_DAY_SEC, nominees: [] };
    saveAuto();
    app.navigateToScreen('auto-day-screen');
  }

  app.renderAutoDay = function () {
    var s = app.autoState;
    if (!s.day) { transitionToDay(1); return; }
    var lab = el('auto-day-label');
    if (lab) lab.textContent = 'День ' + s.day.dayNum;
    var t = el('auto-day-timer');
    if (t) t.textContent = String(s.day.timeLeft);
    syncAutoDayTimerAppearance();
    applyAutoDayTimerButtonState(false);
    renderAutoDayPlayers();
    refreshAutoDayNominees();
    refreshAutoDaySwitchHostButton();
  };

  function isNoVoteDay() {
    var s = app.autoState;
    return !!(s.is9 && s.day && s.day.dayNum === 1);
  }

  function syncAutoDayTimerAppearance() {
    var s = app.autoState;
    if (!s.day) return;
    var pill = el('auto-day-timer-pill');
    var urgent = s.day.timeLeft <= 10;
    if (pill) {
      pill.classList.toggle('border-mafia-blood/55', urgent);
      pill.classList.toggle('bg-mafia-blood', urgent);
      pill.classList.toggle('border-mafia-border/35', !urgent);
      pill.classList.toggle('bg-black/25', !urgent);
    }
  }

  function applyAutoDayTimerButtonState(running) {
    var btn = el('auto-day-start-btn');
    if (!btn) return;
    btn.textContent = running ? 'Пауза' : 'Старт';
    btn.setAttribute('aria-pressed', running ? 'true' : 'false');
    var base = 'px-3 py-2 sm:px-5 sm:py-3 font-semibold rounded uppercase text-xs sm:text-sm tracking-wider cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-[118ms] ease-out';
    btn.className = base + (running
      ? ' bg-red-900 hover:bg-red-800 border border-red-700 text-white'
      : ' bg-green-800 hover:bg-green-700 border border-green-600 text-white');
  }

  app.toggleAutoDayTimer = function () {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) {
      clearInterval(app._autoEphemeral.dayTimerInterval);
      app._autoEphemeral.dayTimerInterval = null;
      applyAutoDayTimerButtonState(false);
      return;
    }
    applyAutoDayTimerButtonState(true);
    app._autoEphemeral.dayTimerInterval = setInterval(function () {
      if (!s.day) {
        clearInterval(app._autoEphemeral.dayTimerInterval);
        app._autoEphemeral.dayTimerInterval = null;
        return;
      }
      if (s.day.timeLeft > 0) {
        s.day.timeLeft--;
        var t = el('auto-day-timer');
        if (t) t.textContent = String(s.day.timeLeft);
        syncAutoDayTimerAppearance();
        if (app.timerVoiceEnabled && s.day.timeLeft === 10 && app.playTimerVoiceCue) {
          app.playTimerVoiceCue('10');
        }
        if (s.day.timeLeft <= 0) {
          clearInterval(app._autoEphemeral.dayTimerInterval);
          app._autoEphemeral.dayTimerInterval = null;
          applyAutoDayTimerButtonState(false);
          if (app.timerVoiceEnabled && app.playTimerVoiceCue) {
            app.playTimerVoiceCue('0');
          }
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([90, 45, 90]); } catch (_) {}
          }
        }
        saveAuto();
      }
    }, 1000);
  };

  app.resetAutoDayTimer = function (sec) {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) { clearInterval(app._autoEphemeral.dayTimerInterval); app._autoEphemeral.dayTimerInterval = null; }
    s.day.timeLeft = sec;
    var t = el('auto-day-timer');
    if (t) t.textContent = String(sec);
    syncAutoDayTimerAppearance();
    applyAutoDayTimerButtonState(false);
    saveAuto();
  };

  function autoPlayerStatusHtml(seat) {
    var s = app.autoState;
    var inQueue = s.day && s.day.nominees.indexOf(seat.id) !== -1;
    if (seat.eliminationReason) {
      return '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-blood/50 bg-mafia-blood/10 text-mafia-blood" aria-hidden="true"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-elim-' + seat.eliminationReason + '"/></svg></div>';
    }
    if (inQueue) {
      return '<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-mafia-gold/70 bg-mafia-blood/15 text-mafia-gold" title="Выставлен" aria-label="Выставлен"><svg class="pointer-events-none h-[18px] w-[18px]"><use href="#icon-nominated"/></svg></div>';
    }
    return '<div class="invisible flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-transparent" aria-hidden="true"></div>';
  }

  function renderAutoDayPlayers() {
    var list = el('auto-day-players-list');
    if (!list) return;
    var s = app.autoState;
    list.innerHTML = '';
    var rows = Math.ceil(playerCount() / 2);
    var left = Math.ceil(playerCount() / 2);
    var order = [];
    for (var i = left - 1; i >= 0; i--) order.push(i);
    for (var j = left; j < playerCount(); j++) order.push(j);
    list.className = 'grid grid-flow-col grid-cols-2 gap-2 flex-1 min-h-0 min-w-0 overflow-hidden';
    list.style.gridTemplateRows = 'repeat(' + rows + ', minmax(0, 1fr))';
    order.forEach(function (idx) {
      var seat = s.seats[idx];
      if (!seat) return;
      var out = !!seat.eliminationReason || seat.alive === false;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'player-cell player-slot flex h-full min-h-0 min-w-0 w-full flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-2 pt-2 pb-1 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2.5 sm:pt-2.5 sm:pb-1.5' + (out ? ' opacity-[0.55]' : '');
      btn.setAttribute('data-action', 'auto-day-player-slot-open');
      btn.setAttribute('data-player-id', String(seat.id));
      var nickTrim = seat.nick ? seat.nick.trim() : '';
      var foulPillClass = 'player-slot__foul-pill flex shrink-0 items-center justify-center rounded border px-2 py-1 ' + (seat.fouls > 2 ? 'border-mafia-blood/55 bg-mafia-blood' : 'border-mafia-border/35 bg-black/25');
      btn.innerHTML =
        '<div class="player-slot__row grid w-full min-h-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1">' +
          '<div class="flex min-w-0 justify-start">' + autoPlayerStatusHtml(seat) + '</div>' +
          '<span class="font-display text-3xl font-bold leading-none tracking-wide text-mafia-gold tabular-nums sm:text-4xl">№' + seat.id + '</span>' +
          '<div class="flex min-w-0 justify-end">' +
            '<div class="' + foulPillClass + '"><span class="font-sans font-semibold leading-none tabular-nums text-sm sm:text-base text-mafia-cream/95">ф: ' + seat.fouls + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="player-slot-nick mt-1 mb-2 min-h-[1.75rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-2 py-1 text-center font-sans text-sm leading-snug ' + (nickTrim ? 'text-mafia-cream/95' : 'text-mafia-cream/30') + '">' +
          (nickTrim ? escapeHtml(nickTrim) : 'Псевдоним') +
        '</div>';
      list.appendChild(btn);
    });
    refreshAutoDaySwitchHostButton();
  }

  function patchAutoPlayerSlotStatus(seatId) {
    var list = el('auto-day-players-list');
    if (!list) return;
    var btn = list.querySelector('[data-player-id="' + seatId + '"]');
    if (!btn) return;
    var seat = seatById(seatId);
    if (!seat) return;
    var row = btn.querySelector('.player-slot__row');
    if (!row || !row.children[0]) return;
    row.children[0].innerHTML = autoPlayerStatusHtml(seat);
  }

  function refreshAutoDaySwitchHostButton() {
    var btn = el('auto-day-switch-host');
    if (!btn) return;
    var s = app.autoState;
    var anyOut = false;
    if (s.seats && s.seats.length) {
      for (var i = 0; i < s.seats.length; i++) {
        if (!s.seats[i].alive) { anyOut = true; break; }
      }
    }
    btn.classList.toggle('hidden', !anyOut);
  }

  function refreshAutoDayNominees() {
    var s = app.autoState;
    var noVote = isNoVoteDay();
    var elQ = el('auto-day-nominees');
    if (elQ) {
      elQ.textContent = s.day && s.day.nominees.length ? s.day.nominees.join(' → ') : '—';
      elQ.classList.toggle('hidden', noVote);
    }
    var voteBtn = el('auto-day-go-vote');
    if (voteBtn) {
      if (noVote) {
        voteBtn.classList.add('hidden');
      } else {
        voteBtn.classList.remove('hidden');
        var enable = s.day && s.day.nominees.length >= 1;
        voteBtn.disabled = !enable;
        voteBtn.className = enable
          ? 'w-full py-2.5 bg-mafia-blood hover:bg-mafia-bloodLight border-2 border-mafia-gold text-mafia-gold font-semibold rounded text-sm uppercase tracking-wider cursor-pointer transition-all active:scale-[0.98]'
          : 'w-full py-2.5 bg-mafia-blood/50 border border-mafia-gold/40 text-mafia-gold/50 font-semibold rounded text-sm uppercase tracking-wider cursor-not-allowed transition-all';
      }
    }
    var skipBtn = document.querySelector('[data-action="auto-day-skip-vote"]');
    if (skipBtn) skipBtn.textContent = noVote ? 'Перейти в ночь' : 'Без голосования → ночь';
  }

  // ============ Auto-day mutations ============

  function addAutoNominee(seatId, opts) {
    var s = app.autoState;
    if (!s.day) return false;
    var seat = seatById(seatId);
    if (!seat || seat.eliminationReason) return false;
    if (s.day.nominees.indexOf(seatId) !== -1) return false;
    pushHistory();
    s.day.nominees.push(seatId);
    saveAuto();
    if (!opts || !opts.skipRender) renderAutoDayPlayers();
    refreshAutoDayNominees();
    return true;
  }

  function removeAutoNominee(seatId, opts) {
    var s = app.autoState;
    if (!s.day) return false;
    var ix = s.day.nominees.indexOf(seatId);
    if (ix === -1) return false;
    pushHistory();
    s.day.nominees.splice(ix, 1);
    saveAuto();
    if (!opts || !opts.skipRender) renderAutoDayPlayers();
    refreshAutoDayNominees();
    return true;
  }

  function toggleAutoNominee(seatId, opts) {
    var s = app.autoState;
    if (!s.day) return false;
    return s.day.nominees.indexOf(seatId) !== -1 ? removeAutoNominee(seatId, opts) : addAutoNominee(seatId, opts);
  }

  function addAutoFoul(seatId) {
    var s = app.autoState;
    var seat = seatById(seatId);
    if (!seat || seat.eliminationReason) return;
    pushHistory();
    seat.fouls++;
    if (seat.fouls >= 4) {
      seat.fouls = 4;
      seat.eliminationReason = 'disqual';
      seat.alive = false;
      if (s.day) {
        var ix = s.day.nominees.indexOf(seatId);
        if (ix !== -1) s.day.nominees.splice(ix, 1);
      }
    }
    saveAuto();
    renderAutoDayPlayers();
    refreshAutoDayNominees();
  }

  function removeAutoFoul(seatId) {
    var seat = seatById(seatId);
    if (!seat || seat.eliminationReason || seat.fouls <= 0) return;
    pushHistory();
    seat.fouls--;
    saveAuto();
    renderAutoDayPlayers();
  }

  function setAutoElim(seatId, reason) {
    var s = app.autoState;
    var seat = seatById(seatId);
    if (!seat) return;
    pushHistory();
    if (seat.eliminationReason === reason) {
      seat.eliminationReason = null;
      seat.alive = true;
      if (reason === 'disqual') seat.fouls = 0;
    } else {
      seat.eliminationReason = reason;
      seat.alive = false;
      if (s.day) {
        var ix = s.day.nominees.indexOf(seatId);
        if (ix !== -1) s.day.nominees.splice(ix, 1);
      }
    }
    saveAuto();
    renderAutoDayPlayers();
    refreshAutoDayNominees();
  }

  app.startAutoVote = function () {
    var s = app.autoState;
    if (!s.day || !s.day.nominees.length) return;
    if (app._autoEphemeral.dayTimerInterval) { clearInterval(app._autoEphemeral.dayTimerInterval); app._autoEphemeral.dayTimerInterval = null; }
    var n = s.day.nominees.slice();
    var keepExisting = s.vote && s.vote.phase === 'counting' && s.vote.tieRevote && arraysEqualVote(s.vote.baseVotingOrder, n);
    pushHistory();
    if (!keepExisting) {
      s.vote = {
        phase: 'counting',
        poolTotal: aliveCount(),
        candidateIds: n,
        votes: n.map(function () { return null; }),
        baseVotingOrder: n.slice(),
        tieRevote: false,
        raiseCandidateIds: null,
      };
    }
    s.phase = 'vote';
    saveAuto();
    app.navigateToScreen('auto-vote-screen');
  };

  function arraysEqualVote(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  app.skipAutoVote = function () {
    var s = app.autoState;
    if (!s.day) return;
    if (app._autoEphemeral.dayTimerInterval) { clearInterval(app._autoEphemeral.dayTimerInterval); app._autoEphemeral.dayTimerInterval = null; }
    pushHistory();
    s.day.nominees = [];
    saveAuto();
    transitionToNight((s.nightNum || 0) + 1);
  };

  // ============ Auto player modal ============

  app.showAutoPlayerActionsModal = function (seatId) {
    var seat = seatById(seatId);
    if (!seat) return;
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var titleEl = el('modal-auto-player-actions-title');
    if (titleEl) titleEl.textContent = 'Игрок №' + seatId;
    var nickInp = el('modal-auto-player-nick');
    if (nickInp) nickInp.value = seat.nick != null ? String(seat.nick) : '';
    var whenActive = el('modal-auto-player-actions-when-active');
    var whenOut = el('modal-auto-player-actions-when-out');
    var out = !!seat.eliminationReason;
    if (whenActive && whenOut) {
      whenActive.classList.toggle('hidden', out);
      whenOut.classList.toggle('hidden', !out);
    }
    if (!out) {
      var inQueue = app.autoState.day && app.autoState.day.nominees.indexOf(seatId) !== -1;
      var voteBtn = modal.querySelector('[data-action="auto-player-modal-vote"]');
      if (voteBtn) voteBtn.textContent = inQueue ? 'Убрать с голосования' : 'Выставить';
      var elims = modal.querySelectorAll('[data-action="auto-player-modal-elim"]');
      var elimOn = 'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border ring-2 ring-mafia-gold bg-mafia-blood/45 border-mafia-gold text-mafia-gold transition-colors cursor-pointer';
      var elimOff = 'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border bg-mafia-card text-mafia-cream/80 hover:border-mafia-gold/45 transition-colors cursor-pointer';
      var elimDisabled = 'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border/45 bg-mafia-card/50 text-mafia-cream/30 opacity-55 cursor-not-allowed';
      for (var ei = 0; ei < elims.length; ei++) {
        var b = elims[ei];
        var er = b.getAttribute('data-elim');
        if (er === 'hang' && !inQueue) {
          b.disabled = true;
          b.setAttribute('aria-disabled', 'true');
          b.title = 'Сначала выставьте в очередь голосования';
          b.className = elimDisabled;
          continue;
        }
        b.disabled = false;
        b.removeAttribute('aria-disabled');
        b.className = seat.eliminationReason === er ? elimOn : elimOff;
        b.title = ELIM_REASON_TITLES[er] || '';
      }
    }
    modal.dataset.playerId = String(seatId);
    if (app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  function syncAutoPlayerNickFromModal() {
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var pidStr = modal.dataset.playerId;
    if (!pidStr) return;
    var pid = parseInt(pidStr, 10);
    if (isNaN(pid)) return;
    var seat = seatById(pid);
    if (!seat) return;
    var inp = el('modal-auto-player-nick');
    if (!inp) return;
    var newNick = inp.value.slice(0, 32);
    if (newNick !== (seat.nick || '')) {
      pushHistory();
      seat.nick = newNick;
      saveAuto();
    }
  }

  app.hideAutoPlayerActionsModal = function () {
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var wasOpen = modal.hasAttribute('data-open');
    if (wasOpen) syncAutoPlayerNickFromModal();
    if (app.modalSetOpen) app.modalSetOpen(modal, false);
    if (wasOpen) {
      var ds = el('auto-day-screen');
      if (ds && ds.classList.contains('active')) renderAutoDayPlayers();
    }
  };

  function withAutoModalSeatId(cb) {
    var modal = el('modal-auto-player-actions');
    if (!modal) return;
    var pidStr = modal.dataset.playerId;
    if (!pidStr) return;
    var pid = parseInt(pidStr, 10);
    if (!isNaN(pid)) cb(pid);
  }

  // ============ Vote ============

  function voteAvailableForIndex(session, index) {
    var used = 0;
    for (var j = 0; j < session.votes.length; j++) {
      if (j === index) continue;
      var v = session.votes[j];
      if (v !== null && v !== undefined) used += v;
    }
    return Math.max(0, session.poolTotal - used);
  }

  function isLastVoteSlotToFill(session, index) {
    for (var j = 0; j < session.votes.length; j++) {
      if (j === index) continue;
      if (session.votes[j] === null || session.votes[j] === undefined) return false;
    }
    return true;
  }

  app.renderAutoVote = function () {
    var s = app.autoState;
    if (!s.vote) return;
    var banner = el('auto-vote-revote-banner');
    var hint = el('auto-vote-pool-hint');
    var grid = el('auto-vote-candidates');
    if (!grid) return;
    if (s.vote.phase === 'raiseAll') {
      if (banner) {
        banner.classList.remove('hidden');
        var rc = (s.vote.raiseCandidateIds || []).length;
        banner.textContent = rc === 2 ? 'Голосование за поднятие обоих' : 'Голосование за поднятие всех';
      }
      if (hint) hint.textContent = '';
      grid.innerHTML = '';
      grid.className = 'flex-1 min-h-0 overflow-auto flex flex-wrap content-start justify-center gap-3 sm:gap-4 py-2';
      var cap = s.vote.poolTotal;
      for (var r = 0; r <= cap; r++) {
        var rb = document.createElement('button');
        rb.type = 'button';
        rb.setAttribute('data-action', 'auto-vote-raise-pick');
        rb.setAttribute('data-value', String(r));
        rb.className = 'py-3 min-w-[3.25rem] px-3 rounded border border-mafia-border bg-mafia-card hover:bg-mafia-blood/30 text-mafia-cream font-semibold tabular-nums cursor-pointer transition-colors';
        rb.textContent = String(r);
        grid.appendChild(rb);
      }
      return;
    }
    if (banner) {
      if (s.vote.tieRevote) {
        banner.classList.remove('hidden');
        banner.textContent = 'Переголосование между игроками:';
      } else {
        banner.classList.add('hidden');
      }
    }
    if (hint) hint.textContent = '';
    grid.innerHTML = '';
    grid.className = 'flex-1 min-h-0 overflow-auto flex flex-wrap content-start justify-center gap-3 sm:gap-4 py-2';
    for (var i = 0; i < s.vote.candidateIds.length; i++) {
      var pid = s.vote.candidateIds[i];
      var seat = seatById(pid);
      var nick = seat && seat.nick && seat.nick.trim() ? seat.nick.trim() : '';
      var assigned = s.vote.votes[i];
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.setAttribute('data-action', 'auto-vote-open-count');
      tile.setAttribute('data-candidate-index', String(i));
      tile.className = 'flex flex-col items-center justify-center rounded-lg border-2 border-mafia-gold/50 bg-mafia-coal text-mafia-gold p-4 sm:p-5 min-w-[6.5rem] cursor-pointer transition-colors hover:border-mafia-gold/80 active:scale-[0.97]';
      tile.innerHTML =
        '<span class="font-display font-bold text-4xl sm:text-5xl tabular-nums">№' + pid + '</span>' +
        (nick ? '<span class="text-mafia-cream/75 text-xs mt-1 max-w-[8rem] truncate">' + escapeHtml(nick) + '</span>' : '') +
        '<span class="mt-2 text-mafia-gold/90 text-sm uppercase tracking-wider">голосов: <span class="tabular-nums">' + (assigned !== null && assigned !== undefined ? assigned : 0) + '</span></span>';
      grid.appendChild(tile);
    }
  };

  app.showAutoVoteCountModal = function (idx) {
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'counting') return;
    var rem = voteAvailableForIndex(s.vote, idx);
    var lastSlot = isLastVoteSlotToFill(s.vote, idx);
    var cap = lastSlot ? rem : Math.min(10, rem);
    var cid = s.vote.candidateIds[idx];
    if (cid === undefined) return;
    var modal = el('modal-auto-vote-count');
    if (!modal) return;
    modal.dataset.candidateIndex = String(idx);
    var title = el('modal-auto-vote-count-title');
    if (title) title.textContent = 'Голосов за №' + cid;
    var sub = el('modal-auto-vote-count-sub');
    if (sub) {
      if (lastSlot) {
        sub.textContent = 'Осталось только это количество голосов в пуле.';
        sub.classList.remove('hidden');
        sub.setAttribute('aria-hidden', 'false');
      } else {
        sub.textContent = '';
        sub.classList.add('hidden');
        sub.setAttribute('aria-hidden', 'true');
      }
    }
    var grid = el('modal-auto-vote-count-grid');
    if (grid) {
      grid.className = lastSlot ? 'grid grid-cols-1 gap-2 max-w-[12rem] mx-auto' : 'grid grid-cols-4 gap-2';
      grid.innerHTML = '';
      var from = lastSlot ? rem : 0;
      var to = lastSlot ? rem : cap;
      for (var n = from; n <= to; n++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-action', 'auto-vote-pick-count');
        b.setAttribute('data-vote-count', String(n));
        b.className = 'py-3 rounded border border-mafia-border bg-mafia-card hover:bg-mafia-blood/30 text-mafia-cream font-semibold tabular-nums cursor-pointer transition-colors';
        b.textContent = String(n);
        grid.appendChild(b);
      }
    }
    if (app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  app.hideAutoVoteCountModal = function () {
    var modal = el('modal-auto-vote-count');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, false);
  };

  app.applyAutoVoteCount = function (count) {
    var modal = el('modal-auto-vote-count');
    if (!modal) return;
    var idx = parseInt(modal.dataset.candidateIndex || '-1', 10);
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'counting' || isNaN(idx)) return;
    var rem = voteAvailableForIndex(s.vote, idx);
    if (isLastVoteSlotToFill(s.vote, idx)) {
      if (count !== rem) { app.hideAutoVoteCountModal(); return; }
    } else {
      var cap = Math.min(10, rem);
      if (count < 0 || count > cap) { app.hideAutoVoteCountModal(); return; }
    }
    pushHistory();
    s.vote.votes[idx] = count;
    saveAuto();
    app.hideAutoVoteCountModal();
    app.renderAutoVote();
    tryFinalizeAutoVote();
  };

  function tryFinalizeAutoVote() {
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'counting') return;
    for (var i = 0; i < s.vote.votes.length; i++) {
      if (s.vote.votes[i] === null || s.vote.votes[i] === undefined) return;
    }
    var maxV = -1;
    for (var k = 0; k < s.vote.votes.length; k++) if (s.vote.votes[k] > maxV) maxV = s.vote.votes[k];
    var tied = [];
    for (var t = 0; t < s.vote.candidateIds.length; t++) {
      if (s.vote.votes[t] === maxV) tied.push(s.vote.candidateIds[t]);
    }
    if (tied.length >= 2) {
      if (!s.vote.tieRevote) {
        s.vote.candidateIds = tied;
        s.vote.votes = tied.map(function () { return null; });
        s.vote.tieRevote = true;
        s.vote.baseVotingOrder = tied.slice();
        if (s.day) {
          s.day.nominees = tied.slice();
          s.day.timeLeft = REVOTE_SEC;
        }
        s.phase = 'day';
        saveAuto();
        app.navigateToScreen('auto-day-screen');
        return;
      }
      s.vote = {
        phase: 'raiseAll',
        poolTotal: s.vote.poolTotal,
        raiseCandidateIds: tied.slice(),
      };
      saveAuto();
      app.renderAutoVote();
      return;
    }
    finalizeHang(tied[0]);
  }

  app.applyAutoRaisePick = function (value) {
    var s = app.autoState;
    if (!s.vote || s.vote.phase !== 'raiseAll') return;
    var n = s.vote.poolTotal;
    if (value < 0 || value > n) return;
    pushHistory();
    var majority = value > n / 2;
    if (majority) {
      finalizeMultiHang(s.vote.raiseCandidateIds.slice());
    } else {
      transitionToNight((s.nightNum || 0) + 1);
    }
  };

  function finalizeHang(seatId) {
    var seat = seatById(seatId);
    if (seat) { seat.alive = false; seat.eliminationReason = 'hang'; }
    transitionToLastWords([seatId]);
  }

  function finalizeMultiHang(ids) {
    for (var i = 0; i < ids.length; i++) {
      var seat = seatById(ids[i]);
      if (seat) { seat.alive = false; seat.eliminationReason = 'hang'; }
    }
    transitionToLastWords(ids);
  }

  // ============ Last words ============

  function transitionToLastWords(hangedIds) {
    var s = app.autoState;
    s.phase = 'last-words';
    s.lastWords = { hangedIds: hangedIds.slice(), cursor: 0, timeLeft: LAST_WORDS_SEC };
    s.vote = null;
    if (s.day) s.day.nominees = [];
    saveAuto();
    app.navigateToScreen('auto-last-words-screen');
  }

  app.renderAutoLastWords = function () {
    var s = app.autoState;
    if (!s.lastWords) return;
    var labelEl = el('auto-last-words-day-label');
    if (labelEl) labelEl.textContent = 'День ' + (s.day ? s.day.dayNum : (s.dayNum || 1));
    var ix = s.lastWords.cursor || 0;
    var hid = s.lastWords.hangedIds[ix];
    var numEl = el('auto-last-words-num');
    var nickEl = el('auto-last-words-nick');
    var seat = seatById(hid);
    if (numEl) numEl.textContent = '№' + hid;
    if (nickEl) nickEl.textContent = seat && seat.nick && seat.nick.trim() ? seat.nick.trim() : '';
    if (app._autoEphemeral.lastWordsInterval) { clearInterval(app._autoEphemeral.lastWordsInterval); app._autoEphemeral.lastWordsInterval = null; }
    if (typeof s.lastWords.timeLeft !== 'number') s.lastWords.timeLeft = LAST_WORDS_SEC;
    var cd = el('auto-last-words-countdown');
    if (cd) cd.textContent = String(s.lastWords.timeLeft);
    syncAutoLastWordsTimerAppearance();
    applyAutoLastWordsTimerButtonState(false);
  };

  function syncAutoLastWordsTimerAppearance() {
    var s = app.autoState;
    if (!s.lastWords) return;
    var pill = el('auto-last-words-timer-pill');
    var urgent = s.lastWords.timeLeft <= 10;
    if (pill) {
      pill.classList.toggle('border-mafia-blood/55', urgent);
      pill.classList.toggle('bg-mafia-blood', urgent);
      pill.classList.toggle('border-mafia-border/35', !urgent);
      pill.classList.toggle('bg-black/25', !urgent);
    }
  }

  function applyAutoLastWordsTimerButtonState(running) {
    var btn = el('auto-last-words-start-btn');
    if (!btn) return;
    btn.textContent = running ? 'Пауза' : 'Старт';
    btn.setAttribute('aria-pressed', running ? 'true' : 'false');
    var base = 'px-3 py-2 sm:px-5 sm:py-3 font-semibold rounded uppercase text-xs sm:text-sm tracking-wider cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-[118ms] ease-out';
    btn.className = base + (running
      ? ' bg-red-900 hover:bg-red-800 border border-red-700 text-white'
      : ' bg-green-800 hover:bg-green-700 border border-green-600 text-white');
  }

  app.toggleAutoLastWordsTimer = function () {
    var s = app.autoState;
    if (!s.lastWords) return;
    if (app._autoEphemeral.lastWordsInterval) {
      clearInterval(app._autoEphemeral.lastWordsInterval);
      app._autoEphemeral.lastWordsInterval = null;
      applyAutoLastWordsTimerButtonState(false);
      return;
    }
    applyAutoLastWordsTimerButtonState(true);
    app._autoEphemeral.lastWordsInterval = setInterval(function () {
      if (!s.lastWords) {
        clearInterval(app._autoEphemeral.lastWordsInterval);
        app._autoEphemeral.lastWordsInterval = null;
        return;
      }
      if (s.lastWords.timeLeft > 0) {
        s.lastWords.timeLeft--;
        var cd = el('auto-last-words-countdown');
        if (cd) cd.textContent = String(s.lastWords.timeLeft);
        syncAutoLastWordsTimerAppearance();
        if (app.timerVoiceEnabled && s.lastWords.timeLeft === 10 && app.playTimerVoiceCue) {
          app.playTimerVoiceCue('10');
        }
        if (s.lastWords.timeLeft <= 0) {
          clearInterval(app._autoEphemeral.lastWordsInterval);
          app._autoEphemeral.lastWordsInterval = null;
          applyAutoLastWordsTimerButtonState(false);
          if (app.timerVoiceEnabled && app.playTimerVoiceCue) {
            app.playTimerVoiceCue('0');
          }
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([90, 45, 90]); } catch (_) {}
          }
        }
        saveAuto();
      }
    }, 1000);
  };

  app.resetAutoLastWordsTimer = function (sec) {
    var s = app.autoState;
    if (!s.lastWords) return;
    if (app._autoEphemeral.lastWordsInterval) {
      clearInterval(app._autoEphemeral.lastWordsInterval);
      app._autoEphemeral.lastWordsInterval = null;
    }
    s.lastWords.timeLeft = sec;
    var cd = el('auto-last-words-countdown');
    if (cd) cd.textContent = String(sec);
    syncAutoLastWordsTimerAppearance();
    applyAutoLastWordsTimerButtonState(false);
    saveAuto();
  };

  app.handleLastWordsFinish = function () {
    if (app._autoEphemeral.lastWordsInterval) { clearInterval(app._autoEphemeral.lastWordsInterval); app._autoEphemeral.lastWordsInterval = null; }
    var s = app.autoState;
    if (!s.lastWords) return;
    pushHistory();
    s.lastWords.cursor = (s.lastWords.cursor || 0) + 1;
    if (s.lastWords.cursor < s.lastWords.hangedIds.length) {
      s.lastWords.timeLeft = LAST_WORDS_SEC;
      saveAuto();
      app.renderAutoLastWords();
      return;
    }
    s.lastWords = null;
    if (isPeacefulWin()) { endGame('peaceful'); return; }
    if (isMafiaWin()) { endGame('mafia'); return; }
    transitionToNight((s.nightNum || 0) + 1);
  };

  // ============ Game over ============

  function endGame(team) {
    var s = app.autoState;
    s.phase = 'gameover';
    s.result = team;
    clearAllAutoTimers();
    saveAuto();
    app.navigateToScreen('auto-end-screen');
  }

  function checkWinAndContinue() {
    if (isPeacefulWin()) endGame('peaceful');
    else if (isMafiaWin()) endGame('mafia');
  }

  // ============ Switch to host mode ============

  var switchHostStep = 0;

  function roleCodeToRussian(code) {
    if (code === 'don') return 'Дон';
    if (code === 'sheriff') return 'Шериф';
    if (code === 'mafia') return 'Мафия';
    return 'Мирный';
  }

  function renderSwitchHostModal() {
    var titleEl = el('modal-auto-switch-host-title');
    var bodyEl = el('modal-auto-switch-host-body');
    var primaryEl = el('modal-auto-switch-host-primary');
    if (switchHostStep === 1) {
      if (titleEl) titleEl.textContent = 'Передать обычному ведущему?';
      if (bodyEl) bodyEl.textContent = 'Прогресс автономной партии перенесётся в обычный режим. Дальше игру будет вести живой ведущий.';
      if (primaryEl) primaryEl.textContent = 'Продолжить';
    } else if (switchHostStep === 2) {
      if (titleEl) titleEl.textContent = 'Точно передать?';
      if (bodyEl) bodyEl.textContent = 'Вернуться в автономный режим в этой партии нельзя.';
      if (primaryEl) primaryEl.textContent = 'Да, передать';
    }
  }

  app.showAutoSwitchHostModal = function () {
    var s = app.autoState;
    var anyOut = s.seats && s.seats.some(function (x) { return !x.alive; });
    if (!anyOut) return;
    switchHostStep = 1;
    renderSwitchHostModal();
    var modal = el('modal-auto-switch-host');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  app.hideAutoSwitchHostModal = function () {
    var modal = el('modal-auto-switch-host');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, false);
    switchHostStep = 0;
  };

  app.handleAutoSwitchHostPrimary = function () {
    if (switchHostStep === 1) {
      switchHostStep = 2;
      renderSwitchHostModal();
      return;
    }
    if (switchHostStep === 2) {
      app.hideAutoSwitchHostModal();
      migrateAutoToHost();
    }
  };

  function migrateAutoToHost() {
    var s = app.autoState;
    if (!s.active || !Array.isArray(s.seats) || !s.seats.length) return;
    clearAllAutoTimers();

    var hostPlayers = [];
    var hostRoles = [];
    var n = playerCount();
    for (var i = 0; i < 10; i++) {
      if (i < n && s.seats[i]) {
        var seat = s.seats[i];
        hostPlayers.push({
          id: seat.id,
          fouls: seat.fouls || 0,
          eliminationReason: seat.eliminationReason || null,
          nick: seat.nick || ''
        });
        hostRoles.push(roleCodeToRussian(seat.role));
      } else {
        hostPlayers.push({ id: i + 1, fouls: 0, eliminationReason: 'shot', nick: '' });
        hostRoles.push('Мирный');
      }
    }

    app.players = hostPlayers;
    app.roles = hostRoles;
    app.revealedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    app.nomineeQueue = (s.day && Array.isArray(s.day.nominees)) ? s.day.nominees.slice() : [];
    app.activeVoteRound = null;
    app.timeLeft = (s.day && typeof s.day.timeLeft === 'number') ? s.day.timeLeft : 60;
    app.playerRoleOverrides = {};
    app.winningTeam = null;
    app.bonusPointsByPlayerId = {};
    app.summaryRoleByPlayerId = {};
    app.bonusNoteByPlayerId = {};
    app.bestMoveByPlayerId = {};
    app.summaryHostName = '';
    app.summarySyntheticFirstDayLine = null;
    app.summarySkipLineOverrides = {};

    for (var k = 0; k < hostPlayers.length; k++) {
      var p = hostPlayers[k];
      var roleStr = hostRoles[k];
      var code = roleStr === 'Дон' ? 'don' : roleStr === 'Шериф' ? 'sheriff' : roleStr === 'Мафия' ? 'mafia' : 'peaceful';
      app.summaryRoleByPlayerId[String(p.id)] = code;
    }

    var baseTs = Date.now() - 1000;
    app.gameLog = [];
    for (var m = 0; m < hostPlayers.length; m++) {
      var pp = hostPlayers[m];
      if (pp.eliminationReason) {
        app.gameLog.push({
          type: 'elimination',
          ts: baseTs + m,
          playerId: pp.id,
          reason: pp.eliminationReason
        });
      }
    }

    if (app.saveState) app.saveState();

    app.autoState = makeFreshState();
    saveAuto();

    app.prepareConfig.mode = 'host';
    savePrepareConfig();

    if (app.initGameFromMenu) app.initGameFromMenu();
    app.navigateToScreen('game-screen');
  }

  app.renderAutoEnd = function () {
    var s = app.autoState;
    var teamEl = el('auto-end-team');
    if (teamEl) teamEl.textContent = TEAM_NAMES[s.result] || '—';
    var rolesEl = el('auto-end-roles');
    if (rolesEl) {
      rolesEl.innerHTML = '';
      s.seats.forEach(function (seat) {
        var nick = seat.nick && seat.nick.trim() ? ' — ' + escapeHtml(seat.nick.trim()) : '';
        var aliveLabel = seat.alive ? '' : ' <span class="text-mafia-cream/45">(выбыл)</span>';
        var wrap = document.createElement('div');
        wrap.className = 'flex items-center gap-2 text-sm';
        wrap.innerHTML =
          '<span class="text-mafia-gold flex-shrink-0">' + renderRoleIcon(seat.role, 'role-icon--small') + '</span>' +
          '<span class="font-display text-mafia-gold/90 font-bold tabular-nums">№' + seat.id + '</span>' +
          '<span class="text-mafia-cream/85 truncate">' + escapeHtml(ROLE_NAMES[seat.role] || seat.role) + nick + '</span>' +
          aliveLabel;
        rolesEl.appendChild(wrap);
      });
    }
  };

  // ============ Back navigation (snapshot pop) ============

  function goBackOneStep() {
    clearAllAutoTimers();
    hideRevealOverlay();
    var pmodal = el('modal-auto-player-actions');
    if (pmodal && app.modalSetOpen) app.modalSetOpen(pmodal, false);
    if (app.hideAutoVoteCountModal) app.hideAutoVoteCountModal();
    var snap = popHistory();
    if (!snap) return;
    saveAuto();
    var s = app.autoState;
    app.navigateToScreen(resolvePendingPhase(s.phase));
  }

  function ensureBackHoldIndicator() {
    var ind = el('auto-back-hold-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'auto-back-hold-indicator';
      document.body.appendChild(ind);
    }
    return ind;
  }

  function isAutoScreenActive() {
    var s = app.autoState;
    if (!s.active) return false;
    var ids = ['auto-setup-screen','auto-reveal-screen','auto-night-intro-screen','auto-night-pass-screen','auto-night-action-screen','auto-night-result-screen','auto-day-screen','auto-vote-screen','auto-last-words-screen','auto-end-screen'];
    for (var i = 0; i < ids.length; i++) {
      var e = el(ids[i]);
      if (e && e.classList.contains('active')) return true;
    }
    return false;
  }

  function shouldBlockBackHold(target) {
    if (!target || !target.closest) return false;
    if (target.closest('#auto-reveal-hold-btn')) return true;
    if (target.closest('[data-action="auto-day-player-slot-open"]')) return true;
    if (target.closest('input,textarea,select,[contenteditable="true"]')) return true;
    if (target.closest('.modal-overlay[data-open]')) return true;
    return false;
  }

  function startBackHold(e) {
    if (!isAutoScreenActive()) return;
    if (shouldBlockBackHold(e.target)) return;
    if (app._autoEphemeral.backHold) cancelBackHold();
    var x = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    var y = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    var pid = e.pointerId !== undefined ? e.pointerId : -1;
    var ind = ensureBackHoldIndicator();
    var startTs = Date.now();
    app._autoEphemeral.backHold = { pid: pid, x0: x, y0: y, startTs: startTs };
    var raf = function () {
      if (!app._autoEphemeral.backHold || app._autoEphemeral.backHold.startTs !== startTs) return;
      var elapsed = Date.now() - startTs;
      var ratio = Math.min(1, elapsed / BACK_HOLD_MS);
      if (elapsed >= 300) {
        ind.classList.add('is-active');
        ind.style.transform = 'scaleX(' + ratio + ')';
      }
      if (ratio >= 1) {
        finishBackHold();
        return;
      }
      app._autoEphemeral.backHold.raf = requestAnimationFrame(raf);
    };
    app._autoEphemeral.backHold.raf = requestAnimationFrame(raf);
  }

  function moveBackHold(e) {
    if (!app._autoEphemeral.backHold) return;
    var x = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    var y = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    var dx = x - app._autoEphemeral.backHold.x0;
    var dy = y - app._autoEphemeral.backHold.y0;
    if (Math.abs(dx) > BACK_MOVE_THRESHOLD_PX || Math.abs(dy) > BACK_MOVE_THRESHOLD_PX) cancelBackHold();
  }

  function cancelBackHold() {
    if (!app._autoEphemeral.backHold) return;
    if (app._autoEphemeral.backHold.raf) cancelAnimationFrame(app._autoEphemeral.backHold.raf);
    app._autoEphemeral.backHold = null;
    var ind = el('auto-back-hold-indicator');
    if (ind) {
      ind.classList.remove('is-active');
      ind.style.transform = 'scaleX(0)';
    }
  }

  function finishBackHold() {
    cancelBackHold();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(80); } catch (_) {}
    }
    goBackOneStep();
  }

  function bindBackGestures() {
    if (app._autoEphemeral._backBound) return;
    app._autoEphemeral._backBound = true;
    if (window.PointerEvent) {
      document.addEventListener('pointerdown', startBackHold);
      document.addEventListener('pointermove', moveBackHold);
      document.addEventListener('pointerup', cancelBackHold);
      document.addEventListener('pointercancel', cancelBackHold);
    } else {
      document.addEventListener('mousedown', startBackHold);
      document.addEventListener('mousemove', moveBackHold);
      document.addEventListener('mouseup', cancelBackHold);
      document.addEventListener('touchstart', startBackHold, { passive: true });
      document.addEventListener('touchmove', moveBackHold, { passive: true });
      document.addEventListener('touchend', cancelBackHold);
      document.addEventListener('touchcancel', cancelBackHold);
    }
    document.addEventListener('keydown', function (e) {
      if (!isAutoScreenActive()) return;
      if (e.key === 'Backspace') {
        var t = e.target;
        if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
        e.preventDefault();
        goBackOneStep();
      }
    });
  }

  // ============ Auto-day player slot gestures (long-press / swipe / tap) ============

  function bindAutoPlayerGestures() {
    if (app._autoEphemeral._autoGesturesBound) return;
    app._autoEphemeral._autoGesturesBound = true;
    var LONG_PRESS_MS = 450;
    var SWIPE_Y_MIN = 30;
    var TAP_MOVE_MAX = 15;
    var g = { active: false, pid: null, touchId: -1, x0: 0, y0: 0, timer: null, fired: false };

    function pidFromEl(target) {
      var btn = target && target.closest ? target.closest('[data-action="auto-day-player-slot-open"]') : null;
      if (!btn) return null;
      var v = btn.getAttribute('data-player-id');
      return v ? parseInt(v, 10) : null;
    }

    function reset() {
      if (g.timer) { clearTimeout(g.timer); g.timer = null; }
      g.active = false;
      g.pid = null;
      g.touchId = -1;
      g.fired = false;
    }

    function findTouch(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }

    document.body.addEventListener('touchstart', function (e) {
      if (g.active) return;
      var ds = el('auto-day-screen');
      if (!ds || !ds.classList.contains('active')) return;
      var pid = pidFromEl(e.target);
      if (pid === null) return;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      g.active = true;
      g.pid = pid;
      g.touchId = t.identifier;
      g.x0 = t.clientX;
      g.y0 = t.clientY;
      g.fired = false;
      var capturedPid = pid;
      g.timer = setTimeout(function () {
        g.timer = null;
        if (!g.active || g.fired) return;
        var changed = toggleAutoNominee(capturedPid, { skipRender: true });
        if (!changed) return;
        g.fired = true;
        patchAutoPlayerSlotStatus(capturedPid);
        if (navigator.vibrate) navigator.vibrate(40);
      }, LONG_PRESS_MS);
    }, { passive: true });

    document.body.addEventListener('touchmove', function (e) {
      if (!g.active || g.fired) return;
      var t = findTouch(e.touches, g.touchId);
      if (!t) { reset(); return; }
      var dy = t.clientY - g.y0;
      var dx = t.clientX - g.x0;
      if (Math.abs(dy) > TAP_MOVE_MAX || Math.abs(dx) > TAP_MOVE_MAX) {
        if (g.timer) { clearTimeout(g.timer); g.timer = null; }
      }
    }, { passive: true });

    document.body.addEventListener('touchend', function (e) {
      if (!g.active) return;
      var t = findTouch(e.changedTouches, g.touchId);
      if (!t) {
        var wasFired = g.fired;
        reset();
        if (wasFired) renderAutoDayPlayers();
        return;
      }
      if (g.timer) { clearTimeout(g.timer); g.timer = null; }
      var pid = g.pid;
      var fired = g.fired;
      var dy = t.clientY - g.y0;
      var dx = t.clientX - g.x0;
      reset();
      if (fired) {
        app._autoLastGestureTs = Date.now();
        renderAutoDayPlayers();
        e.preventDefault();
        return;
      }
      if (Math.abs(dy) >= SWIPE_Y_MIN && Math.abs(dy) > Math.abs(dx)) {
        app._autoLastGestureTs = Date.now();
        e.preventDefault();
        if (dy < 0) addAutoFoul(pid);
        else removeAutoFoul(pid);
        if (navigator.vibrate) navigator.vibrate(25);
        return;
      }
    }, { passive: false });

    document.body.addEventListener('touchcancel', function () {
      var wasFired = g.fired;
      reset();
      if (wasFired) renderAutoDayPlayers();
    }, { passive: true });
  }

  // ============ Event handlers ============

  app.uiActionHandlers = app.uiActionHandlers || {};

  app.uiActionHandlers['prepare-enter'] = function () {
    loadAuto();
    loadPrepareConfig();
    bindRevealHoldGestures();
    bindBackGestures();
    bindAutoPlayerGestures();
    var mode = app.prepareConfig.mode;
    if (mode === 'auto') {
      var s = app.autoState;
      if (s.active && s.phase !== 'setup' && s.phase !== 'gameover') {
        app.navigateToScreen('auto-setup-screen');
        return;
      }
    } else if (mode === 'host') {
      if (app.hasResettableState && app.hasResettableState()) {
        app.navigateToScreen('prepare-screen');
        return;
      }
    }
    app.navigateToScreen('prepare-mode-screen');
  };
  app.uiActionHandlers['prepare-mode-pick'] = function (el2) {
    var mode = el2.getAttribute('data-mode');
    if (mode !== 'host' && mode !== 'auto') return;
    app.prepareConfig.mode = mode;
    savePrepareConfig();
    app.renderPrepareModeScreen();
  };
  app.uiActionHandlers['prepare-count-pick'] = function (el2) {
    var n = parseInt(el2.getAttribute('data-count'), 10);
    if (SUPPORTED_AUTO_COUNTS.indexOf(n) === -1) return;
    app.prepareConfig.count = n;
    savePrepareConfig();
    app.renderPrepareModeScreen();
  };
  app.uiActionHandlers['prepare-continue'] = function () {
    if (app.prepareConfig.mode === 'host') {
      app.navigateToScreen('prepare-screen');
    } else {
      app.navigateToScreen('auto-setup-screen');
    }
  };
  app.uiActionHandlers['auto-begin'] = function () { app.startFreshAutoGame(); };
  app.uiActionHandlers['auto-resume'] = function () { app.resumeAutoGame(); };
  app.uiActionHandlers['auto-restart'] = function () { app.restartAutoGame(); };
  app.uiActionHandlers['auto-reveal-confirm'] = function () { app.advanceReveal(); };
  app.uiActionHandlers['auto-back-to-menu'] = function () {
    clearAllAutoTimers();
    hideRevealOverlay();
    app.navigateToScreen('menu-screen');
  };
  app.uiActionHandlers['auto-intro-finish'] = function () { app.handleIntroFinish(); };
  app.uiActionHandlers['auto-freesit-finish'] = function () { app.handleFreesitFinish(); };
  app.uiActionHandlers['auto-night-turn-start'] = function () { app.startNightTurn(); };
  app.uiActionHandlers['auto-night-turn-done'] = function () { app.handleNightTurnDone(); };
  app.uiActionHandlers['auto-mafia-pick'] = function (el2) {
    var s = app.autoState;
    if (!s.night) return;
    var seatId = s.night.turnOrder[s.night.cursor];
    var targetId = parseInt(el2.getAttribute('data-target-id'), 10);
    if (!isNaN(targetId)) app.handleMafiaPick(seatId, targetId);
  };
  app.uiActionHandlers['auto-don-check'] = function (el2) {
    var s = app.autoState;
    if (!s.night) return;
    var seatId = s.night.turnOrder[s.night.cursor];
    var targetId = parseInt(el2.getAttribute('data-target-id'), 10);
    if (!isNaN(targetId)) app.handleDonCheck(seatId, targetId);
  };
  app.uiActionHandlers['auto-sheriff-check'] = function (el2) {
    var s = app.autoState;
    if (!s.night) return;
    var seatId = s.night.turnOrder[s.night.cursor];
    var targetId = parseInt(el2.getAttribute('data-target-id'), 10);
    if (!isNaN(targetId)) app.handleSheriffCheck(seatId, targetId);
  };
  app.uiActionHandlers['auto-night-result-continue'] = function () { app.continueAfterNightResult(); };
  app.uiActionHandlers['auto-day-toggle-timer'] = function () { app.toggleAutoDayTimer(); };
  app.uiActionHandlers['auto-day-reset-timer'] = function (el2) {
    var sec = parseInt(el2.getAttribute('data-seconds'), 10);
    if (!isNaN(sec)) app.resetAutoDayTimer(sec);
  };
  app.uiActionHandlers['auto-day-player-slot-open'] = function (el2) {
    if (app._autoLastGestureTs && Date.now() - app._autoLastGestureTs < 400) return;
    var pid = parseInt(el2.getAttribute('data-player-id'), 10);
    if (!isNaN(pid)) app.showAutoPlayerActionsModal(pid);
  };
  app.uiActionHandlers['auto-player-modal-save'] = function () { app.hideAutoPlayerActionsModal(); };
  app.uiActionHandlers['auto-player-modal-foul'] = function () {
    withAutoModalSeatId(function (pid) {
      var seat = seatById(pid);
      if (!seat || seat.eliminationReason) return;
      app.hideAutoPlayerActionsModal();
      addAutoFoul(pid);
    });
  };
  app.uiActionHandlers['auto-player-modal-vote'] = function () {
    withAutoModalSeatId(function (pid) {
      var seat = seatById(pid);
      if (!seat || seat.eliminationReason) return;
      app.hideAutoPlayerActionsModal();
      toggleAutoNominee(pid);
    });
  };
  app.uiActionHandlers['auto-player-modal-elim'] = function (el2) {
    var reason = el2.getAttribute('data-elim');
    withAutoModalSeatId(function (pid) {
      if (!reason) return;
      var s = app.autoState;
      if (reason === 'hang' && s.day && s.day.nominees.indexOf(pid) === -1) return;
      app.hideAutoPlayerActionsModal();
      setAutoElim(pid, reason);
    });
  };
  app.uiActionHandlers['auto-player-modal-revive'] = function () {
    withAutoModalSeatId(function (pid) {
      var seat = seatById(pid);
      if (!seat || !seat.eliminationReason) return;
      var reason = seat.eliminationReason;
      app.hideAutoPlayerActionsModal();
      setAutoElim(pid, reason);
    });
  };
  app.uiActionHandlers['auto-switch-host-open'] = function () { app.showAutoSwitchHostModal(); };
  app.uiActionHandlers['auto-switch-host-cancel'] = function () { app.hideAutoSwitchHostModal(); };
  app.uiActionHandlers['auto-switch-host-primary'] = function () { app.handleAutoSwitchHostPrimary(); };
  app.uiActionHandlers['auto-day-go-vote'] = function () { app.startAutoVote(); };
  app.uiActionHandlers['auto-day-skip-vote'] = function () { app.skipAutoVote(); };
  app.uiActionHandlers['auto-vote-back-to-day'] = function () {
    var s = app.autoState;
    pushHistory();
    if (s.day && s.vote && s.vote.candidateIds) s.day.nominees = s.vote.candidateIds.slice();
    s.phase = 'day';
    s.vote = null;
    saveAuto();
    app.navigateToScreen('auto-day-screen');
  };
  app.uiActionHandlers['auto-vote-open-count'] = function (el2) {
    var idx = parseInt(el2.getAttribute('data-candidate-index'), 10);
    if (!isNaN(idx)) app.showAutoVoteCountModal(idx);
  };
  app.uiActionHandlers['auto-vote-count-cancel'] = function () { app.hideAutoVoteCountModal(); };
  app.uiActionHandlers['auto-vote-pick-count'] = function (el2) {
    var c = parseInt(el2.getAttribute('data-vote-count'), 10);
    if (!isNaN(c)) app.applyAutoVoteCount(c);
  };
  app.uiActionHandlers['auto-vote-raise-pick'] = function (el2) {
    var v = parseInt(el2.getAttribute('data-value'), 10);
    if (!isNaN(v)) app.applyAutoRaisePick(v);
  };
  app.uiActionHandlers['auto-last-words-finish'] = function () { app.handleLastWordsFinish(); };
  app.uiActionHandlers['auto-last-words-toggle-timer'] = function () { app.toggleAutoLastWordsTimer(); };
  app.uiActionHandlers['auto-last-words-reset-timer'] = function (el2) {
    var sec = parseInt(el2.getAttribute('data-seconds'), 10);
    if (!isNaN(sec)) app.resetAutoLastWordsTimer(sec);
  };

  // ============ Init hook ============

  app.initAutoFromMenu = function () {
    loadAuto();
    loadPrepareConfig();
    bindRevealHoldGestures();
    bindBackGestures();
    bindAutoPlayerGestures();
  };

  app.initPrepareModeFromMenu = function () {
    loadAuto();
    loadPrepareConfig();
    bindRevealHoldGestures();
    bindBackGestures();
    bindAutoPlayerGestures();
  };

  loadAuto();
  loadPrepareConfig();
  bindBackGestures();
  bindAutoPlayerGestures();
})(window.MafiaApp);
