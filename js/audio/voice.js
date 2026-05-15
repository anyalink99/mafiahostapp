(function (app) {
  app.TIMER_VOICE_KEY = 'mafia_host_timer_voice';
  app.TIMER_VOICE_DUCK_KEY = 'mafia_host_timer_voice_duck';
  app.TIMER_VOICE_DUCK_MUL_KEY = 'mafia_host_timer_voice_duck_mul';
  app.TIMER_VOICE_VOL_KEY = 'mafia_host_timer_voice_vol';
  app.VOICE_VOL_NO_MUSIC_KEY = 'mafia_host_voice_vol_no_music';
  app.VOICE_VOL_WITH_MUSIC_KEY = 'mafia_host_voice_vol_with_music';
  app.VOICE_RATE_KEY = 'mafia_host_voice_rate';
  app.NIGHT_ACTIONS_WAIT_SEC_KEY = 'mafia_host_night_actions_wait_sec';

  var TIMER_VOICE_FILES = {
    discuss10: 'you-have-10-seconds.mp3',
    discuss0: 'thank-you-stop.mp3',
    mafia10: 'mafia-10-seconds acquaintance.mp3',
    mafia0: 'mafia-leaves.mp3',
  };

  function clampRange(x, min, max) {
    if (x < min) return min;
    if (x > max) return max;
    return x;
  }

  function clamp01(x) {
    return clampRange(x, 0, 1);
  }

  function clampVoiceRate(x) {
    return clampRange(x, 1, 2);
  }

  function hasNumber(x) {
    return typeof x === 'number' && !isNaN(x);
  }

  function timerVoiceUrl(filename) {
    return new URL('audio/' + encodeURIComponent(filename), window.location.href).href;
  }

  function sfxUrl(filename) {
    return new URL('audio/' + encodeURIComponent(filename), window.location.href).href;
  }

  function sleepMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function syncAccentToggleButtonState(buttonId, active) {
    var btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      btn.classList.remove('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.add('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    } else {
      btn.classList.add('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.remove('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    }
  }

  function setTimerVoiceButtonPlaying(playing) {
    syncAccentToggleButtonState('btn-timer-voice', playing);
  }

  function setNightActionsButtonActive(active) {
    syncAccentToggleButtonState('btn-night-actions', active);
  }

  function voiceUiStart() {
    app._voicePlayingCount = (app._voicePlayingCount || 0) + 1;
    setTimerVoiceButtonPlaying(true);
  }

  function voiceUiEnd() {
    app._voicePlayingCount = Math.max(0, (app._voicePlayingCount || 0) - 1);
    if ((app._voicePlayingCount || 0) === 0) setTimerVoiceButtonPlaying(false);
  }

  function isAnyMusicPlaying() {
    return !!(app.isMusicPlaying && app.isMusicPlaying());
  }

  function getEffectiveVoiceVolume() {
    var v = isAnyMusicPlaying() ? app.voiceVolumeWithMusic : app.voiceVolumeNoMusic;
    if (!hasNumber(v)) {
      var fallback = hasNumber(app.timerVoiceVolume) ? app.timerVoiceVolume : 0.92;
      v = fallback;
    }
    return clamp01(v);
  }

  function getEffectiveVoiceRate() {
    var r = app.voiceRate;
    if (!hasNumber(r)) r = 1.0;
    return clampVoiceRate(r);
  }

  function showEl(id, show) {
    var el = document.getElementById(id);
    if (!el) return;
    if (app.modalSetOpen) app.modalSetOpen(el, show);
    else {
      el.classList.toggle('hidden', !show);
      el.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  function shouldDuckForAnyVoice() {
    var night =
      app.getCurrentMusicSlot &&
      app.getCurrentMusicSlot() === '2' &&
      app.isMusicPlaying &&
      app.isMusicPlaying();
    return !!(night && app.timerVoiceDuckEnabled);
  }

  function cancelledNightActions(gen) {
    return gen !== app._nightActionsGen;
  }

  function guardNightActions(gen) {
    if (cancelledNightActions(gen)) throw new Error('night_actions_cancelled');
  }

  app.loadTimerVoicePref = function () {
    try {
      var v = localStorage.getItem(app.TIMER_VOICE_KEY);
      app.timerVoiceEnabled = v === '1';
    } catch (e) {
      app.timerVoiceEnabled = false;
    }
    app.loadTimerVoiceDuckPrefs();
    app.loadTimerVoiceVolumePref();
    app.loadVoiceVolumePrefs();
    app.loadVoiceRatePref();
    app.loadNightActionsWaitPref();
  };

  app.loadVoiceVolumePrefs = function () {
    var fallback = hasNumber(app.timerVoiceVolume) ? clamp01(app.timerVoiceVolume) : 0.92;
    var gotAny = false;

    try {
      var v1 = parseFloat(localStorage.getItem(app.VOICE_VOL_NO_MUSIC_KEY));
      if (!isNaN(v1)) {
        app.voiceVolumeNoMusic = clamp01(v1);
        gotAny = true;
      }
    } catch (e) {}

    try {
      var v2 = parseFloat(localStorage.getItem(app.VOICE_VOL_WITH_MUSIC_KEY));
      if (!isNaN(v2)) {
        app.voiceVolumeWithMusic = clamp01(v2);
        gotAny = true;
      }
    } catch (e) {}

    if (!gotAny) {
      app.voiceVolumeNoMusic = fallback;
      app.voiceVolumeWithMusic = fallback;
    } else {
      if (!hasNumber(app.voiceVolumeNoMusic)) app.voiceVolumeNoMusic = fallback;
      if (!hasNumber(app.voiceVolumeWithMusic)) app.voiceVolumeWithMusic = fallback;
      app.voiceVolumeNoMusic = clamp01(app.voiceVolumeNoMusic);
      app.voiceVolumeWithMusic = clamp01(app.voiceVolumeWithMusic);
    }
  };

  app.saveVoiceVolumePrefs = function () {
    try {
      localStorage.setItem(app.VOICE_VOL_NO_MUSIC_KEY, String(clamp01(app.voiceVolumeNoMusic)));
      localStorage.setItem(app.VOICE_VOL_WITH_MUSIC_KEY, String(clamp01(app.voiceVolumeWithMusic)));
    } catch (e) {}
  };

  app.loadVoiceRatePref = function () {
    try {
      var v = parseFloat(localStorage.getItem(app.VOICE_RATE_KEY));
      if (!isNaN(v)) {
        app.voiceRate = clampVoiceRate(v);
        return;
      }
    } catch (e) {}
    if (!hasNumber(app.voiceRate)) app.voiceRate = 1.0;
    app.voiceRate = clampVoiceRate(app.voiceRate);
  };

  app.saveVoiceRatePref = function () {
    try {
      localStorage.setItem(app.VOICE_RATE_KEY, String(clampVoiceRate(app.voiceRate)));
    } catch (e) {}
  };

  app.loadTimerVoiceDuckPrefs = function () {
    try {
      var d = localStorage.getItem(app.TIMER_VOICE_DUCK_KEY);
      app.timerVoiceDuckEnabled = d !== '0';
    } catch (e) {
      app.timerVoiceDuckEnabled = true;
    }
    try {
      var m = parseFloat(localStorage.getItem(app.TIMER_VOICE_DUCK_MUL_KEY));
      if (!isNaN(m)) {
        if (m < 0.05) m = 0.05;
        if (m > 1) m = 1;
        app.timerVoiceDuckMul = m;
      } else {
        app.timerVoiceDuckMul = 0.38;
      }
    } catch (e) {
      app.timerVoiceDuckMul = 0.38;
    }
  };

  app.loadTimerVoiceVolumePref = function () {
    try {
      var v = parseFloat(localStorage.getItem(app.TIMER_VOICE_VOL_KEY));
      if (!isNaN(v)) {
        if (v < 0) v = 0;
        if (v > 1) v = 1;
        app.timerVoiceVolume = v;
        return;
      }
    } catch (e) {}
    if (typeof app.timerVoiceVolume !== 'number' || isNaN(app.timerVoiceVolume)) app.timerVoiceVolume = 0.92;
  };

  app.saveTimerVoiceVolumePref = function () {
    try {
      localStorage.setItem(app.TIMER_VOICE_VOL_KEY, String(app.timerVoiceVolume));
    } catch (e) {}
  };

  app.loadNightActionsWaitPref = function () {
    try {
      var v = parseInt(localStorage.getItem(app.NIGHT_ACTIONS_WAIT_SEC_KEY), 10);
      if (!isNaN(v)) {
        if (v < 0) v = 0;
        if (v > 20) v = 20;
        app.nightActionsWaitSec = v;
        return;
      }
    } catch (e) {}
    if (typeof app.nightActionsWaitSec !== 'number' || isNaN(app.nightActionsWaitSec)) {
      app.nightActionsWaitSec = 10;
    }
  };

  app.saveNightActionsWaitPref = function () {
    try {
      localStorage.setItem(app.NIGHT_ACTIONS_WAIT_SEC_KEY, String(app.nightActionsWaitSec));
    } catch (e) {}
  };

  app.saveTimerVoicePref = function () {
    try {
      localStorage.setItem(app.TIMER_VOICE_KEY, app.timerVoiceEnabled ? '1' : '0');
    } catch (e) {}
  };

  app.saveTimerVoiceDuckPrefs = function () {
    try {
      localStorage.setItem(app.TIMER_VOICE_DUCK_KEY, app.timerVoiceDuckEnabled ? '1' : '0');
      localStorage.setItem(app.TIMER_VOICE_DUCK_MUL_KEY, String(app.timerVoiceDuckMul));
    } catch (e) {}
  };

  app.syncTimerVoiceCheckbox = function () {
    var cb = document.getElementById('setting-timer-voice');
    if (cb) cb.checked = !!app.timerVoiceEnabled;
    if (app.syncTimerVoiceDuckControls) app.syncTimerVoiceDuckControls();
    if (app.syncTimerVoiceExtraControls) app.syncTimerVoiceExtraControls();
  };

  app.syncTimerVoiceDuckControls = function () {
    var duckCb = document.getElementById('setting-timer-voice-duck');
    var mulInp = document.getElementById('setting-timer-voice-duck-mul');
    var mulLabel = document.getElementById('setting-timer-voice-duck-mul-label');
    var block = document.getElementById('timer-voice-duck-block');
    if (duckCb) {
      duckCb.checked = !!app.timerVoiceDuckEnabled;
    }
    var mul = typeof app.timerVoiceDuckMul === 'number' ? app.timerVoiceDuckMul : 0.38;
    if (mulInp) {
      mulInp.value = String(mul);
    }
    if (mulLabel) mulLabel.textContent = Math.round(mul * 100) + '%';
    if (block) {
      block.classList.toggle('timer-voice-duck-block--inactive', false);
    }
    var mulWrap = document.getElementById('timer-voice-duck-mul-wrap');
    if (mulWrap) {
      mulWrap.classList.toggle('timer-voice-duck-mul-wrap--inactive', !app.timerVoiceDuckEnabled);
    }
  };

  function syncTimerVoiceVolumeControls() {
    var noInp = document.getElementById('setting-voice-vol-no-music');
    var noLab = document.getElementById('setting-voice-vol-no-music-label');
    var withInp = document.getElementById('setting-voice-vol-with-music');
    var withLab = document.getElementById('setting-voice-vol-with-music-label');
    var rateInp = document.getElementById('setting-voice-rate');
    var rateLab = document.getElementById('setting-voice-rate-label');

    var vNo = hasNumber(app.voiceVolumeNoMusic) ? clamp01(app.voiceVolumeNoMusic) : 0.92;
    var vWith = hasNumber(app.voiceVolumeWithMusic) ? clamp01(app.voiceVolumeWithMusic) : 0.92;
    var rate = hasNumber(app.voiceRate) ? clampVoiceRate(app.voiceRate) : 1.0;

    if (noInp) {
      noInp.value = String(vNo);
    }
    if (noLab) noLab.textContent = Math.round(vNo * 100) + '%';

    if (withInp) {
      withInp.value = String(vWith);
    }
    if (withLab) withLab.textContent = Math.round(vWith * 100) + '%';

    if (rateInp) {
      rateInp.value = String(rate);
    }
    if (rateLab) rateLab.textContent = rate.toFixed(2).replace(/\.00$/, '') + 'x';
  }

  function syncNightActionsWaitControls() {
    var inp = document.getElementById('setting-night-wait');
    var lab = document.getElementById('setting-night-wait-label');
    var v = typeof app.nightActionsWaitSec === 'number' && !isNaN(app.nightActionsWaitSec) ? app.nightActionsWaitSec : 10;
    v = Math.round(v);
    if (v < 0) v = 0;
    if (v > 20) v = 20;
    if (inp) inp.value = String(v);
    if (lab) lab.textContent = String(v);
  }

  app.syncTimerVoiceExtraControls = function () {
    syncTimerVoiceVolumeControls();
    syncNightActionsWaitControls();
  };

  app.playTimerVoiceCue = function (kind) {
    if (!app.timerVoiceEnabled) return;
    var night =
      app.getCurrentMusicSlot &&
      app.getCurrentMusicSlot() === '2' &&
      app.isMusicPlaying &&
      app.isMusicPlaying();
    var filename;
    var shouldDuck = night && app.timerVoiceDuckEnabled;
    if (night) {
      filename = kind === '10' ? TIMER_VOICE_FILES.mafia10 : TIMER_VOICE_FILES.mafia0;
      if (shouldDuck && app.duckBackgroundMusicForTimerVoice) app.duckBackgroundMusicForTimerVoice();
    } else {
      filename = kind === '10' ? TIMER_VOICE_FILES.discuss10 : TIMER_VOICE_FILES.discuss0;
    }
    var a = document.getElementById('timer-voice');
    if (!a) return;
    a.volume = getEffectiveVoiceVolume();
    a.onended = null;
    a.onerror = null;
    var restoreDuck = shouldDuck;
    var cueDone = false;
    function onEndedOrError() {
      if (cueDone) return;
      cueDone = true;
      a.onended = null;
      a.onerror = null;
      voiceUiEnd();
      if (restoreDuck && app.restoreBackgroundMusicVolumeAfterTimerVoice) {
        app.restoreBackgroundMusicVolumeAfterTimerVoice();
      }
    }
    a.onended = onEndedOrError;
    a.onerror = onEndedOrError;
    voiceUiStart();
    a.src = timerVoiceUrl(filename);
    a.playbackRate = getEffectiveVoiceRate();
    var p = a.play();
    if (p && typeof p.then === 'function') {
      p.catch(function () {
        onEndedOrError();
      });
    }
  };

  app.showTimerVoiceModal = function () {
    showEl('modal-timer-voice', true);
  };

  app.hideTimerVoiceModal = function () {
    showEl('modal-timer-voice', false);
  };

  app.playSfxVoiceFile = function (filename) {
    var a = document.getElementById('sfx-voice');
    if (!a) return Promise.resolve(false);
    var shouldDuck = shouldDuckForAnyVoice();
    if (shouldDuck && app.duckBackgroundMusicForTimerVoice) app.duckBackgroundMusicForTimerVoice();
    try {
      a.pause();
      a.currentTime = 0;
    } catch (e) {}
    a.onended = null;
    a.onerror = null;
    a.volume = getEffectiveVoiceVolume();

    return new Promise(function (resolve) {
      var done = false;
      function fin(ok) {
        if (done) return;
        done = true;
        a.onended = null;
        a.onerror = null;
        if (app._cancelSfxVoiceFin === fin) app._cancelSfxVoiceFin = null;
        voiceUiEnd();
        if (shouldDuck && app.restoreBackgroundMusicVolumeAfterTimerVoice) {
          app.restoreBackgroundMusicVolumeAfterTimerVoice();
        }
        resolve(!!ok);
      }
      app._cancelSfxVoiceFin = fin;
      a.onended = function () {
        fin(true);
      };
      a.onerror = function () {
        fin(false);
      };
      voiceUiStart();
      a.src = sfxUrl(filename);
      a.playbackRate = getEffectiveVoiceRate();
      var p = a.play();
      if (p && typeof p.then === 'function') {
        p.catch(function () {
          fin(false);
        });
      }
    });
  };

  app.cancelSfxVoice = function () {
    var a = document.getElementById('sfx-voice');
    try {
      if (a) {
        a.onended = null;
        a.onerror = null;
        a.pause();
        a.removeAttribute('src');
        a.load();
      }
    } catch (e) {}
    if (app._cancelSfxVoiceFin) {
      var fin = app._cancelSfxVoiceFin;
      app._cancelSfxVoiceFin = null;
      try {
        fin(false);
      } catch (e) {}
    }
  };

  app.runNightActions = function () {
    if (app._nightActionsRunning) {
      app._nightActionsGen = (app._nightActionsGen || 0) + 1;
      app._nightActionsRunning = false;
      if (app.cancelSfxVoice) app.cancelSfxVoice();
      setNightActionsButtonActive(false);
      return;
    }

    var wait = typeof app.nightActionsWaitSec === 'number' && !isNaN(app.nightActionsWaitSec) ? app.nightActionsWaitSec : 10;
    wait = Math.round(wait);
    if (wait < 0) wait = 0;
    if (wait > 20) wait = 20;
    var waitMs = wait * 1000;

    app._nightActionsRunning = true;
    app._nightActionsGen = (app._nightActionsGen || 0) + 1;
    var gen = app._nightActionsGen;
    app.hideTimerVoiceModal();
    setNightActionsButtonActive(true);

    Promise.resolve()
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('mafia-shoots-with-a-number.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(waitMs);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('mafia-leaves.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(2000);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('don-wakes.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(waitMs);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('don-leaves.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(2000);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('sheriff-wakes.mp3');
      })
      .then(function () {
        guardNightActions(gen);
        return sleepMs(waitMs);
      })
      .then(function () {
        guardNightActions(gen);
        return app.playSfxVoiceFile('sheriff-leaves.mp3');
      })
      .catch(function () {})
      .then(function () {
        if (cancelledNightActions(gen)) return;
        app._nightActionsRunning = false;
        setNightActionsButtonActive(false);
      });
  };
})(window.MafiaApp);
