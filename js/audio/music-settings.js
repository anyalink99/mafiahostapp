/**
 * Музыка — интеракции экрана настроек: раскрытие панелей (с анимацией
 * max-height), режим выбора треков для объединения в плейлист, потрековое
 * редактирование плейлиста, применение изменений полей и intro-настройки.
 * Список строит music-settings-list.js (DOM-билдер app.h).
 */
(function (app) {
  'use strict';

  app.expandedMusicItemIdBySlot = { 1: '', 2: '' };
  // id плейлиста, у которого сейчас включён режим «Редактировать» (потрековые настройки).
  app.musicPlaylistEditId = '';
  // id развёрнутого трека внутри редактируемого плейлиста (открыт только один за раз).
  app.musicPlaylistTrackOpenId = '';
  // Режим выбора треков для объединения в плейлист (по слотам) + множество id.
  app.musicSelectModeBySlot = { 1: false, 2: false };
  app.musicSelectedIdsBySlot = { 1: {}, 2: {} };

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
    // Сворачивание/переключение плейлиста сбрасывает режим редактирования.
    if (app.musicPlaylistEditId && app.musicPlaylistEditId !== itemId) {
      app.musicPlaylistEditId = '';
      app.musicPlaylistTrackOpenId = '';
    }
    if (openHere === itemId) {
      app.musicPlaylistEditId = '';
      app.musicPlaylistTrackOpenId = '';
    }

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
    if (app.musicPlaylistEditId && app.musicPlaylistEditId !== itemId) {
      app.musicPlaylistEditId = '';
      app.musicPlaylistTrackOpenId = '';
    }
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
    if (c1) {
      c1.innerHTML = '';
      c1.appendChild(app.buildMusicSlotList('1'));
    }
    if (c2) {
      c2.innerHTML = '';
      c2.appendChild(app.buildMusicSlotList('2'));
    }
    app.finishMusicSettingsExpandAnimations();
    if (app.syncMusicSlotControls) app.syncMusicSlotControls();
    if (app.renderSpotifySlotSettings) {
      app.renderSpotifySlotSettings('1');
      app.renderSpotifySlotSettings('2');
    }
  };

  // Прячет статические кнопки «Добавить/ZIP/Создать плейлист» в слоте, пока активен
  // режим выбора (там своя панель действий), и показывает обратно при выходе.
  app.syncMusicSlotControls = function () {
    ['1', '2'].forEach(function (k) {
      var on = !!app.musicSelectModeBySlot[k];
      var bar = document.getElementById('music-slot-actions-' + k);
      if (bar) bar.classList.toggle('hidden', on);
    });
  };

  // Вход/выход режима выбора треков для объединения (по слотам — взаимоисключающе
  // не требуется, но сбрасываем выбор при выходе).
  app.musicEnterSelectMode = function (slot) {
    var k = String(slot) === '2' ? '2' : '1';
    app.musicSelectModeBySlot[k] = true;
    app.musicSelectedIdsBySlot[k] = {};
    // Сворачиваем раскрытые панели этого слота, чтобы не мешали.
    if (app.expandedMusicItemIdBySlot[k]) app.expandedMusicItemIdBySlot[k] = '';
    app.renderMusicSettings();
  };

  app.musicExitSelectMode = function (slot) {
    var k = String(slot) === '2' ? '2' : '1';
    app.musicSelectModeBySlot[k] = false;
    app.musicSelectedIdsBySlot[k] = {};
    app.renderMusicSettings();
  };

  // Тогл чекбокса трека в режиме выбора — обновляем только панель действий (счётчик
  // и доступность кнопки «Объединить»), без перерисовки всего списка.
  app.musicToggleSelected = function (slot, itemId, checked) {
    var k = String(slot) === '2' ? '2' : '1';
    var sel = app.musicSelectedIdsBySlot[k] || (app.musicSelectedIdsBySlot[k] = {});
    if (checked) sel[itemId] = true;
    else delete sel[itemId];
    var container = document.getElementById('music-list-slot-' + k);
    if (!container) return;
    var n = 0;
    for (var id in sel) {
      if (Object.prototype.hasOwnProperty.call(sel, id) && sel[id]) n++;
    }
    var cntEl = container.querySelector('[data-music-select-count]');
    if (cntEl) cntEl.textContent = String(n);
    var btn = container.querySelector('[data-action="music-create-playlist-confirm"]');
    if (btn) {
      btn.disabled = n < 2;
      btn.textContent = 'Объединить (' + n + ')';
      btn.classList.toggle('border-mafia-border', n < 2);
      btn.classList.toggle('text-mafia-cream/35', n < 2);
      btn.classList.toggle('cursor-not-allowed', n < 2);
      btn.classList.toggle('border-mafia-gold/60', n >= 2);
      btn.classList.toggle('bg-mafia-blood/40', n >= 2);
      btn.classList.toggle('text-mafia-gold', n >= 2);
      btn.classList.toggle('cursor-pointer', n >= 2);
    }
    // Подсветка выбранной строки.
    var li = container.querySelector(
      'input[data-item-id="' + (window.CSS && CSS.escape ? CSS.escape(itemId) : itemId) + '"]'
    );
    li = li ? li.closest('li') : null;
    if (li) {
      li.classList.toggle('border-mafia-gold/60', !!checked);
      li.classList.toggle('border-mafia-border', !checked);
    }
  };

  app.musicCreatePlaylistFromSelection = function (slot) {
    var k = String(slot) === '2' ? '2' : '1';
    var sel = app.musicSelectedIdsBySlot[k] || {};
    var ids = [];
    for (var id in sel) {
      if (Object.prototype.hasOwnProperty.call(sel, id) && sel[id]) ids.push(id);
    }
    if (ids.length < 2) {
      if (app.showToast) app.showToast('Выберите минимум два трека');
      return;
    }
    var res = app.musicCreatePlaylistFromItems(slot, ids);
    app.musicSelectModeBySlot[k] = false;
    app.musicSelectedIdsBySlot[k] = {};
    app.renderMusicSettings();
    if (res && res.snapshot && app.showUndoToast) {
      var snap = res.snapshot;
      app.showUndoToast('Плейлист создан', function () {
        app.musicRestoreMetaSnapshot(snap);
        app.renderMusicSettings();
      });
    } else if (app.showToast) {
      app.showToast('Не удалось создать плейлист');
    }
  };

  app.musicDisbandPlaylistWithUndo = function (slot, itemId) {
    if (app.expandedMusicItemIdBySlot) {
      if (app.expandedMusicItemIdBySlot['1'] === itemId) app.expandedMusicItemIdBySlot['1'] = '';
      if (app.expandedMusicItemIdBySlot['2'] === itemId) app.expandedMusicItemIdBySlot['2'] = '';
    }
    var res = app.musicDisbandPlaylist(slot, itemId);
    app.renderMusicSettings();
    if (res && res.snapshot && app.showUndoToast) {
      var snap = res.snapshot;
      app.showUndoToast('Плейлист расформирован', function () {
        app.musicRestoreMetaSnapshot(snap);
        app.renderMusicSettings();
      });
    }
  };

  app.musicExportPlaylistWithFeedback = function (slot, itemId) {
    if (!app.musicExportPlaylistZip) return;
    app
      .musicExportPlaylistZip(slot, itemId)
      .then(function () {
        if (app.showToast) app.showToast('Архив плейлиста готов');
      })
      .catch(function () {
        if (app.showToast) app.showToast('Не удалось выгрузить плейлист');
      });
  };

  // Разворот/сворачивание одного трека (анимация max-height обёртки; внешняя панель
  // в режиме редактирования держится auto-высотой и тянется следом).
  function openTrackRow(row) {
    if (!row) return;
    var wrap = row.querySelector('.music-track-settings-wrap');
    var panel = row.querySelector('.music-track-settings-panel');
    if (!wrap || !panel) return;
    row.classList.add('is-open');
    wrap.style.maxHeight = '0px';
    void wrap.offsetHeight;
    wrap.style.maxHeight = panel.scrollHeight + 'px';
    var onEnd = function (e) {
      if (e.propertyName !== 'max-height') return;
      wrap.removeEventListener('transitionend', onEnd);
      if (row.classList.contains('is-open')) wrap.style.maxHeight = 'none';
    };
    wrap.addEventListener('transitionend', onEnd);
  }
  function closeTrackRow(row) {
    if (!row) return;
    var wrap = row.querySelector('.music-track-settings-wrap');
    if (!wrap) return;
    row.classList.remove('is-open');
    wrap.style.maxHeight = wrap.scrollHeight + 'px';
    void wrap.offsetHeight;
    wrap.style.maxHeight = '0px';
  }

  // Перестраивает блок треков плейлиста на месте и плавно подгоняет высоту панели.
  function rebuildPlaylistTracksInPlace(slot, itemId, mutateBtn) {
    var li = musicSettingsFindLiByItemId(itemId);
    var screen = document.getElementById('settings-screen');
    if (!li || !screen || !screen.classList.contains('active')) {
      if (app.renderMusicSettings) app.renderMusicSettings();
      return;
    }
    var items = app.getMusicSlotItems(slot);
    var it = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        it = items[i];
        break;
      }
    }
    var container = li.querySelector('[data-music-tracks]');
    var inner = li.querySelector('.music-item-settings-inner');
    if (!it || !container) {
      if (app.renderMusicSettings) app.renderMusicSettings();
      return;
    }
    var oldH = inner ? inner.scrollHeight : 0;
    container.style.opacity = '0';
    container.innerHTML = '';
    container.appendChild(
      app.buildMusicPlaylistTracks(slot, it, app.musicPlaylistEditId === itemId)
    );
    if (mutateBtn) mutateBtn(li);
    requestAnimationFrame(function () {
      container.style.opacity = '1';
    });
    if (inner) {
      var newH = inner.scrollHeight;
      inner.style.maxHeight = oldH + 'px';
      void inner.offsetHeight;
      inner.style.maxHeight = newH + 'px';
      // После анимации высоты — auto, чтобы потрековый разворот мог растягивать панель.
      var onEnd = function (e) {
        if (e.propertyName !== 'max-height') return;
        inner.removeEventListener('transitionend', onEnd);
        inner.style.maxHeight = 'none';
      };
      inner.addEventListener('transitionend', onEnd);
    }
  }

  // Переключает режим «Редактировать» у плейлиста, перестраивая только блок треков
  // (без сворачивания/повторного раскрытия панели — плавно меняет высоту).
  app.toggleMusicPlaylistEdit = function (slot, itemId) {
    app.musicPlaylistEditId = app.musicPlaylistEditId === itemId ? '' : itemId;
    app.musicPlaylistTrackOpenId = '';
    if (app.stopMusicPreview) app.stopMusicPreview();
    var editing = app.musicPlaylistEditId === itemId;
    rebuildPlaylistTracksInPlace(slot, itemId, function (li) {
      var btn = li.querySelector('[data-music-edit-btn]');
      if (!btn) return;
      btn.textContent = editing ? 'Готово' : 'Редактировать';
      btn.classList.toggle('text-mafia-gold', editing);
      btn.classList.toggle('text-mafia-cream/70', !editing);
      btn.classList.toggle('hover:text-mafia-cream', !editing);
    });
  };

  // Разворачивает/сворачивает один трек в режиме редактирования (открыт только один) —
  // анимированно, без перестроения списка (по аналогии с обычным разворотом песни).
  app.toggleMusicPlaylistTrack = function (slot, playlistId, trackId) {
    var li = musicSettingsFindLiByItemId(playlistId);
    var screen = document.getElementById('settings-screen');
    var prevId = app.musicPlaylistTrackOpenId;
    var newId = prevId === trackId ? '' : trackId;
    app.musicPlaylistTrackOpenId = newId;
    if (app.stopMusicPreview) app.stopMusicPreview();
    if (!li || !screen || !screen.classList.contains('active')) {
      if (app.renderMusicSettings) app.renderMusicSettings();
      return;
    }
    // Внешняя панель плейлиста — auto-высота, чтобы тянуться за разворотом трека.
    var outerInner = li.querySelector('.music-item-settings-inner');
    if (outerInner) outerInner.style.maxHeight = 'none';
    if (prevId && prevId !== newId) {
      closeTrackRow(li.querySelector('[data-music-track-id="' + prevId + '"]'));
    }
    if (newId) {
      openTrackRow(li.querySelector('[data-music-track-id="' + newId + '"]'));
    }
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
    var trackEl = el.closest('[data-music-track-id]');
    var trackId = trackEl ? trackEl.getAttribute('data-music-track-id') : null;

    var patch = {};
    if (field === 'offset') {
      var off = parseFloat(el.value);
      if (isNaN(off)) off = 0;
      patch.offsetSec = off;
    } else if (field === 'volume') {
      var v = parseFloat(el.value);
      if (isNaN(v)) v = 1;
      patch.volumeMul = v;
      var labelWrap = el.closest('label');
      var label = labelWrap ? labelWrap.querySelector('[data-music-vol-label]') : null;
      if (label) label.textContent = v.toFixed(2);
    } else if (field === 'enabled') {
      patch.enabled = !!el.checked;
    } else if (field === 'name') {
      patch.name = el.value;
    } else {
      return;
    }

    if (trackId) {
      if (app.musicUpdatePlaylistTrack) app.musicUpdatePlaylistTrack(slot, id, trackId, patch);
      if (field === 'enabled' && trackEl) trackEl.classList.toggle('opacity-55', !el.checked);
    } else {
      app.musicUpdateItem(slot, id, patch);
      if (field === 'enabled' && app.musicSyncEnabledRowAppearance) {
        app.musicSyncEnabledRowAppearance(li, el.checked);
      }
      // Переименование плейлиста — обновляем видимый заголовок строки на месте.
      if (field === 'name') {
        var titleEl = li.querySelector('[data-music-title]');
        if (titleEl) {
          var nm = el.value.replace(/\s+/g, ' ').trim().slice(0, 120);
          if (nm) {
            titleEl.textContent = nm;
            titleEl.setAttribute('title', nm);
          }
        }
      }
    }
  };

  app.syncMusicIntroControls = function () {
    var leadInp = document.getElementById('setting-music-intro-leadin');
    var leadLab = document.getElementById('setting-music-intro-leadin-label');
    var fadeInp = document.getElementById('setting-music-intro-fade');
    var fadeLab = document.getElementById('setting-music-intro-fade-label');
    var lead =
      typeof app.musicIntroLeadInSec === 'number' && !isNaN(app.musicIntroLeadInSec)
        ? app.musicIntroLeadInSec
        : 10;
    var fade =
      typeof app.musicIntroFadePercent === 'number' && !isNaN(app.musicIntroFadePercent)
        ? app.musicIntroFadePercent
        : 70;
    if (leadInp) leadInp.value = String(lead);
    if (leadLab) leadLab.textContent = String(lead);
    if (fadeInp) fadeInp.value = String(fade);
    if (fadeLab) fadeLab.textContent = fade + '%';
  };
})(window.MafiaApp);
