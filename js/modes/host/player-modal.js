/**
 * Хост-режим — модалка игрока (modal-player-actions): псевдоним, фол,
 * выставление, статусы выбытия; в режиме подготовки — выбор роли;
 * на мобилке — поля «лучший ход / протокол / мнение / примечание».
 */
(function (app) {
  'use strict';

  var ELIM_REASON_TITLES = app.ELIM_REASON_TITLES;

  function modalAdapter(modal) {
    if (!app.playerTable || !modal) return null;
    return app.playerTable.getAdapter(modal.dataset.tableMode || 'host');
  }

  app.getOpenPlayerTableMode = function () {
    var modal = document.getElementById('modal-player-actions');
    return modal ? modal.dataset.tableMode || 'host' : 'host';
  };

  app.syncPlayerModalFoulControl = function (id) {
    var modal = document.getElementById('modal-player-actions');
    var adapter = modalAdapter(modal);
    var player = adapter && adapter.getPlayer ? adapter.getPlayer(id) : null;
    if (!modal || !player) return;
    var count = document.getElementById('modal-player-foul-count');
    var minus = modal.querySelector('[data-action="player-modal-foul-minus"]');
    var plus = modal.querySelector('[data-action="player-modal-foul-plus"]');
    var foulLimit = app.getFoulLimit ? app.getFoulLimit() : 4;
    if (count) count.textContent = (player.fouls || 0) + ' / ' + foulLimit;
    if (minus) minus.disabled = !!player.eliminationReason || !player.fouls;
    if (plus) plus.disabled = !!player.eliminationReason || player.fouls >= foulLimit;
  };

  app.syncPlayerNickFromModal = function () {
    var m = document.getElementById('modal-player-actions');
    var inp = document.getElementById('modal-player-nick');
    if (!m || !inp) return;
    var pidStr = m.dataset.playerId;
    if (pidStr === undefined || pidStr === '') return;
    var pid = parseInt(pidStr, 10);
    if (isNaN(pid)) return;
    var adapter = modalAdapter(m);
    if (adapter && adapter.updateNick) adapter.updateNick(pid, inp.value);
  };

  app.hidePlayerActionsModal = function () {
    var m = document.getElementById('modal-player-actions');
    var wasOpen = m && m.hasAttribute('data-open');
    var tableMode = m ? m.dataset.tableMode || 'host' : 'host';
    var context = m ? m.dataset.mode || 'game' : 'game';
    if (wasOpen) {
      app.syncPlayerNickFromModal();
      if (tableMode === 'host') app.syncPlayerExtrasFromModal();
    }
    if (m) app.modalSetOpen(m, false);
    if (wasOpen) {
      var adapter = app.playerTable ? app.playerTable.getAdapter(tableMode) : null;
      if (context === 'prepare' && app.renderPreparePlayers) {
        app.renderPreparePlayers();
      } else if (adapter && adapter.render) {
        adapter.render();
      }
    }
  };

  app.showPlayerActionsModal = function (id, requestedMode) {
    var m = document.getElementById('modal-player-actions');
    if (!m) return;
    var gameScreen = document.getElementById('game-screen');
    var prepareScreen = document.getElementById('prepare-screen');
    var inGameScreen = !!(gameScreen && gameScreen.classList.contains('active'));
    var inPrepareScreen = !!(prepareScreen && prepareScreen.classList.contains('active'));
    var nickOnlyMode = inPrepareScreen && !inGameScreen;
    var tableMode = nickOnlyMode ? 'host' : requestedMode || 'host';
    var adapter = app.playerTable ? app.playerTable.getAdapter(tableMode) : null;
    var p = adapter && adapter.getPlayer ? adapter.getPlayer(id) : null;
    if (!p || (adapter.isUnavailable && adapter.isUnavailable(p))) return;
    var title = document.getElementById('modal-player-actions-title');
    var whenActive = document.getElementById('modal-player-actions-when-active');
    var whenOut = document.getElementById('modal-player-actions-when-out');
    if (title) title.textContent = 'Игрок №' + id;
    var inQueue = adapter.isNominated ? adapter.isNominated(id) : false;
    var out = adapter.isOut ? adapter.isOut(p) : !!p.eliminationReason;
    m.dataset.mode = nickOnlyMode ? 'prepare' : 'game';
    m.dataset.tableMode = tableMode;
    // playerId должен быть установлен до renderPrepareModalRoleRadios — рендер опирается
    // на m.dataset.playerId, чтобы спросить manualRolesForCurrentPrepare(playerId).
    m.dataset.playerId = String(id);
    var prepRoleSection = document.getElementById('modal-player-prepare-role-section');
    if (prepRoleSection) prepRoleSection.classList.toggle('hidden', !nickOnlyMode);
    if (app.getEffectiveSummaryRoleCode) {
      var seatIndex = tableMode === 'host' ? app.players.indexOf(p) : -1;
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
        if (adapter.canEliminate && !adapter.canEliminate(id, er)) {
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
    var showHostExtras = tableMode === 'host' && !nickOnlyMode;
    if (extras) extras.classList.toggle('hidden', !showHostExtras);
    if (showHostExtras && gameTableExtrasActive()) populatePlayerExtras(id);
    app.modalSetOpen(m, true);
  };

  // Совместимые имена для старых auto-вызовов. Открывается та же модалка,
  // команды внутри маршрутизируются через auto-адаптер playerTable.
  app.showAutoPlayerActionsModal = function (id) {
    app.showPlayerActionsModal(id, 'auto');
  };
  app.hideAutoPlayerActionsModal = app.hidePlayerActionsModal;
  app.syncAutoPlayerModalFoulControl = app.syncPlayerModalFoulControl;

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
    var showBm = app.showSummaryBestMoveField ? app.showSummaryBestMoveField(id) : true;
    if (bmWrap) bmWrap.style.display = showBm ? 'flex' : 'none';
    if (app.syncBestMoveField)
      app.syncBestMoveField('modal-player-bestmove', app.bestMoveByPlayerId[key], showBm);
    var protocolSection = document.getElementById('modal-player-protocol-section');
    if (protocolSection)
      protocolSection.style.display = app.playerProtocolVisible === false ? 'none' : 'flex';
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
    if (!m || m.dataset.mode !== 'game' || (m.dataset.tableMode || 'host') !== 'host') return;
    if (!gameTableExtrasActive()) return;
    var pid = parseInt(m.dataset.playerId, 10);
    if (isNaN(pid) || !app.savePlayerGameExtras) return;
    app.savePlayerGameExtras('modal-player-', pid);
    app.saveState();
  };
})(window.MafiaApp);
