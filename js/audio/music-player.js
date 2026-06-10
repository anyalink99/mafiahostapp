/**
 * Музыка — ядро воспроизведения: фоновый трек слота (локальный или Spotify),
 * intro-режим «знакомства» (разгон к дропу + fade), дакинг под голос таймера,
 * стоп/пауза/переключение треков.
 */
(function (app) {
  'use strict';

  var M = (app._music = app._music || {});

  var currentObjectUrl = null;
  var currentSlot = null;
  var currentPlayItem = null;
  var duckedForTimerVoice = false;
  var _spotifyActiveSlot = null;
  var sessionVolumeMul = null;
  var duckFactor = 1;
  // ── Знакомство мафии (intro-режим): плавное нарастание громкости 0→100% ──
  // introFadeFactor домножается к итоговой громкости (как duckFactor). Прогресс
  // считаем от audio.currentTime, поэтому fade корректно «замирает» на паузе.
  var introFadeFactor = 1;
  var introFadeTimer = null;
  // Куда сикать при старте текущего трека (для intro — «дроп − разгон», иначе null).
  var currentSeekStart = null;
  // Режим intro текущей сессии — чтобы ⏮/⏭ продолжали разгон+fade, если сессию
  // открыли через «знакомство». Сбрасывается при полной остановке (stopMusic).
  var currentIntroOpts = null;
  // Подавляет закрытие модалки плеера внутри stopMusic при переключении трека
  // (иначе модалка моргала бы close→open на каждый ⏮/⏭).
  var suppressControlHide = false;

  function getAudio() {
    return document.getElementById('bg-music');
  }
  M.getAudio = getAudio;

  // Доступ к состоянию сессии для модалки плеера и превью.
  M.isSpotifyActive = function () {
    return !!_spotifyActiveSlot;
  };
  M.currentItem = function () {
    return currentPlayItem;
  };

  function revokeCurrentUrl() {
    if (currentObjectUrl) {
      try {
        if (currentObjectUrl.indexOf('blob:') === 0) URL.revokeObjectURL(currentObjectUrl);
      } catch (e) {}
      currentObjectUrl = null;
    }
  }

  function setMusicButtonPlaying(playing) {
    setToggleButtonState('btn-music', playing);
  }

  function setToggleButtonState(buttonId, active) {
    var btn = document.getElementById(buttonId);
    if (!btn) return;
    if (active) {
      btn.setAttribute('aria-pressed', 'true');
      btn.classList.remove('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.add('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    } else {
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.add('bg-mafia-card', 'border-mafia-border', 'text-mafia-cream');
      btn.classList.remove('bg-mafia-blood/40', 'border-mafia-gold/60', 'text-mafia-gold');
    }
  }

  app.isMusicPlaying = function () {
    if (_spotifyActiveSlot) return true;
    var a = getAudio();
    if (!a || a.paused) return false;
    if (a.currentTime > 0) return true;
    return a.readyState >= 2 && !!a.src;
  };

  app.stopMusic = function () {
    if (_spotifyActiveSlot) {
      if (app.spotifyPause) app.spotifyPause().catch(function () {});
      _spotifyActiveSlot = null;
    }
    var a = getAudio();
    if (duckedForTimerVoice && a && currentPlayItem) {
      duckFactor = 1;
      applyVolume(a, currentPlayItem);
    }
    duckedForTimerVoice = false;
    duckFactor = 1;
    clearIntroFade();
    currentSeekStart = null;
    currentIntroOpts = null;
    currentPlayItem = null;
    revokeCurrentUrl();
    currentSlot = null;
    sessionVolumeMul = null;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    setMusicButtonPlaying(false);
    if (!suppressControlHide && app.hideMusicControlModal) app.hideMusicControlModal();
  };

  app.pauseMusic = function () {
    if (_spotifyActiveSlot) {
      if (app.spotifyPause) app.spotifyPause().catch(function () {});
      M.syncControlPauseBtn();
      return;
    }
    var a = getAudio();
    if (a && !a.paused) {
      a.pause();
    }
    M.syncControlPauseBtn();
  };

  app.resumeMusic = function () {
    if (_spotifyActiveSlot) {
      if (app.spotifyResume) app.spotifyResume().catch(function () {});
      M.syncControlPauseBtn();
      return;
    }
    var a = getAudio();
    if (a && a.paused && a.src) {
      M.resumeAudioCtx();
      var p = a.play();
      if (p && typeof p.then === 'function') p.catch(function () {});
    }
    M.syncControlPauseBtn();
  };

  app.toggleMusicPause = function () {
    if (_spotifyActiveSlot) {
      app.pauseMusic();
      return;
    }
    var a = getAudio();
    if (!a) return;
    if (a.paused) app.resumeMusic();
    else app.pauseMusic();
  };

  app.hasActiveMusicSession = function () {
    if (_spotifyActiveSlot) return true;
    if (currentPlayItem) return true;
    var a = getAudio();
    return !!(a && a.src);
  };

  function applyVolume(a, item) {
    var mul;
    if (sessionVolumeMul !== null && !isNaN(sessionVolumeMul)) {
      mul = sessionVolumeMul;
    } else {
      mul = item && typeof item.volumeMul === 'number' ? item.volumeMul : 1;
    }
    M.setElementGainVolume(a, mul * duckFactor * introFadeFactor);
  }
  M.applyVolume = applyVolume;

  function clearIntroFade() {
    if (introFadeTimer) {
      clearInterval(introFadeTimer);
      introFadeTimer = null;
    }
    introFadeFactor = 1;
  }

  // Запускает плавное нарастание громкости от 0 до 100% за fadeDur секунд
  // воспроизведения, начиная с секунды startSec. Прогресс берём от a.currentTime,
  // чтобы пауза замораживала fade, а перемотка — корректно его смещала.
  function startIntroFade(a, item, startSec, fadeDur) {
    clearIntroFade();
    if (!a || fadeDur <= 0) return;
    introFadeFactor = 0;
    applyVolume(a, item);
    introFadeTimer = setInterval(function () {
      var cur = typeof a.currentTime === 'number' ? a.currentTime : startSec;
      var f = (cur - startSec) / fadeDur;
      if (f < 0) f = 0;
      if (f >= 1) {
        f = 1;
        clearInterval(introFadeTimer);
        introFadeTimer = null;
      }
      introFadeFactor = f;
      applyVolume(a, item);
    }, 40);
  }

  app.musicSetSessionVolumeMul = function (mul) {
    if (typeof mul === 'number' && !isNaN(mul)) {
      sessionVolumeMul = Math.max(0, Math.min(1, mul));
    } else {
      sessionVolumeMul = null;
    }
    if (duckedForTimerVoice) return;
    if (_spotifyActiveSlot) {
      var v = sessionVolumeMul !== null ? M.BASE_VOLUME * sessionVolumeMul : M.BASE_VOLUME;
      if (app.spotifySetVolume)
        app.spotifySetVolume(Math.max(0, Math.min(1, v))).catch(function () {});
      return;
    }
    var a = getAudio();
    if (a && currentPlayItem) applyVolume(a, currentPlayItem);
  };

  function seekAudioToItemOffset(a, item) {
    var dur = a.duration;
    var off =
      currentSeekStart !== null
        ? currentSeekStart
        : typeof item.offsetSec === 'number'
          ? item.offsetSec
          : 0;
    if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
      if (off >= dur - 0.05) off = Math.max(0, dur - 0.05);
      a.currentTime = off;
    } else {
      a.currentTime = off;
    }
  }
  M.seekToItemOffset = seekAudioToItemOffset;

  // Параметры intro-режима для трека: куда сикать (старт = «дроп − разгон») и
  // длительность плавного нарастания громкости. Разгон ограничен длиной проигрыша
  // (от 0 до дропа) — раньше начала файла уйти нельзя.
  function computeIntroParams(item, leadInSec) {
    var drop = typeof item.offsetSec === 'number' && item.offsetSec > 0 ? item.offsetSec : 0;
    var lead = typeof leadInSec === 'number' && !isNaN(leadInSec) ? leadInSec : 0;
    if (lead < 0) lead = 0;
    if (lead > drop) lead = drop; // «если возможно по длине трека»
    var start = drop - lead;
    var pct =
      typeof app.musicIntroFadePercent === 'number' && !isNaN(app.musicIntroFadePercent)
        ? app.musicIntroFadePercent
        : 70;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    var fadeDur = (pct / 100) * lead;
    return { start: start, fadeDur: fadeDur };
  }

  function playItem(slot, item, introOpts) {
    var a = getAudio();
    if (!a || !item) return Promise.resolve(false);

    return app.musicResolvePlaySource(item).then(function (resolved) {
      if (!resolved || !resolved.url) return false;

      app.stopMusic();
      currentObjectUrl = resolved.url;
      currentSlot = String(slot) === '2' ? '2' : '1';
      currentPlayItem = item;
      // stopMusic сбросил currentIntroOpts — восстанавливаем режим текущей сессии
      // (intro или обычный), чтобы ⏮/⏭ его сохраняли.
      currentIntroOpts = introOpts || null;

      var introStart = null;
      var introFadeDur = 0;
      if (introOpts) {
        var ip = computeIntroParams(item, introOpts.leadInSec);
        introStart = ip.start;
        introFadeDur = ip.fadeDur;
        currentSeekStart = introStart;
      }

      a.src = resolved.url;
      a.playsInline = true;
      applyVolume(a, item);

      return new Promise(function (resolve) {
        var settled = false;
        var fallbackTimer = null;
        function fail() {
          if (settled) return;
          settled = true;
          a.removeEventListener('loadedmetadata', onReady);
          a.removeEventListener('canplay', onReady);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          revokeCurrentUrl();
          currentSlot = null;
          currentPlayItem = null;
          setMusicButtonPlaying(false);
          resolve(false);
        }
        function onReady() {
          if (settled) return;
          settled = true;
          a.removeEventListener('loadedmetadata', onReady);
          a.removeEventListener('canplay', onReady);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          seekAudioToItemOffset(a, item);
          // Сик отработал — дальше currentSeekStart не нужен (и не должен утечь в превью).
          currentSeekStart = null;
          if (introOpts && introFadeDur > 0) {
            startIntroFade(a, item, introStart, introFadeDur);
          }
          var p = a.play();
          if (p && typeof p.then === 'function') {
            p.then(function () {
              setMusicButtonPlaying(true);
              resolve(true);
            }).catch(function () {
              revokeCurrentUrl();
              currentSlot = null;
              currentPlayItem = null;
              setMusicButtonPlaying(false);
              resolve(false);
            });
          } else {
            setMusicButtonPlaying(true);
            resolve(true);
          }
        }
        fallbackTimer = setTimeout(onReady, 4000);
        a.addEventListener('loadedmetadata', onReady);
        a.addEventListener('canplay', onReady);
        a.addEventListener('error', fail, { once: true });
        a.load();
      });
    });
  }

  app.getCurrentMusicSlot = function () {
    return currentSlot;
  };

  app.duckBackgroundMusicForTimerVoice = function () {
    if (!app.timerVoiceDuckEnabled) return;
    var mul =
      typeof app.timerVoiceDuckMul === 'number' && !isNaN(app.timerVoiceDuckMul)
        ? app.timerVoiceDuckMul
        : 0.38;
    if (mul < 0.05) mul = 0.05;
    if (mul > 1) mul = 1;
    if (_spotifyActiveSlot) {
      if (duckedForTimerVoice) return;
      duckedForTimerVoice = true;
      if (app.spotifySetVolume)
        app.spotifySetVolume(Math.max(0, M.BASE_VOLUME * mul)).catch(function () {});
      return;
    }
    var a = getAudio();
    if (!a || a.paused || duckedForTimerVoice) return;
    duckedForTimerVoice = true;
    duckFactor = mul;
    if (currentPlayItem) applyVolume(a, currentPlayItem);
    else M.setElementGainVolume(a, mul);
  };

  app.restoreBackgroundMusicVolumeAfterTimerVoice = function () {
    if (!duckedForTimerVoice) return;
    duckedForTimerVoice = false;
    duckFactor = 1;
    if (_spotifyActiveSlot) {
      var v = sessionVolumeMul !== null ? M.BASE_VOLUME * sessionVolumeMul : M.BASE_VOLUME;
      if (app.spotifySetVolume)
        app.spotifySetVolume(Math.max(0, Math.min(1, v))).catch(function () {});
      return;
    }
    var a = getAudio();
    if (!a || !currentPlayItem) return;
    applyVolume(a, currentPlayItem);
  };

  function pickRandomItem(slot) {
    var pool = app.musicGetSlotPlayablePool
      ? app.musicGetSlotPlayablePool(slot)
      : app.getMusicSlotItems(slot).filter(function (it) {
          return it && it.enabled !== false;
        });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function playSpotifySlot(slot, playlist) {
    var slotKey = String(slot) === '2' ? '2' : '1';
    app.stopMusic();

    function fallbackToLocal() {
      _spotifyActiveSlot = null;
      var item = pickRandomItem(slot);
      if (item) playItem(slot, item);
      else app.showMusicEmptyModal(slot);
    }

    app
      .spotifyEnsurePlayer()
      .then(function (result) {
        if (!result) {
          if (app.spotifyLastError === 'premium_required') {
            if (app.showToast) app.showToast('Нужен Spotify Premium');
          } else {
            if (app.showToast) app.showToast('Spotify: не удалось подключить плеер');
          }
          fallbackToLocal();
          return;
        }
        app
          .spotifyPlayPlaylist(playlist.playlistId, M.BASE_VOLUME)
          .then(function () {
            _spotifyActiveSlot = slotKey;
            currentSlot = slotKey;
            currentPlayItem = null;
            setMusicButtonPlaying(true);
          })
          .catch(function () {
            if (app.showToast) app.showToast('Spotify: ошибка воспроизведения');
            setMusicButtonPlaying(false);
            fallbackToLocal();
          });
      })
      .catch(function () {
        if (app.showToast) app.showToast('Spotify: ошибка подключения');
        setMusicButtonPlaying(false);
        fallbackToLocal();
      });
  }

  // opts.intro — режим «знакомства мафии»: старт за «разгон» секунд до дропа с
  // плавным нарастанием громкости. opts.leadInSec переопределяет глобальную
  // настройку (авто-режим передаёт фиксированные 10с под предкаунтдаун).
  // Intro применимо только к локальному воспроизведению — Spotify играет как обычно.
  app.musicStartSlot = function (slot, opts) {
    app.primeMusicAudio();
    app.hideMusicSlotModal();

    var introOpts = null;
    if (opts && opts.intro) {
      var lead =
        typeof opts.leadInSec === 'number' && !isNaN(opts.leadInSec)
          ? opts.leadInSec
          : app.musicIntroLeadInSec;
      introOpts = { leadInSec: lead };
    }

    var spotifyPlaylist = app.spotifyGetSlotPlaylist ? app.spotifyGetSlotPlaylist(slot) : null;
    if (
      spotifyPlaylist &&
      spotifyPlaylist.playlistId &&
      app.spotifyIsAuthenticated &&
      app.spotifyIsAuthenticated()
    ) {
      playSpotifySlot(slot, spotifyPlaylist);
      return;
    }

    var item = pickRandomItem(slot);
    if (!item) {
      app.showMusicEmptyModal(slot);
      return;
    }
    playItem(slot, item, introOpts).then(function (ok) {
      if (!ok) app.showMusicEmptyModal(slot);
    });
  };

  // Переключение трека в плеере (⏮/⏭). Локально — листаем пул текущего слота по
  // кругу. Режим воспроизведения сохраняем: если сессию открыли через «знакомство»
  // (intro), новый трек тоже идёт с разгоном+fade; иначе — сразу с дропа.
  // Для Spotify — штатные next/previous плеера.
  app.musicPlayAdjacentTrack = function (dir) {
    var step = dir < 0 ? -1 : 1;
    if (_spotifyActiveSlot) {
      app.primeMusicAudio();
      if (step > 0) {
        if (app.spotifyNextTrack) app.spotifyNextTrack().catch(function () {});
      } else if (app.spotifyPreviousTrack) {
        app.spotifyPreviousTrack().catch(function () {});
      }
      return;
    }
    var slot = currentSlot === '2' ? '2' : '1';
    var pool = app.musicGetSlotPlayablePool ? app.musicGetSlotPlayablePool(slot) : [];
    if (!pool.length) return;
    app.primeMusicAudio();
    var idx = -1;
    if (currentPlayItem) {
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].id === currentPlayItem.id) {
          idx = i;
          break;
        }
      }
    }
    var newIdx;
    if (idx === -1) {
      newIdx = step > 0 ? 0 : pool.length - 1;
    } else {
      newIdx = (idx + step + pool.length) % pool.length;
    }
    // Сохраняем режим сессии (intro или обычный) для нового трека.
    var introOpts = currentIntroOpts;
    // Не даём stopMusic закрыть модалку — просто обновим её содержимое.
    suppressControlHide = true;
    playItem(slot, pool[newIdx], introOpts).then(
      function (ok) {
        suppressControlHide = false;
        if (ok && app.refreshMusicControlModal) app.refreshMusicControlModal();
      },
      function () {
        suppressControlHide = false;
      }
    );
  };

  app.musicOnEmptyFilesSelected = function (slot, fileList) {
    if (!fileList || !fileList.length) return;
    app.primeMusicAudio();
    app.musicAddFilesToSlot(slot, fileList).then(function () {
      app.hideMusicEmptyModal();
      var item = pickRandomItem(slot);
      if (item) playItem(slot, item);
    });
  };

  app.initMusic = function () {
    if (app.loadMusicIntroPrefs) app.loadMusicIntroPrefs();
    var a = getAudio();
    if (a) {
      a.addEventListener('ended', function () {
        app.stopMusic();
      });
    }
    if (M.initPreview) M.initPreview();
    setMusicButtonPlaying(false);
  };
})(window.MafiaApp);
