(function (app) {
  var BASE_VOLUME = 0.85;
  var currentObjectUrl = null;
  var currentSlot = null;
  var currentPlayItem = null;
  var duckedForTimerVoice = false;
  var _spotifyActiveSlot = null;
  var sessionVolumeMul = null;

  function getAudio() {
    return document.getElementById('bg-music');
  }

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
      applyVolume(a, currentPlayItem);
    }
    duckedForTimerVoice = false;
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
    if (app.hideMusicControlModal) app.hideMusicControlModal();
  };

  app.pauseMusic = function () {
    if (_spotifyActiveSlot) {
      if (app.spotifyPause) app.spotifyPause().catch(function () {});
      syncMusicControlPauseBtn();
      return;
    }
    var a = getAudio();
    if (a && !a.paused) {
      a.pause();
    }
    syncMusicControlPauseBtn();
  };

  app.resumeMusic = function () {
    if (_spotifyActiveSlot) {
      if (app.spotifyResume) app.spotifyResume().catch(function () {});
      syncMusicControlPauseBtn();
      return;
    }
    var a = getAudio();
    if (a && a.paused && a.src) {
      var p = a.play();
      if (p && typeof p.then === 'function') p.catch(function () {});
    }
    syncMusicControlPauseBtn();
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
    var v = BASE_VOLUME * mul;
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    a.volume = v;
  }

  app.musicSetSessionVolumeMul = function (mul) {
    if (typeof mul === 'number' && !isNaN(mul)) {
      sessionVolumeMul = Math.max(0, Math.min(1, mul));
    } else {
      sessionVolumeMul = null;
    }
    if (duckedForTimerVoice) return;
    if (_spotifyActiveSlot) {
      var v = sessionVolumeMul !== null ? BASE_VOLUME * sessionVolumeMul : BASE_VOLUME;
      if (app.spotifySetVolume) app.spotifySetVolume(Math.max(0, Math.min(1, v))).catch(function () {});
      return;
    }
    var a = getAudio();
    if (a && currentPlayItem) applyVolume(a, currentPlayItem);
  };

  function seekAudioToItemOffset(a, item) {
    var dur = a.duration;
    var off = typeof item.offsetSec === 'number' ? item.offsetSec : 0;
    if (typeof dur === 'number' && !isNaN(dur) && dur > 0) {
      if (off >= dur - 0.05) off = Math.max(0, dur - 0.05);
      a.currentTime = off;
    } else {
      a.currentTime = off;
    }
  }

  var previewPlayingKey = null;
  var previewRevokeUrl = null;

  function getPreviewAudio() {
    return document.getElementById('music-preview');
  }

  function syncMusicPreviewButtons() {
    var screen = document.getElementById('settings-screen');
    if (!screen) return;
    var btns = screen.querySelectorAll('.music-preview-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var sid = b.getAttribute('data-slot');
      var iid = b.getAttribute('data-item-id');
      var key = (sid === '2' ? '2' : '1') + ':' + iid;
      b.classList.toggle('is-playing', previewPlayingKey !== null && previewPlayingKey === key);
    }
  }

  app.stopMusicPreview = function () {
    var a = getPreviewAudio();
    if (previewRevokeUrl) {
      try {
        if (previewRevokeUrl.indexOf('blob:') === 0) URL.revokeObjectURL(previewRevokeUrl);
      } catch (e) {}
      previewRevokeUrl = null;
    }
    previewPlayingKey = null;
    if (a) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    syncMusicPreviewButtons();
  };

  app.musicPreviewToggle = function (slot, itemId) {
    var k = String(slot) === '2' ? '2' : '1';
    var key = k + ':' + itemId;
    var items = app.getMusicSlotItems(slot);
    var item = null;
    for (var ii = 0; ii < items.length; ii++) {
      if (items[ii].id === itemId) {
        item = items[ii];
        break;
      }
    }
    if (!item) return;
    var a = getPreviewAudio();
    if (!a) return;
    if (previewPlayingKey === key && !a.paused) {
      app.stopMusicPreview();
      return;
    }
    app.stopMusicPreview();
    previewPlayingKey = key;
    syncMusicPreviewButtons();
    app.musicResolvePlaySource(item).then(function (resolved) {
      if (!resolved || !resolved.url) {
        app.stopMusicPreview();
        return;
      }
      if (previewPlayingKey !== key) return;
      previewRevokeUrl = resolved.revoke ? resolved.url : null;
      a.playsInline = true;
      applyVolume(a, item);
      a.src = resolved.url;
      var settled = false;
      function onReady() {
        if (settled) return;
        if (previewPlayingKey !== key) return;
        settled = true;
        a.removeEventListener('loadedmetadata', onReady);
        a.removeEventListener('canplay', onReady);
        seekAudioToItemOffset(a, item);
        var p = a.play();
        if (p && typeof p.then === 'function') {
          p.catch(function () {
            app.stopMusicPreview();
          });
        }
        syncMusicPreviewButtons();
      }
      a.addEventListener('loadedmetadata', onReady);
      a.addEventListener('canplay', onReady);
      a.addEventListener(
        'error',
        function () {
          app.stopMusicPreview();
        },
        { once: true }
      );
      a.load();
    });
  };

  function playItem(slot, item) {
    var a = getAudio();
    if (!a || !item) return Promise.resolve(false);

    return app.musicResolvePlaySource(item).then(function (resolved) {
      if (!resolved || !resolved.url) return false;

      app.stopMusic();
      currentObjectUrl = resolved.url;
      currentSlot = String(slot) === '2' ? '2' : '1';
      currentPlayItem = item;

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
      if (app.spotifySetVolume) app.spotifySetVolume(Math.max(0, BASE_VOLUME * mul)).catch(function () {});
      return;
    }
    var a = getAudio();
    if (!a || a.paused || duckedForTimerVoice) return;
    duckedForTimerVoice = true;
    a.volume = Math.max(0, a.volume * mul);
  };

  app.restoreBackgroundMusicVolumeAfterTimerVoice = function () {
    if (!duckedForTimerVoice) return;
    duckedForTimerVoice = false;
    if (_spotifyActiveSlot) {
      var v = sessionVolumeMul !== null ? BASE_VOLUME * sessionVolumeMul : BASE_VOLUME;
      if (app.spotifySetVolume) app.spotifySetVolume(Math.max(0, Math.min(1, v))).catch(function () {});
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

  function showEl(id, show) {
    var el = document.getElementById(id);
    if (!el) return;
    if (app.modalSetOpen) app.modalSetOpen(el, show);
    else {
      el.classList.toggle('hidden', !show);
      el.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  app.showMusicSlotModal = function () {
    showEl('modal-music-slot', true);
  };

  app.hideMusicSlotModal = function () {
    showEl('modal-music-slot', false);
  };

  app.showMusicEmptyModal = function (slot) {
    var wrap = document.getElementById('modal-music-empty');
    if (wrap) wrap.dataset.slot = String(slot);
    showEl('modal-music-empty', true);
  };

  app.hideMusicEmptyModal = function () {
    showEl('modal-music-empty', false);
  };

  app.toggleMusicPlayback = function () {
    if (app.hasActiveMusicSession()) {
      app.showMusicControlModal();
      return;
    }
    app.showMusicSlotModal();
  };

  function fmtTime(sec) {
    if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    var r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function getMusicControlEls() {
    return {
      modal: document.getElementById('modal-music-control'),
      title: document.getElementById('modal-music-control-track'),
      seek: document.getElementById('modal-music-control-seek'),
      cur: document.getElementById('modal-music-control-time-current'),
      tot: document.getElementById('modal-music-control-time-total'),
      pauseBtn: document.getElementById('modal-music-control-pause'),
    };
  }

  var seekIsDragging = false;
  var musicControlListenersBound = false;

  function syncMusicControlPauseBtn() {
    var els = getMusicControlEls();
    if (!els.pauseBtn) return;
    var paused = false;
    if (_spotifyActiveSlot) {
      paused = false;
    } else {
      var a = getAudio();
      paused = !!(a && a.paused);
    }
    els.pauseBtn.textContent = paused ? 'Играть' : 'Пауза';
  }

  function syncMusicControlProgress() {
    var els = getMusicControlEls();
    if (!els.modal || els.modal.classList.contains('hidden')) return;
    var a = getAudio();
    if (_spotifyActiveSlot || !a) return;
    var dur = a.duration;
    var cur = a.currentTime;
    if (els.tot) els.tot.textContent = fmtTime(dur);
    if (els.cur) els.cur.textContent = fmtTime(cur);
    if (els.seek && !seekIsDragging) {
      if (typeof dur === 'number' && isFinite(dur) && dur > 0) {
        els.seek.disabled = false;
        var pct = Math.max(0, Math.min(1000, Math.round((cur / dur) * 1000)));
        els.seek.value = String(pct);
      } else {
        els.seek.value = '0';
      }
    }
  }

  function bindMusicControlListenersOnce() {
    if (musicControlListenersBound) return;
    var a = getAudio();
    if (!a) return;
    a.addEventListener('timeupdate', syncMusicControlProgress);
    a.addEventListener('loadedmetadata', syncMusicControlProgress);
    a.addEventListener('durationchange', syncMusicControlProgress);
    a.addEventListener('play', function () {
      syncMusicControlPauseBtn();
      syncMusicControlProgress();
    });
    a.addEventListener('pause', function () {
      syncMusicControlPauseBtn();
    });
    var els = getMusicControlEls();
    if (els.seek) {
      els.seek.addEventListener('pointerdown', function () {
        seekIsDragging = true;
      });
      var endDrag = function () {
        if (!seekIsDragging) return;
        seekIsDragging = false;
        applySeekFromSlider();
      };
      els.seek.addEventListener('pointerup', endDrag);
      els.seek.addEventListener('pointercancel', endDrag);
      els.seek.addEventListener('change', function () {
        seekIsDragging = false;
        applySeekFromSlider();
      });
      els.seek.addEventListener('input', function () {
        var au = getAudio();
        if (!au) return;
        var dur = au.duration;
        if (typeof dur !== 'number' || !isFinite(dur) || dur <= 0) return;
        var pct = parseInt(els.seek.value, 10);
        if (isNaN(pct)) pct = 0;
        var sec = (pct / 1000) * dur;
        if (els.cur) els.cur.textContent = fmtTime(sec);
      });
    }
    musicControlListenersBound = true;
  }

  function applySeekFromSlider() {
    var els = getMusicControlEls();
    if (!els.seek) return;
    var a = getAudio();
    if (!a) return;
    var dur = a.duration;
    if (typeof dur !== 'number' || !isFinite(dur) || dur <= 0) return;
    var pct = parseInt(els.seek.value, 10);
    if (isNaN(pct)) pct = 0;
    var sec = (pct / 1000) * dur;
    if (sec < 0) sec = 0;
    if (sec > dur - 0.05) sec = Math.max(0, dur - 0.05);
    try {
      a.currentTime = sec;
    } catch (e) {}
  }

  app.showMusicControlModal = function () {
    var els = getMusicControlEls();
    if (!els.modal) return;
    bindMusicControlListenersOnce();
    if (els.title) {
      var label = '';
      if (_spotifyActiveSlot) {
        label = 'Spotify плейлист';
      } else if (currentPlayItem && currentPlayItem.name) {
        label = currentPlayItem.name;
      } else {
        label = 'Музыка';
      }
      els.title.textContent = label;
    }
    if (els.seek) {
      if (_spotifyActiveSlot) {
        els.seek.disabled = true;
        els.seek.value = '0';
      } else {
        els.seek.disabled = false;
      }
    }
    if (els.pauseBtn) {
      els.pauseBtn.style.display = _spotifyActiveSlot ? 'none' : '';
    }
    syncMusicControlPauseBtn();
    syncMusicControlProgress();
    showEl('modal-music-control', true);
  };

  app.hideMusicControlModal = function () {
    showEl('modal-music-control', false);
  };

  function playSpotifySlot(slot, playlist) {
    var slotKey = String(slot) === '2' ? '2' : '1';
    app.stopMusic();

    function fallbackToLocal() {
      _spotifyActiveSlot = null;
      var item = pickRandomItem(slot);
      if (item) playItem(slot, item);
      else app.showMusicEmptyModal(slot);
    }

    app.spotifyEnsurePlayer().then(function (result) {
      if (!result) {
        if (app.spotifyLastError === 'premium_required') {
          if (app.showToast) app.showToast('Нужен Spotify Premium');
        } else {
          if (app.showToast) app.showToast('Spotify: не удалось подключить плеер');
        }
        fallbackToLocal();
        return;
      }
      app.spotifyPlayPlaylist(playlist.playlistId, BASE_VOLUME).then(function () {
        _spotifyActiveSlot = slotKey;
        currentSlot = slotKey;
        currentPlayItem = null;
        setMusicButtonPlaying(true);
      }).catch(function () {
        if (app.showToast) app.showToast('Spotify: ошибка воспроизведения');
        setMusicButtonPlaying(false);
        fallbackToLocal();
      });
    }).catch(function () {
      if (app.showToast) app.showToast('Spotify: ошибка подключения');
      setMusicButtonPlaying(false);
      fallbackToLocal();
    });
  }

  app.musicStartSlot = function (slot) {
    app.hideMusicSlotModal();

    var spotifyPlaylist = app.spotifyGetSlotPlaylist ? app.spotifyGetSlotPlaylist(slot) : null;
    if (spotifyPlaylist && spotifyPlaylist.playlistId && app.spotifyIsAuthenticated && app.spotifyIsAuthenticated()) {
      playSpotifySlot(slot, spotifyPlaylist);
      return;
    }

    var item = pickRandomItem(slot);
    if (!item) {
      app.showMusicEmptyModal(slot);
      return;
    }
    playItem(slot, item).then(function (ok) {
      if (!ok) app.showMusicEmptyModal(slot);
    });
  };

  app.musicOnEmptyFilesSelected = function (slot, fileList) {
    if (!fileList || !fileList.length) return;
    app.musicAddFilesToSlot(slot, fileList).then(function () {
      app.hideMusicEmptyModal();
      var item = pickRandomItem(slot);
      if (item) playItem(slot, item);
    });
  };

  var escapeHtml = app.escapeHtml;

  app.expandedMusicItemIdBySlot = { '1': '', '2': '' };

  app.getMusicExpandedItemId = function (slot) {
    var k = String(slot) === '2' ? '2' : '1';
    return app.expandedMusicItemIdBySlot[k] || '';
  };

  var MUSIC_PANEL_MS = 260;

  function musicSettingsFindLiByItemId(itemId) {
    var screen = document.getElementById('settings-screen');
    if (!screen) return null;
    var nodes = screen.querySelectorAll('li[data-music-item-id]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-music-item-id') === itemId) return nodes[i];
    }
    return null;
  }

  app.collapseRowInPlace = function (li, done) {
    var wrap = li.querySelector('.music-item-settings-wrap');
    if (!wrap || !wrap.classList.contains('is-open')) {
      if (done) done();
      return;
    }
    var inner = wrap.querySelector('.music-item-settings-inner');
    if (!inner) {
      if (done) done();
      return;
    }
    inner.style.maxHeight = 'none';
    var h = inner.scrollHeight;
    inner.style.maxHeight = h + 'px';
    void inner.offsetHeight;
    li.classList.remove('music-item-expanded');
    inner.style.maxHeight = '0';
    var finished = false;
    function onEnd(e) {
      if (!e || e.propertyName !== 'max-height') return;
      if (finished) return;
      finished = true;
      inner.removeEventListener('transitionend', onEnd);
      clearTimeout(tid);
      wrap.classList.remove('is-open');
      li.classList.remove('music-item-pending-expand');
      inner.style.maxHeight = '';
      if (done) done();
    }
    var tid = setTimeout(function () {
      onEnd({ propertyName: 'max-height' });
    }, MUSIC_PANEL_MS + 80);
    inner.addEventListener('transitionend', onEnd);
  };

  app.collapseOpenMusicPanelThen = function (done) {
    var screen = document.getElementById('settings-screen');
    if (!screen || !screen.classList.contains('active')) {
      if (done) done();
      return;
    }
    var wrap = screen.querySelector('.music-item-settings-wrap.is-open');
    if (!wrap) {
      if (done) done();
      return;
    }
    var li = wrap.closest('li');
    if (!li) {
      if (done) done();
      return;
    }
    app.collapseRowInPlace(li, done);
  };

  app.switchMusicExpandParallel = function (oldId, newId) {
    var screen = document.getElementById('settings-screen');
    if (!screen || !screen.classList.contains('active')) {
      app.renderMusicSettings();
      return;
    }
    var oldLi = musicSettingsFindLiByItemId(oldId);
    var newLi = musicSettingsFindLiByItemId(newId);
    if (!oldLi || !newLi || oldLi === newLi) {
      app.renderMusicSettings();
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        app.collapseRowInPlace(oldLi, null);
        newLi.classList.add('music-item-pending-expand');
        app.finishMusicSettingsExpandAnimations();
      });
    });
  };

  app.toggleMusicItemExpanded = function (slot, itemId) {
    var k = String(slot) === '2' ? '2' : '1';
    var other = k === '2' ? '1' : '2';
    var openHere = app.expandedMusicItemIdBySlot[k];
    var openOther = app.expandedMusicItemIdBySlot[other];

    if (openHere === itemId) {
      app.expandedMusicItemIdBySlot['1'] = '';
      app.expandedMusicItemIdBySlot['2'] = '';
      app.collapseOpenMusicPanelThen(function () {
        if (app.stopMusicPreview) app.stopMusicPreview();
      });
      return;
    }

    var oldId = openHere || openOther;

    app.expandedMusicItemIdBySlot['1'] = '';
    app.expandedMusicItemIdBySlot['2'] = '';
    app.expandedMusicItemIdBySlot[k] = itemId;

    if (oldId && oldId !== itemId) {
      app.switchMusicExpandParallel(oldId, itemId);
      return;
    }

    app.renderMusicSettings();
  };

  app.setMusicExpandedToItem = function (slot, itemId) {
    var k = String(slot) === '2' ? '2' : '1';
    var oldId = app.expandedMusicItemIdBySlot['1'] || app.expandedMusicItemIdBySlot['2'];
    var had = !!oldId;
    app.expandedMusicItemIdBySlot['1'] = '';
    app.expandedMusicItemIdBySlot['2'] = '';
    app.expandedMusicItemIdBySlot[k] = itemId || '';
    if (had && itemId && oldId !== itemId) {
      app.switchMusicExpandParallel(oldId, itemId);
      return;
    }
    if (had && !itemId) {
      app.collapseOpenMusicPanelThen(function () {
        if (app.stopMusicPreview) app.stopMusicPreview();
      });
      return;
    }
    app.renderMusicSettings();
  };

  app.finishMusicSettingsExpandAnimations = function () {
    var pending = document.querySelectorAll('li.music-item-pending-expand');
    if (!pending.length) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var i = 0; i < pending.length; i++) {
          var li = pending[i];
          li.classList.remove('music-item-pending-expand');
          li.classList.add('music-item-expanded');
          var wrap = li.querySelector('.music-item-settings-wrap');
          if (!wrap) continue;
          wrap.classList.add('is-open');
          var inner = wrap.querySelector('.music-item-settings-inner');
          if (!inner) continue;
          inner.style.maxHeight = 'none';
          var target = inner.scrollHeight;
          inner.style.maxHeight = '0';
          void inner.offsetHeight;
          inner.style.maxHeight = target + 'px';
        }
      });
    });
  };

  app.renderMusicSettings = function () {
    if (app.stopMusicPreview) app.stopMusicPreview();
    var c1 = document.getElementById('music-list-slot-1');
    var c2 = document.getElementById('music-list-slot-2');
    if (c1) c1.innerHTML = app.buildMusicSlotListHtml('1');
    if (c2) c2.innerHTML = app.buildMusicSlotListHtml('2');
    app.finishMusicSettingsExpandAnimations();
    if (app.renderSpotifySlotSettings) {
      app.renderSpotifySlotSettings('1');
      app.renderSpotifySlotSettings('2');
    }
  };

  app.buildMusicPlaylistRowHtml = function (slot, it, isOpen) {
    var offPool = it.enabled === false;
    var trackCount = Array.isArray(it.tracks) ? it.tracks.length : 0;
    var tracksHtml = '';
    if (trackCount) {
      tracksHtml += '<ol class="mt-1 space-y-1 text-mafia-cream/80 text-xs list-decimal list-inside marker:text-mafia-gold/55">';
      for (var t = 0; t < it.tracks.length; t++) {
        var tr = it.tracks[t];
        if (!tr) continue;
        tracksHtml +=
          '<li class="truncate" title="' +
          escapeHtml(tr.name || '') +
          '">' +
          escapeHtml(tr.name || '') +
          '</li>';
      }
      tracksHtml += '</ol>';
    } else {
      tracksHtml += '<p class="mt-1 text-mafia-cream/50 text-xs">Плейлист пуст.</p>';
    }
    return (
      '<li class="bg-mafia-black/40 border border-mafia-border rounded overflow-hidden text-left' +
      (offPool ? ' opacity-60' : '') +
      (isOpen ? ' music-item-pending-expand' : '') +
      '" data-music-item-id="' +
      escapeHtml(it.id) +
      '" data-music-slot="' +
      escapeHtml(slot) +
      '" data-music-kind="playlist">' +
      '<div class="flex items-stretch gap-0.5 pl-2 pr-1 sm:pl-3 sm:pr-2">' +
      '<button type="button" data-action="music-toggle-item-panel" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" class="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-mafia-card/50 transition-colors duration-200 cursor-pointer rounded-sm">' +
      '<span class="music-item-chevron" aria-hidden="true">▶</span>' +
      '<span class="text-mafia-gold/90 text-sm font-medium truncate flex-1 min-w-0" title="' +
      escapeHtml(it.name) +
      '">' +
      escapeHtml(it.name) +
      '</span>' +
      (offPool
        ? '<span data-music-off-badge class="text-mafia-cream/45 text-xs flex-shrink-0 uppercase tracking-wider">выкл.</span>'
        : '') +
      '<span class="text-mafia-cream/40 text-xs flex-shrink-0">плейлист · ' +
      trackCount +
      '</span>' +
      '</button>' +
      '</div>' +
      '<div class="music-item-settings-wrap">' +
      '<div class="music-item-settings-inner">' +
      '<div class="music-item-settings-panel px-3 pb-3 pt-0 border-t border-mafia-border/40">' +
      '<label class="flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-3 select-none">' +
      '<input type="checkbox" data-music-field="enabled" class="mafia-checkbox" ' +
      (offPool ? '' : 'checked') +
      '>' +
      '<span>Участвует в случайном выборе</span>' +
      '</label>' +
      '<div class="pt-3">' +
      '<div class="text-xs text-mafia-cream/60 uppercase tracking-wider">Треки</div>' +
      tracksHtml +
      '</div>' +
      '<div class="flex justify-end mt-2">' +
      '<button type="button" data-action="music-remove-item" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" class="text-red-400/90 hover:text-red-300 text-xs uppercase tracking-wider cursor-pointer">Удалить</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</li>'
    );
  };

  app.buildMusicSlotListHtml = function (slot) {
    var items = app.getMusicSlotItems(slot);
    if (!items.length) {
      return '<p class="text-mafia-cream/50 text-sm py-2">Нет треков — добавьте файлы.</p>';
    }
    var expandedId = app.getMusicExpandedItemId(slot);
    var html = '<ul class="space-y-2">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var isOpen = expandedId === it.id;
      var offPool = it.enabled === false;
      if (it.type === 'playlist') {
        html += app.buildMusicPlaylistRowHtml(slot, it, isOpen);
        continue;
      }
      var srcLabel =
        it.source && it.source.type === 'idb' ? 'с устройства' : '';
      html +=
        '<li class="bg-mafia-black/40 border border-mafia-border rounded overflow-hidden text-left' +
        (offPool ? ' opacity-60' : '') +
        (isOpen ? ' music-item-pending-expand' : '') +
        '" data-music-item-id="' +
        escapeHtml(it.id) +
        '" data-music-slot="' +
        escapeHtml(slot) +
        '">' +
        '<div class="flex items-stretch gap-0.5 pl-2 pr-1 sm:pl-3 sm:pr-2">' +
        '<button type="button" data-action="music-toggle-item-panel" data-slot="' +
        escapeHtml(slot) +
        '" data-item-id="' +
        escapeHtml(it.id) +
        '" class="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-mafia-card/50 transition-colors duration-200 cursor-pointer rounded-sm">' +
        '<span class="music-item-chevron" aria-hidden="true">▶</span>' +
        '<span class="text-mafia-gold/90 text-sm font-medium truncate flex-1 min-w-0" title="' +
        escapeHtml(it.name) +
        '">' +
        escapeHtml(it.name) +
        '</span>' +
        (offPool
          ? '<span data-music-off-badge class="text-mafia-cream/45 text-xs flex-shrink-0 uppercase tracking-wider">выкл.</span>'
          : '') +
        (srcLabel
          ? '<span class="text-mafia-cream/40 text-xs flex-shrink-0">' + escapeHtml(srcLabel) + '</span>'
          : '') +
        '</button>' +
        '<button type="button" data-action="music-preview" data-slot="' +
        escapeHtml(slot) +
        '" data-item-id="' +
        escapeHtml(it.id) +
        '" class="music-preview-btn flex h-9 w-9 shrink-0 items-center justify-center self-center rounded border border-mafia-border/50 bg-mafia-black/30 text-mafia-gold/90 text-sm transition-colors hover:border-mafia-gold/40 hover:bg-mafia-card/40" title="Прослушать" aria-label="Прослушать">▶</button>' +
        '</div>' +
        '<div class="music-item-settings-wrap">' +
        '<div class="music-item-settings-inner">' +
        '<div class="music-item-settings-panel px-3 pb-3 pt-0 border-t border-mafia-border/40">' +
        '<label class="flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-3 select-none">' +
        '<input type="checkbox" data-music-field="enabled" class="mafia-checkbox" ' +
        (offPool ? '' : 'checked') +
        '>' +
        '<span>Участвует в случайном выборе</span>' +
        '</label>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">' +
        '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider">Секунда старта' +
        '<input type="number" min="0" step="0.1" data-music-field="offset" value="' +
        (typeof it.offsetSec === 'number' ? it.offsetSec : 0) +
        '" class="mt-1 w-full px-2 py-1.5 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm">' +
        '</label>' +
        '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider">Громкость × <span class="text-mafia-gold/85 tabular-nums" data-music-vol-label>' +
        (typeof it.volumeMul === 'number' ? it.volumeMul : 1).toFixed(2) +
        '</span>' +
        '<input type="range" min="0.25" max="2" step="0.05" data-music-field="volume" value="' +
        (typeof it.volumeMul === 'number' ? it.volumeMul : 1) +
        '" class="mt-2 w-full accent-mafia-gold">' +
        '</label>' +
        '</div>' +
        (it.source && it.source.type === 'bundled'
          ? ''
          : '<div class="flex justify-end mt-2"><button type="button" data-action="music-remove-item" data-slot="' +
            escapeHtml(slot) +
            '" data-item-id="' +
            escapeHtml(it.id) +
            '" class="text-red-400/90 hover:text-red-300 text-xs uppercase tracking-wider cursor-pointer">Удалить</button></div>') +
        '</div>' +
        '</div>' +
        '</div>' +
        '</li>';
    }
    html += '</ul>';
    return html;
  };

  app.musicSyncEnabledRowAppearance = function (li, enabled) {
    if (!li) return;
    li.classList.toggle('opacity-60', !enabled);
    var btn = li.querySelector('[data-action="music-toggle-item-panel"]');
    if (!btn) return;
    var badge = btn.querySelector('[data-music-off-badge]');
    if (!enabled) {
      if (!badge) {
        badge = document.createElement('span');
        badge.setAttribute('data-music-off-badge', '');
        badge.className = 'text-mafia-cream/45 text-xs flex-shrink-0 uppercase tracking-wider';
        badge.textContent = 'выкл.';
        var titleEl = btn.querySelector('.truncate.min-w-0');
        if (titleEl) titleEl.after(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  };

  app.applyMusicFieldChange = function (el) {
    if (!el || !el.getAttribute) return;
    var field = el.getAttribute('data-music-field');
    if (!field) return;
    var li = el.closest('[data-music-item-id]');
    if (!li) return;
    var settings = document.getElementById('settings-screen');
    if (!settings || !settings.classList.contains('active')) return;
    var id = li.getAttribute('data-music-item-id');
    var slot = li.getAttribute('data-music-slot');
    if (!id || !slot) return;
    if (field === 'offset') {
      var off = parseFloat(el.value);
      if (isNaN(off)) off = 0;
      app.musicUpdateItem(slot, id, { offsetSec: off });
    } else if (field === 'volume') {
      var v = parseFloat(el.value);
      if (isNaN(v)) v = 1;
      app.musicUpdateItem(slot, id, { volumeMul: v });
      var label = li.querySelector('[data-music-vol-label]');
      if (label) label.textContent = v.toFixed(2);
    }
  };

  app.initMusic = function () {
    var a = getAudio();
    if (a) {
      a.addEventListener('ended', function () {
        app.stopMusic();
      });
    }
    var pa = getPreviewAudio();
    if (pa) {
      pa.addEventListener('ended', function () {
        if (app.stopMusicPreview) app.stopMusicPreview();
      });
    }
    setMusicButtonPlaying(false);
  };
})(window.MafiaApp);
