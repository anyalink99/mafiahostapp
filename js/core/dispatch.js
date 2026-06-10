/**
 * Центральный диспетчер DOM-событий. Не содержит прикладной логики:
 * слушает body click/touch/pointer, находит [data-action] и вызывает
 * соответствующий обработчик из app.uiActionHandlers (регистрируются в events/*).
 * Также роутит data-goto, нажатия на карты, gesture-обработчики
 * (long-press, swipe) — это инфраструктура UI, общая для всех экранов.
 */
(function (app) {
  /**
   * Живое форматирование полей-списков номеров (лучший ход, протокол, мнение):
   * оставляет только цифры, разделители превращает в «, ». Пробел/запятая в конце
   * при вводе (не при удалении) добавляют «, », чтобы следующий номер шёл через запятую.
   */
  function formatNumListField(el, e) {
    var deleting = !!(e && e.inputType && e.inputType.indexOf('delete') === 0);
    var raw = el.value;
    var endsWithSep = !deleting && /[\s,;]$/.test(raw);
    var parts = raw.split(/[^0-9]+/).filter(function (x) {
      return x !== '';
    });
    var out = parts.join(', ');
    if (endsWithSep && out !== '') out += ', ';
    if (el.value !== out) el.value = out;
  }

  app.bindUiEvents = function () {
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
      },
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

    // Мобильные браузеры применяют CSS :active (нажатые карточки, active:scale-...)
    // только при наличии слушателя touchstart. Раньше его давали touch-жесты игроков;
    // теперь всё на Pointer Events, поэтому держим пустой passive-слушатель — иначе
    // :active залипает/срабатывает хаотично.
    document.addEventListener('touchstart', function () {}, { passive: true });

    // Доступность: Enter/Space по vote-плитке открывает подсчёт голосов.
    // Сам тап/клик по плитке обрабатывает click-делегат (vote-open-count);
    // CSS touch-action: manipulation убирает задержку тапа на телефоне.
    document.body.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var t = e.target.closest && e.target.closest('[data-action="vote-open-count"]');
        if (!t) return;
        if (!(app.isVotingUiActive && app.isVotingUiActive())) return;
        e.preventDefault();
        var cixK = t.getAttribute('data-candidate-index');
        if (cixK !== null && app.showVoteCountModal) app.showVoteCountModal(parseInt(cixK, 10));
      },
      true
    );

    // ── Единый слой жестов на Pointer Events ──
    // Игроки (game-screen): палец — удержание=выставление, вертикальный свайп=±фол,
    // тап открывает модалку (через click). Мышь — ПКМ=выставление, колесо=±фол, ЛКМ=модалка.
    // Таймер (#timer-pill): перетаскивание пальцем меняет время; мышь — колесом.
    // Прокрутку во время жеста гасит CSS touch-action на самих элементах, поэтому ВСЕ
    // слушатели passive — нет глобальных тормозов прокрутки/касаний.
    (function initPointerInput() {
      if (!window.PointerEvent) return;
      var LONG_PRESS_MS = 450,
        SWIPE_Y_MIN = 30,
        MOVE_CANCEL_PX = 15,
        TIMER_DRAG_PX = 9;
      var cur = null; // одно активное взаимодействие за раз, по pointerId
      var pressedEl = null; // карточка с визуальным «нажатием» (.is-pressed)

      // Нажатое состояние ведём сами (класс .is-pressed), а не через CSS :active:
      // :active не сбрасывается после свайпа без перерендера и «залипал».
      // Pointer Events гарантируют ровно один pointerup/pointercancel — класс всегда снимется.
      function setPressed(el) {
        if (pressedEl === el) return;
        clearPressed();
        pressedEl = el;
        if (el) el.classList.add('is-pressed');
      }
      function clearPressed() {
        if (pressedEl) {
          pressedEl.classList.remove('is-pressed');
          pressedEl = null;
        }
      }
      function toggleNominee(pid, opts) {
        var inQ = app.nomineeQueue && app.nomineeQueue.indexOf(pid) !== -1;
        return inQ
          ? app.removePlayerFromNomineeQueue(pid, opts)
          : app.addPlayerToNomineeQueue(pid, opts);
      }
      function clearLp() {
        if (cur && cur.lpTimer) {
          clearTimeout(cur.lpTimer);
          cur.lpTimer = null;
        }
      }

      document.addEventListener(
        'pointerdown',
        function (e) {
          if (cur || !gameScreenActive()) return;
          var pill = e.target.closest && e.target.closest('#timer-pill');
          if (pill && e.pointerType !== 'mouse') {
            cur = { kind: 'timer', id: e.pointerId, y0: e.clientY, base: app.timeLeft };
            return;
          }
          var slot = e.target.closest && e.target.closest('[data-action="player-slot-open"]');
          if (!slot) return;
          var pid = parseInt(slot.getAttribute('data-player-id'), 10);
          if (isNaN(pid)) return;
          setPressed(slot);
          if (e.pointerType === 'mouse') {
            // ПКМ — выставить/снять (аналог удержания). ЛКМ — модалка через click.
            if (e.button === 2) {
              toggleNominee(pid);
              app._lastGestureTs = Date.now();
            }
            return;
          }
          cur = {
            kind: 'player',
            id: e.pointerId,
            pid: pid,
            x0: e.clientX,
            y0: e.clientY,
            fired: false,
            moved: false,
            lpTimer: null,
          };
          cur.lpTimer = setTimeout(function () {
            if (!cur || cur.kind !== 'player' || cur.fired || cur.moved) return;
            cur.lpTimer = null;
            var changed = toggleNominee(cur.pid, { skipRender: true });
            if (!changed) return;
            cur.fired = true;
            if (app.patchPlayerSlotVoteIndicator) app.patchPlayerSlotVoteIndicator(cur.pid);
            if (navigator.vibrate) {
              try {
                navigator.vibrate(40);
              } catch (_e) {}
            }
          }, LONG_PRESS_MS);
        },
        { passive: true }
      );

      document.addEventListener(
        'pointermove',
        function (e) {
          if (!cur || e.pointerId !== cur.id) return;
          if (cur.kind === 'timer') {
            if (app.setTimer)
              app.setTimer(cur.base + Math.round((cur.y0 - e.clientY) / TIMER_DRAG_PX));
            return;
          }
          if (
            cur.kind === 'player' &&
            !cur.moved &&
            (Math.abs(e.clientX - cur.x0) > MOVE_CANCEL_PX ||
              Math.abs(e.clientY - cur.y0) > MOVE_CANCEL_PX)
          ) {
            cur.moved = true;
            clearLp();
          }
        },
        { passive: true }
      );

      document.addEventListener(
        'pointerup',
        function (e) {
          clearPressed();
          if (!cur || e.pointerId !== cur.id) return;
          var g = cur;
          if (g.kind === 'timer') {
            cur = null;
            return;
          }
          clearLp();
          cur = null;
          if (g.fired) {
            // Индикатор и очередь уже обновлены точечно при срабатывании удержания;
            // полный renderPlayers не нужен — он бы пересоздал карточку и оборвал
            // плавный возврат из «нажатого» состояния (резкий скачок размера).
            app._lastGestureTs = Date.now();
            return;
          }
          var dy = e.clientY - g.y0,
            dx = e.clientX - g.x0;
          if (Math.abs(dy) >= SWIPE_Y_MIN && Math.abs(dy) > Math.abs(dx)) {
            app._lastGestureTs = Date.now();
            if (dy < 0) app.addFoul(g.pid);
            else app.removeFoul(g.pid);
            if (navigator.vibrate) {
              try {
                navigator.vibrate(25);
              } catch (_e) {}
            }
          }
          // чистый тап — модалку откроет click-обработчик (player-slot-open)
        },
        { passive: true }
      );

      document.addEventListener(
        'pointercancel',
        function (e) {
          clearPressed();
          if (!cur || e.pointerId !== cur.id) return;
          clearLp();
          cur = null;
        },
        { passive: true }
      );
    })();

    document.body.addEventListener('click', function (e) {
      let t = e.target.closest('[data-goto]');
      if (t) {
        e.preventDefault();
        const id = t.getAttribute('data-goto');
        const initKind = t.getAttribute('data-init');
        if (initKind === 'game') app.initGameFromMenu();
        else if (initKind === 'auto' && app.initAutoFromMenu) app.initAutoFromMenu();
        else if (initKind === 'prepare-mode' && app.initPrepareModeFromMenu)
          app.initPrepareModeFromMenu();
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
        var delegatedHandler = app.uiActionHandlers ? app.uiActionHandlers[action] : null;
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
        app
          .musicAddZipToSlot(slot, file)
          .then(function (playlist) {
            var key = String(slot) === '2' ? '2' : '1';
            var other = key === '2' ? '1' : '2';
            if (playlist && app.expandedMusicItemIdBySlot) {
              var hadOpen =
                app.expandedMusicItemIdBySlot['1'] || app.expandedMusicItemIdBySlot['2'];
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
          })
          .catch(function (err) {
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
      if (el && el.getAttribute && el.hasAttribute('data-numlist')) {
        formatNumListField(el, e);
        return;
      }
      if (el && el.id === 'game-side-notes') {
        if (app.applyGameSideNotesInput) app.applyGameSideNotesInput(el.value);
        return;
      }
      if (el && (el.id === 'setting-timer-main' || el.id === 'setting-timer-short')) {
        var dsec = parseInt(el.value, 10);
        if (!isNaN(dsec) && app.setTimerDuration) {
          app.setTimerDuration(el.id === 'setting-timer-short' ? 'short' : 'main', dsec);
        }
        return;
      }
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
      if (el && el.id === 'setting-music-intro-leadin') {
        var ml = parseInt(el.value, 10);
        if (isNaN(ml)) return;
        var mlMax = app.MUSIC_INTRO_LEADIN_MAX || 30;
        if (ml < 0) ml = 0;
        if (ml > mlMax) ml = mlMax;
        app.musicIntroLeadInSec = ml;
        if (app.saveMusicIntroPrefs) app.saveMusicIntroPrefs();
        var mll = document.getElementById('setting-music-intro-leadin-label');
        if (mll) mll.textContent = String(ml);
        return;
      }
      if (el && el.id === 'setting-music-intro-fade') {
        var mf = parseInt(el.value, 10);
        if (isNaN(mf)) return;
        if (mf < 0) mf = 0;
        if (mf > 100) mf = 100;
        app.musicIntroFadePercent = mf;
        if (app.saveMusicIntroPrefs) app.saveMusicIntroPrefs();
        var mfl = document.getElementById('setting-music-intro-fade-label');
        if (mfl) mfl.textContent = mf + '%';
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
      if (el.id === 'setting-experimental-modes') {
        if (app.setExperimentalModes) app.setExperimentalModes(!!el.checked);
        return;
      }
      if (el.id === 'setting-mu-lookup') {
        if (app.MU && app.MU.setLookupEnabled) app.MU.setLookupEnabled(!!el.checked);
        return;
      }
      if (el.hasAttribute('data-music-select')) {
        var msSlot = el.getAttribute('data-slot');
        var msId = el.getAttribute('data-item-id');
        if (msSlot && msId && app.musicToggleSelected) {
          app.musicToggleSelected(msSlot, msId, !!el.checked);
        }
        return;
      }
      var field = el.getAttribute('data-music-field');
      if (field === 'offset' || field === 'name') {
        app.applyMusicFieldChange(el);
        return;
      }
      if (field === 'enabled') {
        if (app.applyMusicFieldChange) app.applyMusicFieldChange(el);
      }
    });

    function gameScreenActive() {
      var gs = document.getElementById('game-screen');
      return !!(gs && gs.classList.contains('active'));
    }

    // ПК-шорткаты на game-screen: колесо над таймером — подкрутка времени (±5 с),
    // колесо над игроком — ±фол (аналог свайпа на телефоне). Лёгкий троттлинг.
    var TIMER_WHEEL_STEP = 5;
    var lastTimerWheelTs = 0;
    var lastFoulWheelTs = 0;
    document.body.addEventListener(
      'wheel',
      function (e) {
        if (!e.target || !e.target.closest) return;
        if (!gameScreenActive()) return;
        if (e.target.closest('#timer-pill')) {
          if (!app.adjustTimer) return;
          var nowT = Date.now();
          if (nowT - lastTimerWheelTs < 45) {
            e.preventDefault();
            return;
          }
          lastTimerWheelTs = nowT;
          e.preventDefault();
          app.adjustTimer(e.deltaY < 0 ? TIMER_WHEEL_STEP : -TIMER_WHEEL_STEP);
          return;
        }
        var slot = e.target.closest('[data-action="player-slot-open"]');
        if (slot) {
          var pidW = parseInt(slot.getAttribute('data-player-id'), 10);
          if (isNaN(pidW)) return;
          e.preventDefault();
          var nowF = Date.now();
          if (nowF - lastFoulWheelTs < 140) return;
          lastFoulWheelTs = nowF;
          if (e.deltaY < 0) app.addFoul(pidW);
          else app.removeFoul(pidW);
        }
      },
      { passive: false }
    );

    // ПКМ по игроку обрабатывается в pointerdown (button===2). Здесь только гасим
    // нативное контекстное меню над слотом (и callout долгого нажатия на телефоне).
    document.body.addEventListener('contextmenu', function (e) {
      if (!gameScreenActive()) return;
      if (e.target && e.target.closest && e.target.closest('[data-action="player-slot-open"]')) {
        e.preventDefault();
      }
    });

    // Возврат вкладки/приложения из фона — мгновенно пересчитать таймер по часам.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && app.timerRunning && app.tickTimer) app.tickTimer();
    });
  };
})(window.MafiaApp);
