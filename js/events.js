(function (app) {
  app.bindClicks = function () {
    var voteTilePtr = { tile: null, id: null };

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
      let t = e.target.closest('[data-action="full-reset"]');
      if (t) {
        e.preventDefault();
        app.fullReset();
        return;
      }
      t = e.target.closest('[data-goto]');
      if (t) {
        e.preventDefault();
        const id = t.getAttribute('data-goto');
        if (t.getAttribute('data-init') === 'game') app.initGameFromMenu();
        app.showScreen(id);
        return;
      }
      t = e.target.closest('[data-close="role"]');
      if (t && document.getElementById('role-screen').classList.contains('active')) {
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
        if (action === 'toggle-timer') app.toggleTimer();
        else if (action === 'toggle-music') app.musicToggleMainButton();
        else if (action === 'music-pick-cancel') app.hideMusicSlotModal();
        else if (action === 'music-pick-slot') {
          const slot = t.getAttribute('data-slot');
          if (slot) app.musicStartSlot(slot);
        }         else if (action === 'music-empty-cancel') app.hideMusicEmptyModal();
        else if (action === 'author-links-open') {
          if (app.showAuthorLinksModal) app.showAuthorLinksModal();
        } else if (action === 'author-links-close') {
          if (app.hideAuthorLinksModal) app.hideAuthorLinksModal();
        } else if (action === 'music-add-slot') {
          const slot = t.getAttribute('data-slot');
          const inp = document.getElementById(slot === '2' ? 'music-files-slot-2' : 'music-files-slot-1');
          if (inp) inp.click();
        } else if (action === 'music-toggle-item-panel') {
          const sid = t.getAttribute('data-slot');
          const iid = t.getAttribute('data-item-id');
          if (sid && iid && app.toggleMusicItemExpanded) app.toggleMusicItemExpanded(sid, iid);
        } else if (action === 'music-remove-item') {
          const sid = t.getAttribute('data-slot');
          const iid = t.getAttribute('data-item-id');
          if (sid && iid) {
            const key = sid === '2' ? '2' : '1';
            if (app.musicSettingsExpandedId && app.musicSettingsExpandedId[key] === iid) {
              app.musicSettingsExpandedId[key] = '';
            }
            app.musicRemoveItem(sid, iid).then(function () {
              if (app.renderMusicSettings) app.renderMusicSettings();
            });
          }
        } else if (action === 'reset-timer') {
          const sec = t.getAttribute('data-seconds');
          if (sec) app.resetTimer(parseInt(sec, 10));
        } else if (action === 'vote-open-count') {
          if (window.PointerEvent) return;
          var cix = t.getAttribute('data-candidate-index');
          if (cix !== null && app.showVoteCountModal) app.showVoteCountModal(parseInt(cix, 10));
        } else if (action === 'vote-count-pick') {
          if (app._voteModalOpenedAt && Date.now() - app._voteModalOpenedAt < 550) return;
          var vv = t.getAttribute('data-value');
          if (vv !== null && app.applyVoteCountPick) app.applyVoteCountPick(parseInt(vv, 10));
        } else if (action === 'raise-all-pick') {
          var rv = t.getAttribute('data-value');
          if (rv !== null && app.applyRaiseAllPick) app.applyRaiseAllPick(parseInt(rv, 10));
        } else if (action === 'vote-count-cancel') {
          if (app._voteModalOpenedAt && Date.now() - app._voteModalOpenedAt < 550) return;
          if (app.hideVoteCountModal) app.hideVoteCountModal();
        } else if (action === 'player-slot-open') {
          if (app._lastGestureTs && Date.now() - app._lastGestureTs < 400) return;
          const sid = t.getAttribute('data-player-id');
          if (sid && app.showPlayerActionsModal) {
            app.showPlayerActionsModal(parseInt(sid, 10));
          }
        } else if (action === 'player-modal-save') {
          if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
        } else if (action === 'player-modal-foul') {
          var modalF = document.getElementById('modal-player-actions');
          var pidF = modalF && modalF.dataset.playerId ? parseInt(modalF.dataset.playerId, 10) : NaN;
          if (!isNaN(pidF)) {
            var plF = app.players.find(function (x) {
              return x.id === pidF;
            });
            if (plF && !plF.outReason) {
              if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
              app.addFoul(pidF);
            }
          }
        } else if (action === 'player-modal-vote') {
          var modalV = document.getElementById('modal-player-actions');
          var pidV = modalV && modalV.dataset.playerId ? parseInt(modalV.dataset.playerId, 10) : NaN;
          if (!isNaN(pidV)) {
            var plV = app.players.find(function (x) {
              return x.id === pidV;
            });
            var inQV = app.votingOrder.indexOf(pidV) !== -1;
            if (plV && !plV.outReason) {
              if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
              if (inQV) {
                if (app.removeFromVote) app.removeFromVote(pidV);
              } else {
                app.addToVote(pidV);
              }
            }
          }
        } else if (action === 'player-modal-revive') {
          var modalR = document.getElementById('modal-player-actions');
          var pidR = modalR && modalR.dataset.playerId ? parseInt(modalR.dataset.playerId, 10) : NaN;
          if (!isNaN(pidR)) {
            var plR = app.players.find(function (x) {
              return x.id === pidR;
            });
            if (plR && plR.outReason && app.togglePlayerElimination) {
              var reasonR = plR.outReason;
              if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
              app.togglePlayerElimination(pidR, reasonR);
            }
          }
        } else if (action === 'player-modal-elim') {
          var modalE = document.getElementById('modal-player-actions');
          var pidE = modalE && modalE.dataset.playerId ? parseInt(modalE.dataset.playerId, 10) : NaN;
          var reasonE = t.getAttribute('data-elim');
          if (!isNaN(pidE) && reasonE && app.togglePlayerElimination) {
            if (app.hidePlayerActionsModal) app.hidePlayerActionsModal();
            app.togglePlayerElimination(pidE, reasonE);
          }
        } else if (action === 'summary-player-open') {
          var sumScr = document.getElementById('summary-screen');
          if (!sumScr || !sumScr.classList.contains('active')) return;
          var spid = t.getAttribute('data-player-id');
          if (spid !== null && app.showSummaryPlayerModal) app.showSummaryPlayerModal(parseInt(spid, 10));
        } else if (action === 'summary-modal-save') {
          if (app.applySummaryPlayerModal) app.applySummaryPlayerModal();
        } else if (action === 'summary-bonus-delta') {
          var sumScrB = document.getElementById('summary-screen');
          if (!sumScrB || !sumScrB.classList.contains('active')) return;
          var dAttr = t.getAttribute('data-delta');
          var d = dAttr !== null ? parseFloat(dAttr) : NaN;
          if (!isNaN(d) && app.applySummaryBonusDelta) app.applySummaryBonusDelta(d);
        } else if (action === 'summary-log-open') {
          var sumScrL = document.getElementById('summary-screen');
          if (!sumScrL || !sumScrL.classList.contains('active')) return;
          var lidx = t.getAttribute('data-summary-log-index');
          if (lidx !== null && app.showSummaryLogModal) app.showSummaryLogModal(parseInt(lidx, 10));
        } else if (action === 'summary-modal-log-cancel') {
          if (app.hideSummaryLogModal) app.hideSummaryLogModal();
        } else if (action === 'summary-modal-log-save') {
          if (app.applySummaryLogModal) app.applySummaryLogModal();
        }
        return;
      }
    });

    document.body.addEventListener(
      'touchend',
      function (e) {
        const t = e.target.closest('[data-close="role"]');
        if (t && document.getElementById('role-screen').classList.contains('active')) {
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
          g.fired = true;
          var inQ = app.votingOrder.indexOf(capturedPid) !== -1;
          if (inQ) app.removeFromVote(capturedPid, { skipRender: true });
          else app.addToVote(capturedPid, { skipRender: true });
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
          if (added && added.length && app.musicSettingsExpandedId) {
            app.musicSettingsExpandedId[key] = added[added.length - 1].id;
          }
          if (app.renderMusicSettings) app.renderMusicSettings();
        });
        inputEl.value = '';
      }
      var f1 = document.getElementById('music-files-slot-1');
      var f2 = document.getElementById('music-files-slot-2');
      var fe = document.getElementById('music-files-empty');
      if (f1)
        f1.addEventListener('change', function () {
          addFromSettings(1, f1);
        });
      if (f2)
        f2.addEventListener('change', function () {
          addFromSettings(2, f2);
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
      if (!el || !el.getAttribute || el.getAttribute('data-music-field') !== 'volume') return;
      app.applyMusicFieldChange(el);
    });
    document.body.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
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
        if (app.renderMusicSettings) app.renderMusicSettings();
      }
    });
  };
})(window.MafiaApp);
