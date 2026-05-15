/**
 * Донская — 1 Дон + 9 «Без роли». После раздачи карт ведущий вручную выбирает
 * двойку чёрных (по указанию Дона), затем шериф разыгрывается случайно среди
 * оставшихся семи, остальные становятся мирными.
 *
 * Реализована для host-режима. Для auto-режима поддержки пока нет (hostOnly).
 */
(function (app) {
  'use strict';

  var POOL = ['peaceful', 'peaceful', 'peaceful', 'peaceful', 'peaceful', 'peaceful', 'sheriff', 'mafia', 'mafia', 'don'];
  var BLANK_ROLE = 'Без роли';

  app.registerVariant({
    key: 'donskaya',
    label: 'Донская',
    rolePool: POOL,
    dealRoles: function () { return app.shuffleVariantPool(POOL); },
    firstNightKillsKasper: false,
    firstNightSheriffRandom: false,
    introWakesMerlin: false,
    bestMoveOnFirstKill: true,
    postGameMerlinGuess: false,
    manualRoles: ['peaceful', 'mafia', 'don', 'sheriff'],
    hostOnly: true,
    hostDeck: ['Дон', BLANK_ROLE, BLANK_ROLE, BLANK_ROLE, BLANK_ROLE, BLANK_ROLE, BLANK_ROLE, BLANK_ROLE, BLANK_ROLE, BLANK_ROLE],
  });

  app.DONSKAYA_BLANK_ROLE = BLANK_ROLE;

  // Назначает мафию по выбранным посадочным номерам и разыгрывает шерифа.
  // Возвращает { mafiaSeats, sheriffSeat, peacefulSeats } для UI-фидбэка.
  // Ничего не сохраняет — saveState вызывает caller.
  app.donskayaAssignRoles = function (mafiaSeatIds) {
    if (!Array.isArray(mafiaSeatIds) || mafiaSeatIds.length !== 2) return null;
    if (mafiaSeatIds[0] === mafiaSeatIds[1]) return null;
    if (!Array.isArray(app.revealedIndices) || !Array.isArray(app.roles)) return null;

    var seatToDeckIdx = {};
    var donSeat = null;
    for (var j = 0; j < app.revealedIndices.length; j++) {
      var deckIdx = app.revealedIndices[j];
      if (deckIdx == null) continue;
      var seatId = j + 1;
      seatToDeckIdx[seatId] = deckIdx;
      if (app.roles[deckIdx] === 'Дон') donSeat = seatId;
    }
    if (donSeat === null) return null;
    for (var k = 0; k < mafiaSeatIds.length; k++) {
      if (mafiaSeatIds[k] === donSeat) return null;
      if (seatToDeckIdx[mafiaSeatIds[k]] == null) return null;
    }

    mafiaSeatIds.forEach(function (sid) { app.roles[seatToDeckIdx[sid]] = 'Мафия'; });

    var remainingSeats = [];
    Object.keys(seatToDeckIdx).forEach(function (sid) {
      var n = parseInt(sid, 10);
      if (n === donSeat) return;
      if (mafiaSeatIds.indexOf(n) !== -1) return;
      remainingSeats.push(n);
    });
    if (!remainingSeats.length) return null;

    var sheriffSeat = remainingSeats[Math.floor(Math.random() * remainingSeats.length)];
    app.roles[seatToDeckIdx[sheriffSeat]] = 'Шериф';

    var peacefulSeats = [];
    remainingSeats.forEach(function (sid) {
      if (sid === sheriffSeat) return;
      app.roles[seatToDeckIdx[sid]] = 'Мирный';
      peacefulSeats.push(sid);
    });

    return {
      donSeat: donSeat,
      mafiaSeats: mafiaSeatIds.slice().sort(function (a, b) { return a - b; }),
      sheriffSeat: sheriffSeat,
      peacefulSeats: peacefulSeats.sort(function (a, b) { return a - b; }),
    };
  };

  // Возвращает посадочный номер Дона по раздаче (или null, если не выдан).
  app.donskayaGetDonSeat = function () {
    if (!Array.isArray(app.revealedIndices) || !Array.isArray(app.roles)) return null;
    for (var j = 0; j < app.revealedIndices.length; j++) {
      var di = app.revealedIndices[j];
      if (di == null) continue;
      if (app.roles[di] === 'Дон') return j + 1;
    }
    return null;
  };

  // Все семь карт раздались? То есть Дон есть, остальные — «Без роли».
  app.donskayaIsAwaitingAssignment = function () {
    if (!Array.isArray(app.roles)) return false;
    var hasDon = false;
    var hasBlank = false;
    for (var i = 0; i < app.roles.length; i++) {
      if (app.roles[i] === 'Дон') hasDon = true;
      else if (app.roles[i] === BLANK_ROLE) hasBlank = true;
      else return false;
    }
    return hasDon && hasBlank;
  };

  // Зовётся после каждого изменения roles-override на prepare-screen.
  // Если ведущий пометил двух мафией — фиксирует расклад через donskayaAssignRoles,
  // снимает временные оверрайды (deck становится источником истины). До этого момента
  // ничего не делает.
  app.donskayaReconcile = function () {
    if (!app.prepareConfig || app.prepareConfig.variant !== 'donskaya') return;
    if (!app.donskayaIsAwaitingAssignment()) return;
    if (!Array.isArray(app.revealedIndices) || app.revealedIndices.length !== app.roles.length) return;

    var donSeat = null;
    for (var j = 0; j < app.revealedIndices.length; j++) {
      var di = app.revealedIndices[j];
      if (di == null) continue;
      if (app.roles[di] === 'Дон') { donSeat = j + 1; break; }
    }
    if (donSeat === null) return;

    var overrides = app.summaryRoleByPlayerId || {};
    var mafiaSeats = [];
    Object.keys(overrides).forEach(function (pid) {
      if (overrides[pid] !== 'mafia') return;
      var sid = parseInt(pid, 10);
      if (isNaN(sid) || sid === donSeat) return;
      mafiaSeats.push(sid);
    });
    if (mafiaSeats.length !== 2) return;

    var result = app.donskayaAssignRoles(mafiaSeats);
    if (!result) return;

    // Колода теперь содержит реальные роли — все временные оверрайды снимаем,
    // включая «peaceful» от снятых пометок (иначе бы перебили рандомный шериф).
    Object.keys(overrides).forEach(function (pid) { delete overrides[pid]; });
    if (app.saveState) app.saveState();
  };
})(window.MafiaApp);
