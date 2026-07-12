/**
 * Ночные действия городской мафии в host-режиме.
 * На мобилке живут на отдельном экране, на lg+ body переносится в правый слот
 * игрового стола — по той же схеме, что и голосование.
 */
(function (app) {
  'use strict';

  var ACTIONS = [
    {
      key: 'mafiaShot',
      label: 'Отстрел мафии',
      short: 'Мафия',
      roles: ['mafia', 'don'],
      icon: 'icon-mafia',
    },
    {
      key: 'donCheck',
      label: 'Проверка дона',
      short: 'Дон',
      roles: ['don'],
      check: 'sheriff',
      icon: 'icon-don',
    },
    {
      key: 'sheriffCheck',
      label: 'Проверка шерифа',
      short: 'Шериф',
      roles: ['sheriff'],
      check: 'mafia',
      icon: 'icon-sheriff',
    },
    {
      key: 'maniacShot',
      label: 'Отстрел маньяка',
      short: 'Маньяк',
      roles: ['maniac'],
      icon: 'icon-maniac',
    },
    {
      key: 'beautyVisit',
      label: 'Поход красотки',
      short: 'Красотка',
      roles: ['beauty'],
      icon: 'icon-beauty',
    },
    {
      key: 'doctorHeal',
      label: 'Поход врача',
      short: 'Доктор',
      roles: ['doctor'],
      icon: 'icon-doctor',
    },
  ];
  app.URBAN_NIGHT_ACTIONS = ACTIONS;

  function actionByKey(key) {
    for (var i = 0; i < ACTIONS.length; i++) if (ACTIONS[i].key === key) return ACTIONS[i];
    return null;
  }

  function dealtEntries() {
    return app.getHostDealtRoles ? app.getHostDealtRoles() : [];
  }

  function hasFullDeal() {
    if (!Array.isArray(app.revealedIndices) || app.revealedIndices.length !== app.players.length)
      return false;
    var entries = dealtEntries();
    return entries.length === app.players.length;
  }

  function roleCodeAtSeat(seatId) {
    var entries = dealtEntries();
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].seatId !== seatId) continue;
      if (entries[i].code) return entries[i].code;
      return app.mapDealRoleToCode ? app.mapDealRoleToCode(entries[i].role) : 'peaceful';
    }
    return 'peaceful';
  }

  function roleHasLivingActor(action) {
    var entries = dealtEntries();
    for (var i = 0; i < entries.length; i++) {
      var p = app.players[entries[i].seatId - 1];
      if (!p || p.eliminationReason) continue;
      var code =
        entries[i].code ||
        (app.mapDealRoleToCode ? app.mapDealRoleToCode(entries[i].role) : 'peaceful');
      if (action.roles.indexOf(code) !== -1) return true;
    }
    return false;
  }

  function nextNightNumber() {
    var count = 0;
    var log = Array.isArray(app.gameLog) ? app.gameLog : [];
    for (var i = 0; i < log.length; i++) if (log[i] && log[i].type === 'urban_night') count++;
    return count + 1;
  }

  function emptyActions() {
    var out = {};
    for (var i = 0; i < ACTIONS.length; i++) out[ACTIONS[i].key] = null;
    return out;
  }

  app.prepareUrbanNightDraft = function () {
    var draft = app.urbanNightDraft;
    if (!draft || typeof draft !== 'object' || !draft.actions) {
      draft = {
        nightNumber: nextNightNumber(),
        activeAction: 'mafiaShot',
        actions: emptyActions(),
      };
      app.urbanNightDraft = draft;
    }
    for (var i = 0; i < ACTIONS.length; i++) {
      var key = ACTIONS[i].key;
      if (!Object.prototype.hasOwnProperty.call(draft.actions, key)) draft.actions[key] = null;
    }
    var active = actionByKey(draft.activeAction);
    if (!active || !roleHasLivingActor(active)) {
      draft.activeAction = null;
      for (var ai = 0; ai < ACTIONS.length; ai++) {
        if (roleHasLivingActor(ACTIONS[ai])) {
          draft.activeAction = ACTIONS[ai].key;
          break;
        }
      }
    }
    if (app.saveState) app.saveState();
    return draft;
  };

  function addUnique(arr, id) {
    if (typeof id !== 'number' || arr.indexOf(id) !== -1) return;
    arr.push(id);
  }

  function removeId(arr, id) {
    var ix = arr.indexOf(id);
    if (ix !== -1) arr.splice(ix, 1);
  }

  /** Чистое разрешение ночи; экспортировано для регрессионных тестов. */
  app.resolveUrbanNightActions = function (actions) {
    actions = actions || {};
    var deaths = [];
    addUnique(deaths, actions.mafiaShot);
    addUnique(deaths, actions.maniacShot);
    var originalShots = deaths.slice();
    var beautySeatsShot = [];
    for (var i = 0; i < originalShots.length; i++) {
      if (roleCodeAtSeat(originalShots[i]) === 'beauty')
        addUnique(beautySeatsShot, originalShots[i]);
    }
    var savedByBeauty = null;
    if (typeof actions.beautyVisit === 'number') {
      if (beautySeatsShot.length) {
        addUnique(deaths, actions.beautyVisit);
      } else if (deaths.indexOf(actions.beautyVisit) !== -1) {
        removeId(deaths, actions.beautyVisit);
        savedByBeauty = actions.beautyVisit;
      }
    }
    var healed = null;
    if (typeof actions.doctorHeal === 'number' && deaths.indexOf(actions.doctorHeal) !== -1) {
      removeId(deaths, actions.doctorHeal);
      healed = actions.doctorHeal;
    }
    deaths.sort(function (a, b) {
      return a - b;
    });
    return {
      deaths: deaths,
      shots: originalShots,
      beautySeatsShot: beautySeatsShot,
      savedByBeauty: savedByBeauty,
      healed: healed,
      donFoundSheriff:
        typeof actions.donCheck === 'number' && roleCodeAtSeat(actions.donCheck) === 'sheriff',
      sheriffFoundMafia:
        typeof actions.sheriffCheck === 'number' &&
        ['mafia', 'don'].indexOf(roleCodeAtSeat(actions.sheriffCheck)) !== -1,
    };
  };

  function isPcWideLayout() {
    var left = document.getElementById('game-side-left');
    return !!(left && window.getComputedStyle(left).display !== 'none');
  }

  app.goToUrbanNightActions = function () {
    if (!app.prepareConfig || app.prepareConfig.variant !== 'urban') return;
    if (!hasFullDeal()) {
      if (app.showToast) app.showToast('Сначала раздайте все роли');
      return;
    }
    app.prepareUrbanNightDraft();
    if (isPcWideLayout()) app.enterPcUrbanNightActions();
    else app.navigateToScreen('urban-night-screen');
  };

  app.enterPcUrbanNightActions = function () {
    var gs = document.getElementById('game-screen');
    var slot = document.getElementById('game-night-slot');
    var body = document.getElementById('urban-night-body');
    if (!gs || !slot || !body) {
      app.navigateToScreen('urban-night-screen');
      return;
    }
    if (app.exitPcVoting) app.exitPcVoting();
    app._pcUrbanNightActive = true;
    gs.classList.add('game-night-actions');
    slot.appendChild(body);
    app.renderUrbanNightActions();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (app._pcUrbanNightActive) slot.classList.add('night-slot-open');
      });
    });
  };

  app.exitPcUrbanNightActions = function () {
    if (!app._pcUrbanNightActive) return;
    if (app.hideUrbanNightTargetModal) app.hideUrbanNightTargetModal();
    app._pcUrbanNightActive = false;
    var gs = document.getElementById('game-screen');
    var slot = document.getElementById('game-night-slot');
    if (slot) slot.classList.remove('night-slot-open');
    if (gs) gs.classList.remove('game-night-actions');
    var body = document.getElementById('urban-night-body');
    var screen = document.getElementById('urban-night-screen');
    if (body && screen && body.parentNode !== screen) screen.appendChild(body);
  };

  app.closeUrbanNightActions = function () {
    if (app.hideUrbanNightTargetModal) app.hideUrbanNightTargetModal();
    if (app._pcUrbanNightActive) {
      app.exitPcUrbanNightActions();
      return;
    }
    app.navigateToScreen('game-screen');
  };

  function targetRoleResult(action, seatId) {
    var code = roleCodeAtSeat(seatId);
    if (action.check === 'sheriff') {
      return code === 'sheriff' ? 'Шериф' : 'Не шериф';
    }
    if (action.check === 'mafia') {
      return code === 'mafia' || code === 'don' ? 'Мафия' : 'Не мафия';
    }
    return '';
  }

  function assignmentText(action, target) {
    if (typeof target !== 'number') return 'Действие не задано';
    var text = '№' + target;
    if (action.check) text += ' · ' + targetRoleResult(action, target).toLowerCase();
    return text;
  }

  function roleTileIconClass(action) {
    if (action.key === 'maniacShot') {
      return 'role-badge--maniac urban-night-role-tile__icon';
    }
    if (action.key === 'mafiaShot' || action.key === 'donCheck') {
      return 'urban-night-role-tile__icon urban-night-role-tile__icon--black';
    }
    return 'urban-night-role-tile__icon urban-night-role-tile__icon--red';
  }

  app.renderUrbanNightActions = function () {
    var draft = app.prepareUrbanNightDraft();
    var number = document.getElementById('urban-night-number');
    var actionsWrap = document.getElementById('urban-night-actions');
    if (!actionsWrap) return;
    if (number) number.textContent = 'Ночь ' + draft.nightNumber;
    actionsWrap.innerHTML = '';
    for (var i = 0; i < ACTIONS.length; i++) {
      var action = ACTIONS[i];
      var enabled = roleHasLivingActor(action);
      var target = draft.actions[action.key];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-action', 'urban-night-open-target');
      btn.setAttribute('data-night-action', action.key);
      btn.disabled = !enabled;
      btn.className =
        'urban-night-role-tile' +
        (typeof target === 'number' ? ' is-complete' : '') +
        (enabled ? '' : ' is-disabled');
      btn.setAttribute(
        'aria-label',
        action.label +
          '. ' +
          (enabled ? assignmentText(action, target) : 'Роль выбыла или не участвует')
      );
      var icon = document.createElement('span');
      icon.className = roleTileIconClass(action);
      icon.innerHTML =
        '<svg class="h-7 w-7 pointer-events-none" aria-hidden="true"><use href="#' +
        action.icon +
        '"/></svg>';
      var label = document.createElement('span');
      label.className = 'urban-night-role-tile__role';
      label.textContent = action.short;
      var actionLabel = document.createElement('span');
      actionLabel.className = 'urban-night-role-tile__action';
      actionLabel.textContent = action.label;
      var value = document.createElement('span');
      value.className =
        'urban-night-role-tile__target' +
        (action.check && typeof target === 'number'
          ? targetRoleResult(action, target).indexOf('Не ') === 0
            ? ' is-negative'
            : ' is-positive'
          : '');
      value.textContent = enabled ? assignmentText(action, target) : 'Нет действия';
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.appendChild(actionLabel);
      btn.appendChild(value);
      actionsWrap.appendChild(btn);
    }
  };

  function renderUrbanNightTargetModal(action, draft) {
    var title = document.getElementById('modal-urban-night-target-title');
    var sub = document.getElementById('modal-urban-night-target-sub');
    var grid = document.getElementById('modal-urban-night-target-grid');
    if (!grid) return;
    if (title) title.textContent = action.label;
    if (sub) sub.textContent = 'Выберите игрока, на которого назначено действие';
    grid.innerHTML = '';
    var picked = draft.actions[action.key];
    for (var pi = 0; pi < app.players.length; pi++) {
      var p = app.players[pi];
      if (p.eliminationReason) continue;
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-selected', picked === p.id ? 'true' : 'false');
      tile.setAttribute('data-action', 'urban-night-target-pick');
      tile.setAttribute('data-player-id', String(p.id));
      tile.className = 'urban-night-target' + (picked === p.id ? ' is-selected' : '');
      var num = document.createElement('span');
      num.className = 'urban-night-target__number';
      num.textContent = String(p.id);
      var nick = document.createElement('span');
      nick.className = 'urban-night-target__nick';
      nick.textContent = p.nick && String(p.nick).trim() ? String(p.nick).trim() : 'Игрок №' + p.id;
      tile.appendChild(num);
      tile.appendChild(nick);
      grid.appendChild(tile);
    }
  }

  app.showUrbanNightTargetModal = function (key) {
    var action = actionByKey(key);
    if (!action || !roleHasLivingActor(action)) return;
    var draft = app.prepareUrbanNightDraft();
    draft.activeAction = key;
    app.saveState();
    renderUrbanNightTargetModal(action, draft);
    var modal = document.getElementById('modal-urban-night-target');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  app.hideUrbanNightTargetModal = function () {
    var modal = document.getElementById('modal-urban-night-target');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, false);
  };

  app.pickUrbanNightTarget = function (seatId) {
    var p = app.players[seatId - 1];
    var draft = app.prepareUrbanNightDraft();
    if (!p || p.eliminationReason || !actionByKey(draft.activeAction)) return;
    draft.actions[draft.activeAction] = seatId;
    app.saveState();
    app.hideUrbanNightTargetModal();
    app.renderUrbanNightActions();
  };

  app.skipUrbanNightAction = function () {
    var draft = app.prepareUrbanNightDraft();
    if (!draft.activeAction) return;
    draft.actions[draft.activeAction] = null;
    app.saveState();
    app.hideUrbanNightTargetModal();
    app.renderUrbanNightActions();
  };

  app.finishUrbanNight = function () {
    var draft = app.prepareUrbanNightDraft();
    var result = app.resolveUrbanNightActions(draft.actions);
    var ts = Date.now();
    app.gameLog.push({
      type: 'urban_night',
      ts: ts,
      nightNumber: draft.nightNumber,
      actions: Object.assign({}, draft.actions),
      result: result,
    });
    for (var i = 0; i < result.deaths.length; i++) {
      var id = result.deaths[i];
      var p = app.players[id - 1];
      if (!p || p.eliminationReason) continue;
      p.eliminationReason = 'shot';
      app.gameLog.push({
        type: 'elimination',
        ts: ts + i + 1,
        playerId: id,
        reason: 'shot',
        source: 'urban_night',
        nightNumber: draft.nightNumber,
      });
    }
    app.nomineeQueue = app.nomineeQueue.filter(function (id) {
      return result.deaths.indexOf(id) === -1;
    });
    app.urbanNightDraft = null;
    app.saveState();
    app.refreshNomineeQueueUi();
    app.renderPlayers();
    var message = result.deaths.length
      ? 'Ночь завершена. Погибли: ' +
        result.deaths
          .map(function (id) {
            return '№' + id;
          })
          .join(', ')
      : 'Ночь завершена. Никто не погиб';
    app.closeUrbanNightActions();
    if (app.showToast) app.showToast(message);
  };

  app.registerScreenRenderer('urban-night-screen', function () {
    app.prepareUrbanNightDraft();
    app.renderUrbanNightActions();
  });
})(window.MafiaApp);
