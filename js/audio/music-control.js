/**
 * Музыка — модалки управления: выбор слота, «нет треков», и плеер
 * (название, пауза, ⏮/⏭, перемотка, отсчёт до дропа).
 */
(function (app) {
  'use strict';

  var M = (app._music = app._music || {});

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
      prevBtn: document.getElementById('modal-music-control-prev'),
      nextBtn: document.getElementById('modal-music-control-next'),
      drop: document.getElementById('modal-music-control-drop'),
      dropTime: document.getElementById('modal-music-control-drop-time'),
    };
  }

  // Обратный отсчёт до дропа: показываем, пока трек не дошёл до «секунды дропа».
  // Только для локального воспроизведения (у Spotify нет точной позиции/дропа).
  function syncMusicControlDrop() {
    var els = getMusicControlEls();
    if (!els.drop) return;
    var a = M.getAudio();
    var item = M.currentItem();
    var drop = item && typeof item.offsetSec === 'number' ? item.offsetSec : 0;
    if (M.isSpotifyActive() || !a || !drop || drop <= 0) {
      els.drop.classList.add('hidden');
      return;
    }
    var left = drop - (typeof a.currentTime === 'number' ? a.currentTime : 0);
    if (left <= 0.05) {
      els.drop.classList.add('hidden');
      return;
    }
    if (els.dropTime) els.dropTime.textContent = fmtTime(Math.ceil(left));
    els.drop.classList.remove('hidden');
  }

  var seekIsDragging = false;
  var musicControlListenersBound = false;

  function syncMusicControlPauseBtn() {
    var els = getMusicControlEls();
    if (!els.pauseBtn) return;
    var paused;
    if (M.isSpotifyActive()) {
      paused = false;
    } else {
      var a = M.getAudio();
      paused = !!(a && a.paused);
    }
    els.pauseBtn.textContent = paused ? 'Играть' : 'Пауза';
  }
  M.syncControlPauseBtn = syncMusicControlPauseBtn;

  function syncMusicControlProgress() {
    var els = getMusicControlEls();
    if (!els.modal || els.modal.classList.contains('hidden')) return;
    syncMusicControlDrop();
    var a = M.getAudio();
    if (M.isSpotifyActive() || !a) return;
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
    var a = M.getAudio();
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
        var au = M.getAudio();
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
    var a = M.getAudio();
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

  // Обновляет содержимое плеера (название, состояние кнопок, прогресс, отсчёт)
  // БЕЗ повторного открытия модалки — чтобы переключение трека не моргало.
  function updateMusicControlContent() {
    var els = getMusicControlEls();
    if (!els.modal) return;
    if (els.title) {
      var label;
      var item = M.currentItem();
      if (M.isSpotifyActive()) {
        label = 'Spotify плейлист';
      } else if (item && item.name) {
        label = item.name;
      } else {
        label = 'Музыка';
      }
      els.title.textContent = label;
    }
    if (els.seek) {
      if (M.isSpotifyActive()) {
        els.seek.disabled = true;
        els.seek.value = '0';
      } else {
        els.seek.disabled = false;
      }
    }
    if (els.pauseBtn) {
      els.pauseBtn.style.display = M.isSpotifyActive() ? 'none' : '';
    }
    syncMusicControlPauseBtn();
    syncMusicControlProgress();
  }
  app.refreshMusicControlModal = updateMusicControlContent;

  app.showMusicControlModal = function () {
    var els = getMusicControlEls();
    if (!els.modal) return;
    bindMusicControlListenersOnce();
    updateMusicControlContent();
    showEl('modal-music-control', true);
  };

  app.hideMusicControlModal = function () {
    showEl('modal-music-control', false);
  };
})(window.MafiaApp);
