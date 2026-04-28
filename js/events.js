(function (app) {
  app.bindUiEvents = function () {
    var voteTilePtr = { tile: null, id: null };
    var ROLE_CLOSE_EDGE_GUARD_PX = 56;
    var roleCloseEdgeTouchBlockedAt = 0;
    var uiHelpers = {
      getIntAttr: function (el, name) {
        if (!el || !el.getAttribute) return null;
        var v = el.getAttribute(name);
        if (v === null) return null;
        var n = parseInt(v, 10);
        return isNaN(n) ? null : n;
      },
      isScreenActive: function (screenId) {
        var el = document.getElementById(screenId);
        return !!(el && el.classList.contains('active'));
      },
      withModalPlayerId: function (cb) {
        var modal = document.getElementById('modal-player-actions');
        var pid = modal && modal.dataset.playerId ? parseInt(modal.dataset.playerId, 10) : NaN;
        if (!isNaN(pid)) cb(pid);
      }
    };
    var localActionHandlers = {
      'toggle-timer': function () {
        app.toggleTimer();
      },
      'toggle-music': function () {
        app.toggleMusicPlayback();
      },
      'timer-voice-modal-open': function () {
        if (app.showTimerVoiceModal) app.showTimerVoiceModal();
      },
      'timer-voice-modal-close': function () {
        if (app.hideTimerVoiceModal) app.hideTimerVoiceModal();
      },
      'night-actions-run': function () {
        if (app.runNightActions) app.runNightActions();
      },
      'author-links-open': function () {
        if (app.showAuthorLinksModal) app.showAuthorLinksModal();
      },
      'author-links-close': function () {
        if (app.hideAuthorLinksModal) app.hideAuthorLinksModal();
      },
      'reset-game-confirm-open': function () {
        if (app.showResetGameConfirmModal) app.showResetGameConfirmModal();
      },
      'reset-game-confirm-cancel': function () {
        if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
      },
      'reset-game-confirm-apply': function () {
        if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
        if (app.resetGameState) app.resetGameState();
      },
      'reset-game-confirm-apply-with-nicks': function () {
        if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
        if (app.resetGameState) app.resetGameState({ resetNicknames: true });
      },
      'reset-timer': function (el) {
        var sec = uiHelpers.getIntAttr(el, 'data-seconds');
        if (sec !== null) app.resetTimer(sec);
      },
      'shuffle-seating': function () {
        if (app.shufflePlayerNicks) {
          var changed = app.shufflePlayerNicks();
          if (app.showToast) {
            app.showToast(changed ? 'Игроки пересажены случайно' : 'Для пересадки нужно минимум 2 ника');
          }
        }
      },
      'export-copy-text': function () {
        if (!uiHelpers.isScreenActive('summary-screen')) return;
        if (app.copyGameExportToClipboard) app.copyGameExportToClipboard();
      },
      'export-download-csv': function () {
        if (!uiHelpers.isScreenActive('summary-screen')) return;
        if (app.downloadGameExportCsv) app.downloadGameExportCsv();
      },
      'summary-player-open': function (el) {
        if (!uiHelpers.isScreenActive('summary-screen')) return;
        var spid = uiHelpers.getIntAttr(el, 'data-player-id');
        if (spid !== null && app.showSummaryPlayerModal) app.showSummaryPlayerModal(spid);
      },
      'summary-modal-save': function () {
        if (app.applySummaryPlayerModal) app.applySummaryPlayerModal();
      },
      'summary-bonus-delta': function (el) {
        if (!uiHelpers.isScreenActive('summary-screen')) return;
        var dAttr = el.getAttribute('data-delta');
        var d = dAttr !== null ? parseFloat(dAttr) : NaN;
        if (!isNaN(d) && app.applySummaryBonusDelta) app.applySummaryBonusDelta(d);
      },
      'summary-log-open': function (el) {
        if (!uiHelpers.isScreenActive('summary-screen')) return;
        var lidx = el.getAttribute('data-summary-log-index');
        var skipK = el.getAttribute('data-summary-skip-key');
        var lidxNum = lidx !== null ? parseInt(lidx, 10) : NaN;
        if ((skipK === null || skipK === '') && lidxNum === -1) skipK = 'lead';
        if (skipK !== null && skipK !== '' && app.showSummaryLogModal) {
          app.showSummaryLogModal(lidxNum, skipK);
        } else if (lidx !== null && app.showSummaryLogModal) {
          app.showSummaryLogModal(lidxNum, null);
        }
      },
      'summary-modal-log-cancel': function () {
        if (app.hideSummaryLogModal) app.hideSummaryLogModal();
      },
      'summary-modal-log-save': function () {
        if (app.applySummaryLogModal) app.applySummaryLogModal();
      }
    };

    function isInsideRoleCloseSafeArea(x, y) {
      if (!isFinite(x) || !isFinite(y)) return true;
      var w = window.innerWidth || document.documentElement.clientWidth || 0;
      var h = window.innerHeight || document.documentElement.clientHeight || 0;
      if (!w || !h) return true;
      return (
        x >= ROLE_CLOSE_EDGE_GUARD_PX &&
        x <= w - ROLE_CLOSE_EDGE_GUARD_PX &&
        y >= ROLE_CLOSE_EDGE_GUARD_PX &&
        y <= h - ROLE_CLOSE_EDGE_GUARD_PX
      );
    }

    function voteCandidateTileFromTarget(target) {
      return target && target.closest ? target.closest('[data-action="vote-open-count"]') : null;
    }

    if (window.PointerEvent) {
      document.body.addEventListener(
        'pointerdown',
        function (e) {
          var tile = voteCandidateTileFromTarget(e.target);
          if (!tile) {
            voteTilePtr.tile = null;
            voteTilePtr.id = null;
            return;
          }
          var vs = document.getElementById('vote-screen');
          if (!vs || !vs.classList.contains('active')) {
            voteTilePtr.tile = null;
            voteTilePtr.id = null;
            return;
          }
          voteTilePtr.tile = tile;
          voteTilePtr.id = e.pointerId;
          if (e.pointerType === 'touch') e.preventDefault();
        },
        { capture: true, passive: false }
      );

      document.body.addEventListener(
        'pointerup',
        function (e) {
          var tile = voteCandidateTileFromTarget(e.target);
          var downTile = voteTilePtr.tile;
          var downId = voteTilePtr.id;
          voteTilePtr.tile = null;
          voteTilePtr.id = null;
          if (!downTile || !tile || downTile !== tile || e.pointerId !== downId) return;
          var vs = document.getElementById('vote-screen');
          if (!vs || !vs.classList.contains('active')) return;
          if (e.pointerType === 'touch') e.preventDefault();
          var cix = tile.getAttribute('data-candidate-index');
          if (cix !== null && app.showVoteCountModal) app.showVoteCountModal(parseInt(cix, 10));
        },
        { capture: true, passive: false }
      );

      document.body.addEventListener(
        'pointercancel',
        function () {
          voteTilePtr.tile = null;
          voteTilePtr.id = null;
        },
        true
      );

      document.body.addEventListener(
        'keydown',
        function (e) {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          var t = e.target.closest('[data-action="vote-open-count"]');
          if (!t) return;
          var vs = document.getElementById('vote-screen');
          if (!vs || !vs.classList.contains('active')) return;
          e.preventDefault();
          var cixK = t.getAttribute('data-candidate-index');
          if (cixK !== null && app.showVoteCountModal) app.showVoteCountModal(parseInt(cixK, 10));
        },
        true
      );
    }

    document.body.addEventListener('click', function (e) {
      let t = e.target.closest('[data-goto]');
      if (t) {
        e.preventDefault();
        const id = t.getAttribute('data-goto');
        const initKind = t.getAttribute('data-init');
        if (initKind === 'game') app.initGameFromMenu();
        else if (initKind === 'auto' && app.initAutoFromMenu) app.initAutoFromMenu();
        else if (initKind === 'prepare-mode' && app.initPrepareModeFromMenu) app.initPrepareModeFromMenu();
        app.navigateToScreen(id);
        return;
      }
      t = e.target.closest('[data-close="role"]');
      if (t && document.getElementById('role-screen').classList.contains('active')) {
        if (Date.now() - roleCloseEdgeTouchBlockedAt < 700) return;
        if (!isInsideRoleCloseSafeArea(e.clientX, e.clientY)) return;
        e.preventDefault();
        app.closeRole();
        return;
      }
      t = e.target.closest('.card-flip');
      if (t && t.id && t.id.indexOf('card-') === 0) {
        e.preventDefault();
        const i = parseInt(t.id.replace('card-', ''), 10);
        if (!isNaN(i)) app.showRole(i);
        return;
      }
      t = e.target.closest('[data-action]');
      if (t) {
        const action = t.getAttribute('data-action');
        e.preventDefault();
        var delegatedHandler =
          localActionHandlers[action] || (app.uiActionHandlers ? app.uiActionHandlers[action] : null);
        if (delegatedHandler) delegatedHandler(t, e, uiHelpers);
        return;
      }
    });

    document.body.addEventListener(
      'touchend',
      function (e) {
        const t = e.target.closest('[data-close="role"]');
        if (t && document.getElementById('role-screen').classList.contains('active')) {
          var touch = e.changedTouches && e.changedTouches[0];
          if (touch && !isInsideRoleCloseSafeArea(touch.clientX, touch.clientY)) {
            roleCloseEdgeTouchBlockedAt = Date.now();
            e.preventDefault();
            return;
          }
          e.preventDefault();
          app.closeRole();
        }
      },
      { passive: false }
    );

    (function initPlayerGestures() {
      var LONG_PRESS_MS = 450;
      var SWIPE_Y_MIN = 30;
      var TAP_MOVE_MAX = 15;

      var g = { active: false, pid: null, touchId: -1, x0: 0, y0: 0, timer: null, fired: false };

      function pidFromEl(el) {
        var btn = el && el.closest ? el.closest('[data-action="player-slot-open"]') : null;
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
        for (var i = 0; i < list.length; i++) {
          if (list[i].identifier === id) return list[i];
        }
        return null;
      }

      document.body.addEventListener('touchstart', function (e) {
        if (g.active) return;
        var gs = document.getElementById('game-screen');
        if (!gs || !gs.classList.contains('active')) return;
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
          var inQ = app.nomineeQueue.indexOf(capturedPid) !== -1;
          var changed = inQ
            ? app.removePlayerFromNomineeQueue(capturedPid, { skipRender: true })
            : app.addPlayerToNomineeQueue(capturedPid, { skipRender: true });
          if (!changed) return;
          g.fired = true;
          if (app.patchPlayerSlotVoteIndicator) app.patchPlayerSlotVoteIndicator(capturedPid);
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
          if (wasFired && app.renderPlayers) app.renderPlayers();
          return;
        }
        if (g.timer) { clearTimeout(g.timer); g.timer = null; }
        var pid = g.pid;
        var fired = g.fired;
        var dy = t.clientY - g.y0;
        var dx = t.clientX - g.x0;
        reset();
        if (fired) {
          app._lastGestureTs = Date.now();
          if (app.renderPlayers) app.renderPlayers();
          e.preventDefault();
          return;
        }
        if (Math.abs(dy) >= SWIPE_Y_MIN && Math.abs(dy) > Math.abs(dx)) {
          app._lastGestureTs = Date.now();
          e.preventDefault();
          if (dy < 0) app.addFoul(pid);
          else app.removeFoul(pid);
          if (navigator.vibrate) navigator.vibrate(25);
          return;
        }
      }, { passive: false });

      document.body.addEventListener('touchcancel', function () {
        var wasFired = g.fired;
        reset();
        if (wasFired && app.renderPlayers) app.renderPlayers();
      }, { passive: true });
    })();

    function bindMusicFileInputs() {
      function addFromSettings(slot, inputEl) {
        if (!inputEl.files || !inputEl.files.length) return;
        app.musicAddFilesToSlot(slot, inputEl.files).then(function (added) {
          var key = String(slot) === '2' ? '2' : '1';
          var other = key === '2' ? '1' : '2';
          if (added && added.length && app.expandedMusicItemIdBySlot) {
            var hadOpen = app.expandedMusicItemIdBySlot['1'] || app.expandedMusicItemIdBySlot['2'];
            app.expandedMusicItemIdBySlot[other] = '';
            app.expandedMusicItemIdBySlot[key] = added[added.length - 1].id;
            if (hadOpen && app.collapseOpenMusicPanelThen) {
              app.collapseOpenMusicPanelThen(function () {
                if (app.renderMusicSettings) app.renderMusicSettings();
              });
            } else if (app.renderMusicSettings) {
              app.renderMusicSettings();
            }
          } else if (app.renderMusicSettings) {
            app.renderMusicSettings();
          }
        });
        inputEl.value = '';
      }
      function addZipFromSettings(slot, inputEl) {
        if (!inputEl.files || !inputEl.files.length) return;
        var file = inputEl.files[0];
        inputEl.value = '';
        if (!file) return;
        if (typeof JSZip === 'undefined') {
          if (app.showToast) app.showToast('Не удалось загрузить ZIP: библиотека недоступна');
          return;
        }
        if (app.showToast) app.showToast('Распаковка ZIP…');
        app.musicAddZipToSlot(slot, file).then(function (playlist) {
          var key = String(slot) === '2' ? '2' : '1';
          var other = key === '2' ? '1' : '2';
          if (playlist && app.expandedMusicItemIdBySlot) {
            var hadOpen = app.expandedMusicItemIdBySlot['1'] || app.expandedMusicItemIdBySlot['2'];
            app.expandedMusicItemIdBySlot[other] = '';
            app.expandedMusicItemIdBySlot[key] = playlist.id;
            if (hadOpen && app.collapseOpenMusicPanelThen) {
              app.collapseOpenMusicPanelThen(function () {
                if (app.renderMusicSettings) app.renderMusicSettings();
              });
            } else if (app.renderMusicSettings) {
              app.renderMusicSettings();
            }
          } else if (app.renderMusicSettings) {
            app.renderMusicSettings();
          }
          if (app.showToast) {
            var n = playlist && playlist.tracks ? playlist.tracks.length : 0;
            app.showToast('Плейлист добавлен (' + n + ' треков)');
          }
        }).catch(function (err) {
          var msg = 'Не удалось обработать ZIP';
          if (err && err.code === 'no_audio') msg = 'В архиве нет аудио-файлов';
          if (app.showToast) app.showToast(msg);
        });
      }
      var f1 = document.getElementById('music-files-slot-1');
      var f2 = document.getElementById('music-files-slot-2');
      var z1 = document.getElementById('music-zip-slot-1');
      var z2 = document.getElementById('music-zip-slot-2');
      var fe = document.getElementById('music-files-empty');
      if (f1)
        f1.addEventListener('change', function () {
          addFromSettings(1, f1);
        });
      if (f2)
        f2.addEventListener('change', function () {
          addFromSettings(2, f2);
        });
      if (z1)
        z1.addEventListener('change', function () {
          addZipFromSettings(1, z1);
        });
      if (z2)
        z2.addEventListener('change', function () {
          addZipFromSettings(2, z2);
        });
      if (fe)
        fe.addEventListener('change', function () {
          var wrap = document.getElementById('modal-music-empty');
          var slot = wrap && wrap.dataset.slot ? wrap.dataset.slot : '1';
          app.musicOnEmptyFilesSelected(slot, fe.files);
          fe.value = '';
        });
    }
    bindMusicFileInputs();

    document.body.addEventListener('input', function (e) {
      var el = e.target;
      if (el && el.id === 'setting-timer-voice-duck-mul') {
        var v = parseFloat(el.value);
        if (isNaN(v)) return;
        if (v < 0.05) v = 0.05;
        if (v > 1) v = 1;
        app.timerVoiceDuckMul = v;
        if (app.saveTimerVoiceDuckPrefs) app.saveTimerVoiceDuckPrefs();
        var lab = document.getElementById('setting-timer-voice-duck-mul-label');
        if (lab) lab.textContent = Math.round(v * 100) + '%';
        return;
      }
      if (el && el.id === 'setting-voice-vol-no-music') {
        var v0 = parseFloat(el.value);
        if (isNaN(v0)) return;
        if (v0 < 0) v0 = 0;
        if (v0 > 1) v0 = 1;
        app.voiceVolumeNoMusic = v0;
        if (app.saveVoiceVolumePrefs) app.saveVoiceVolumePrefs();
        var l0 = document.getElementById('setting-voice-vol-no-music-label');
        if (l0) l0.textContent = Math.round(v0 * 100) + '%';
        return;
      }
      if (el && el.id === 'setting-voice-vol-with-music') {
        var v1 = parseFloat(el.value);
        if (isNaN(v1)) return;
        if (v1 < 0) v1 = 0;
        if (v1 > 1) v1 = 1;
        app.voiceVolumeWithMusic = v1;
        if (app.saveVoiceVolumePrefs) app.saveVoiceVolumePrefs();
        var l1 = document.getElementById('setting-voice-vol-with-music-label');
        if (l1) l1.textContent = Math.round(v1 * 100) + '%';
        return;
      }
      if (el && el.id === 'setting-voice-rate') {
        var rr = parseFloat(el.value);
        if (isNaN(rr)) return;
        if (rr < 1) rr = 1;
        if (rr > 2) rr = 2;
        app.voiceRate = rr;
        if (app.saveVoiceRatePref) app.saveVoiceRatePref();
        var rl = document.getElementById('setting-voice-rate-label');
        if (rl) rl.textContent = rr.toFixed(2).replace(/\.00$/, '') + 'x';
        return;
      }
      if (el && el.id === 'setting-night-wait') {
        var nw = parseInt(el.value, 10);
        if (isNaN(nw)) return;
        if (nw < 0) nw = 0;
        if (nw > 20) nw = 20;
        app.nightActionsWaitSec = nw;
        if (app.saveNightActionsWaitPref) app.saveNightActionsWaitPref();
        var nlab = document.getElementById('setting-night-wait-label');
        if (nlab) nlab.textContent = String(nw);
        return;
      }
      if (el && el.id === 'spotify-client-id') {
        if (app.spotifySaveClientId) app.spotifySaveClientId(el.value);
        if (app.renderSpotifyGlobalSettings) {
          clearTimeout(el._spotifyRenderTimer);
          el._spotifyRenderTimer = setTimeout(function () {
            app.renderSpotifyGlobalSettings();
          }, 400);
        }
        return;
      }
      if (!el || !el.getAttribute || el.getAttribute('data-music-field') !== 'volume') return;
      app.applyMusicFieldChange(el);
    });
    document.body.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      if (el.id === 'setting-timer-voice') {
        app.timerVoiceEnabled = !!el.checked;
        if (app.saveTimerVoicePref) app.saveTimerVoicePref();
        if (app.syncTimerVoiceDuckControls) app.syncTimerVoiceDuckControls();
        if (app.syncTimerVoiceExtraControls) app.syncTimerVoiceExtraControls();
        return;
      }
      if (el.id === 'setting-timer-voice-duck') {
        app.timerVoiceDuckEnabled = !!el.checked;
        if (app.saveTimerVoiceDuckPrefs) app.saveTimerVoiceDuckPrefs();
        if (app.syncTimerVoiceDuckControls) app.syncTimerVoiceDuckControls();
        return;
      }
      var field = el.getAttribute('data-music-field');
      if (field === 'offset') {
        app.applyMusicFieldChange(el);
        return;
      }
      if (field === 'enabled') {
        var li = el.closest('[data-music-item-id]');
        if (!li) return;
        var settings = document.getElementById('settings-screen');
        if (!settings || !settings.classList.contains('active')) return;
        var id = li.getAttribute('data-music-item-id');
        var slot = li.getAttribute('data-music-slot');
        if (!id || !slot) return;
        app.musicUpdateItem(slot, id, { enabled: el.checked });
        if (app.musicSyncEnabledRowAppearance) app.musicSyncEnabledRowAppearance(li, el.checked);
      }
    });
  };
})(window.MafiaApp);
