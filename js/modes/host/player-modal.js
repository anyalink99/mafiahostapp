/**
 * Хост-режим — модалка игрока (modal-player-actions): псевдоним, фол,
 * выставление, статусы выбытия; в режиме подготовки — выбор роли;
 * на мобилке — поля «лучший ход / протокол / мнение / примечание».
 */
(function (app) {
  'use strict';

  var H = (app._host = app._host || {});
  var ELIM_REASON_TITLES = app.ELIM_REASON_TITLES;

  app.syncPlayerModalFoulControl = function (id) {
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    var modal = document.getElementById('modal-player-actions');
    if (!modal) return;
    var count = document.getElementById('modal-player-foul-count');
    var minus = modal.querySelector('[data-action="player-modal-foul-minus"]');
    var plus = modal.querySelector('[data-action="player-modal-foul-plus"]');
    if (count) count.textContent = (p.fouls || 0) + ' / 4';
    if (minus) minus.disabled = !!p.eliminationReason || !p.fouls;
    if (plus) plus.disabled = !!p.eliminationReason || p.fouls >= 4;
  };

  app.syncPlayerNickFromModal = function () {
    var m = document.getElementById('modal-player-actions');
    var inp = document.getElementById('modal-player-nick');
    if (!m || !inp) return;
    var pidStr = m.dataset.playerId;
    if (pidStr === undefined || pidStr === '') return;
    var pid = parseInt(pidStr, 10);
    if (isNaN(pid)) return;
    var pl = app.players.find(function (x) {
      return x.id === pid;
    });
    if (!pl) return;
    pl.nick = inp.value.slice(0, 32);
    var mode = m.dataset.mode || '';
    if (mode === 'prepare') {
      var seatIndex = app.players.indexOf(pl);
      var availableRoles = H.manualRolesForCurrentPrepare(pid);
      if (availableRoles.length > 0) {
        var roleCode = H.getPrepareModalSelectedRoleCode();
        if (roleCode && availableRoles.indexOf(roleCode) !== -1) {
          if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object') {
            app.summaryRoleByPlayerId = {};
          }
          app.summaryRoleByPlayerId[String(pid)] = roleCode;
        } else if (H.isDonskayaPreAssign()) {
          // Донская: «снято» = убрать оверрайд (иначе зависает 'peaceful' и
          // последующий reconcile видит мусор).
          if (app.summaryRoleByPlayerId) delete app.summaryRoleByPlayerId[String(pid)];
        } else if (app.summaryRoleByPlayerId && app.getEffectiveSummaryRoleCode) {
          app.summaryRoleByPlayerId[String(pid)] = app.getEffectiveSummaryRoleCode(pid, seatIndex);
        }
      }
      // Донская: как только двойка мафии помечена — game/donskaya.js фиксирует
      // расклад (мутирует app.roles, разыгрывает шерифа, заполняет мирных)
      // и снимает временные mafia-оверрайды.
      if (app.donskayaReconcile) app.donskayaReconcile();
    }
    app.saveState();
  };

  app.hidePlayerActionsModal = function () {
    var m = document.getElementById('modal-player-actions');
    var wasOpen = m && m.hasAttribute('data-open');
    if (wasOpen) {
      app.syncPlayerNickFromModal();
      app.syncPlayerExtrasFromModal();
    }
    if (m) app.modalSetOpen(m, false);
    if (wasOpen) {
      var gs = document.getElementById('game-screen');
      var ps = document.getElementById('prepare-screen');
      if (gs && gs.classList.contains('active') && app.renderPlayers) app.renderPlayers();
      if (ps && ps.classList.contains('active') && app.renderPreparePlayers) {
        app.renderPreparePlayers();
      }
    }
  };

  app.showPlayerActionsModal = function (id) {
    var p = app.players.find(function (x) {
      return x.id === id;
    });
    if (!p) return;
    var m = document.getElementById('modal-player-actions');
    if (!m) return;
    var title = document.getElementById('modal-player-actions-title');
    var whenActive = document.getElementById('modal-player-actions-when-active');
    var whenOut = document.getElementById('modal-player-actions-when-out');
    var gameScreen = document.getElementById('game-screen');
    var prepareScreen = document.getElementById('prepare-screen');
    var inGameScreen = !!(gameScreen && gameScreen.classList.contains('active'));
    var inPrepareScreen = !!(prepareScreen && prepareScreen.classList.contains('active'));
    var nickOnlyMode = inPrepareScreen && !inGameScreen;
    if (title) title.textContent = 'Игрок №' + id;
    var inQueue = app.nomineeQueue.indexOf(id) !== -1;
    var out = !!p.eliminationReason;
    m.dataset.mode = nickOnlyMode ? 'prepare' : 'game';
    // playerId должен быть установлен до renderPrepareModalRoleRadios — рендер опирается
    // на m.dataset.playerId, чтобы спросить manualRolesForCurrentPrepare(playerId).
    m.dataset.playerId = String(id);
    var prepRoleSection = document.getElementById('modal-player-prepare-role-section');
    if (prepRoleSection) prepRoleSection.classList.toggle('hidden', !nickOnlyMode);
    if (app.getEffectiveSummaryRoleCode) {
      var seatIndex = app.players.indexOf(p);
      app.renderPrepareModalRoleRadios(app.getEffectiveSummaryRoleCode(id, seatIndex));
    }
    if (whenActive && whenOut) {
      if (nickOnlyMode) {
        whenActive.classList.add('hidden');
        whenOut.classList.add('hidden');
      } else if (out) {
        whenActive.classList.add('hidden');
        whenOut.classList.remove('hidden');
      } else {
        whenActive.classList.remove('hidden');
        whenOut.classList.add('hidden');
      }
    }
    if (!out && !nickOnlyMode) {
      var voteBtn = m.querySelector('[data-action="player-modal-vote"]');
      app.syncPlayerModalFoulControl(id);
      var voteGold =
        'w-full py-3 rounded border-2 border-mafia-gold/60 bg-mafia-blood/30 hover:bg-mafia-blood/45 text-mafia-gold font-semibold text-sm uppercase tracking-wider cursor-pointer transition-colors';
      if (voteBtn) {
        voteBtn.disabled = false;
        if (inQueue) {
          voteBtn.textContent = 'Убрать с голосования';
          voteBtn.className = voteGold;
        } else {
          voteBtn.textContent = 'Выставить';
          voteBtn.className = voteGold;
        }
      }
      var elims = m.querySelectorAll('[data-action="player-modal-elim"]');
      var elimOn =
        'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border ring-2 ring-mafia-gold bg-mafia-blood/45 border-mafia-gold text-mafia-gold transition-colors cursor-pointer';
      var elimOff =
        'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border bg-mafia-card text-mafia-cream/80 hover:border-mafia-gold/45 transition-colors cursor-pointer';
      var elimHangDisabled =
        'modal-player-elim-btn w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded border border-mafia-border/45 bg-mafia-card/50 text-mafia-cream/30 opacity-55 cursor-not-allowed';
      for (var ei = 0; ei < elims.length; ei++) {
        var elimBtn = elims[ei];
        var er = elimBtn.getAttribute('data-elim');
        if (er === 'hang' && !inQueue) {
          elimBtn.disabled = true;
          elimBtn.setAttribute('aria-disabled', 'true');
          elimBtn.title = 'Сначала выставьте в очередь голосования';
          elimBtn.className = elimHangDisabled;
          continue;
        }
        elimBtn.disabled = false;
        elimBtn.removeAttribute('aria-disabled');
        elimBtn.className = p.eliminationReason === er ? elimOn : elimOff;
        elimBtn.title = ELIM_REASON_TITLES[er] || '';
      }
    }
    var nickInp = document.getElementById('modal-player-nick');
    if (nickInp) nickInp.value = p.nick != null ? String(p.nick) : '';
    var extras = document.getElementById('modal-player-game-extras');
    if (extras) extras.classList.toggle('hidden', nickOnlyMode);
    if (!nickOnlyMode && gameTableExtrasActive()) populatePlayerExtras(id);
    app.modalSetOpen(m, true);
  };

  /**
   * На ПК (видна левая панель) поля «лучший ход / протокол / мнение / примечание»
   * живут только в модалке итогов из левой панели, а в модалке игрового стола скрыты
   * (lg:hidden) и не читаются/не пишутся. На мобилке левой панели нет — поля здесь.
   */
  function gameTableExtrasActive() {
    var left = document.getElementById('game-side-left');
    if (!left) return true;
    return window.getComputedStyle(left).display === 'none';
  }

  function populatePlayerExtras(id) {
    if (!app.protocolByPlayerId || typeof app.protocolByPlayerId !== 'object')
      app.protocolByPlayerId = {};
    if (!app.opinionByPlayerId || typeof app.opinionByPlayerId !== 'object')
      app.opinionByPlayerId = {};
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object')
      app.bestMoveByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object')
      app.bonusNoteByPlayerId = {};
    var key = String(id);
    var bmWrap = document.getElementById('modal-player-bestmove-wrap');
    var bm = document.getElementById('modal-player-bestmove');
    var showBm = app.showSummaryBestMoveField ? app.showSummaryBestMoveField(id) : true;
    if (bmWrap) bmWrap.style.display = showBm ? 'flex' : 'none';
    if (bm) {
      bm.value = app.normalizeNumberListText
        ? app.normalizeNumberListText(app.bestMoveByPlayerId[key])
        : app.bestMoveByPlayerId[key] || '';
      bm.disabled = !showBm;
    }
    if (app.fillNumGroupFields && app.getPlayerNumGroup) {
      app.fillNumGroupFields(
        'modal-player-protocol-',
        app.getPlayerNumGroup(app.protocolByPlayerId, id)
      );
      app.fillNumGroupFields(
        'modal-player-opinion-',
        app.getPlayerNumGroup(app.opinionByPlayerId, id)
      );
    }
    var noteTa = document.getElementById('modal-player-note');
    if (noteTa)
      noteTa.value =
        app.bonusNoteByPlayerId[key] != null ? String(app.bonusNoteByPlayerId[key]) : '';
  }

  app.syncPlayerExtrasFromModal = function () {
    var m = document.getElementById('modal-player-actions');
    if (!m || m.dataset.mode !== 'game') return;
    if (!gameTableExtrasActive()) return;
    var pid = parseInt(m.dataset.playerId, 10);
    if (isNaN(pid) || !app.savePlayerGameExtras) return;
    app.savePlayerGameExtras('modal-player-', pid);
    app.saveState();
  };
})(window.MafiaApp);
