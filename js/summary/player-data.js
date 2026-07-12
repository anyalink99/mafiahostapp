/**
 * Итоги — данные игроков: роль из раздачи карт и оверрайды, «лучший ход»,
 * допы (бонусные баллы), группы «шериф/мафия/мирный» (протокол, мнение)
 * и сохранение этих полей из модалок (общих для итогов и игрового стола).
 */
(function (app) {
  'use strict';

  var parseBonusFloat = app.parseBonusFloat;

  app.rolesFromDealForSeats = function () {
    if (!app.revealedIndices || app.revealedIndices.length !== app.players.length) return null;
    var n = app.players.length;
    var out = [];
    for (var j = 0; j < n; j++) {
      var ri = app.revealedIndices[j];
      if (ri === undefined || ri === null || !app.roles[ri]) return null;
      out[j] = app.roles[ri];
    }
    return out;
  };

  app.hasFullCardDeal = function () {
    return app.rolesFromDealForSeats() !== null;
  };

  app.getPlayerRoleOverrideKey = function (playerId) {
    return String(playerId);
  };

  app.setPlayerSpecialOverride = function (playerId, value) {
    var key = app.getPlayerRoleOverrideKey(playerId);
    if (!app.playerRoleOverrides || typeof app.playerRoleOverrides !== 'object')
      app.playerRoleOverrides = {};
    if (value === 'don' || value === 'sheriff') {
      for (var k in app.playerRoleOverrides) {
        if (
          Object.prototype.hasOwnProperty.call(app.playerRoleOverrides, k) &&
          app.playerRoleOverrides[k] === value
        ) {
          delete app.playerRoleOverrides[k];
        }
      }
      app.playerRoleOverrides[key] = value;
    } else {
      delete app.playerRoleOverrides[key];
    }
    app.saveState();
  };

  app.summaryWinnerChosen = function () {
    return app.winningTeam === 'mafia' || app.winningTeam === 'peaceful';
  };

  app.mapDealRoleToCode = function (r) {
    if (!r) return 'peaceful';
    if (r === 'Шериф') return 'sheriff';
    if (r === 'Дон') return 'don';
    if (r === 'Мафия') return 'mafia';
    if (r === 'Мерлин') return 'merlin';
    if (r === 'Маньяк') return 'maniac';
    if (r === 'Доктор') return 'doctor';
    if (r === 'Красотка') return 'beauty';
    return 'peaceful';
  };

  app.getEffectiveSummaryRoleCode = function (playerId, seatIndex) {
    var sid = String(playerId);
    if (app.summaryRoleByPlayerId && app.summaryRoleByPlayerId[sid]) {
      return app.summaryRoleByPlayerId[sid];
    }
    var deal = app.rolesFromDealForSeats();
    if (deal && deal[seatIndex] != null) {
      return app.mapDealRoleToCode(deal[seatIndex]);
    }
    return 'peaceful';
  };

  app.getFirstShotPlayerIdFromLog = function () {
    if (!Array.isArray(app.gameLog)) return null;
    var sorted = app.gameLog.slice().sort(function (a, b) {
      var ta = typeof a.ts === 'number' ? a.ts : 0;
      var tb = typeof b.ts === 'number' ? b.ts : 0;
      return ta - tb;
    });
    for (var i = 0; i < sorted.length; i++) {
      var ev = sorted[i];
      if (
        ev &&
        ev.type === 'elimination' &&
        ev.reason === 'shot' &&
        typeof ev.playerId === 'number'
      ) {
        return ev.playerId;
      }
    }
    return null;
  };

  app.formatBestMoveForExport = function (stored) {
    if (!app.isBestMoveTripleComplete(stored)) return '';
    var tr = app.parseBestMoveTriple(stored);
    return tr[0] + ', ' + tr[1] + ', ' + tr[2];
  };

  app.formatBonusForDisplay = function (raw) {
    var v = parseBonusFloat(raw);
    if (v % 1 === 0) return String(Math.round(v));
    return String(v).replace('.', ',');
  };

  app.parseBestMoveTriple = function (stored) {
    if (stored === undefined || stored === null) return ['', '', ''];
    var s = String(stored).trim();
    if (!s) return ['', '', ''];
    var parts = s.split(/[\s,;]+/).filter(function (x) {
      return x !== '';
    });
    if (parts.length >= 3) {
      return [parts[0], parts[1], parts[2]];
    }
    if (/^\d{3}$/.test(s)) {
      return [s[0], s[1], s[2]];
    }
    return ['', '', ''];
  };

  app.isBestMoveTripleComplete = function (stored) {
    var p = app.parseBestMoveTriple(stored);
    for (var i = 0; i < 3; i++) {
      var n = parseInt(String(p[i]).trim(), 10);
      if (isNaN(n) || n < 1 || n > app.players.length) return false;
    }
    return true;
  };

  app.countCompleteBestMoves = function () {
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object') return 0;
    var c = 0;
    for (var k in app.bestMoveByPlayerId) {
      if (!Object.prototype.hasOwnProperty.call(app.bestMoveByPlayerId, k)) continue;
      if (app.isBestMoveTripleComplete(app.bestMoveByPlayerId[k])) c++;
    }
    return c;
  };

  app.showSummaryBestMoveField = function (playerId) {
    // Лучший ход — только у первого убитого. Пока никого не убили — поле скрыто у всех.
    var firstShot = app.getFirstShotPlayerIdFromLog();
    if (firstShot == null) return false;
    return playerId === firstShot;
  };

  app.serializeBestMoveTriple = function (a, b, c) {
    var x = String(a != null ? a : '').trim();
    var y = String(b != null ? b : '').trim();
    var z = String(c != null ? c : '').trim();
    if (!x && !y && !z) return '';
    return [x, y, z].join(',');
  };

  /** Раскладывает группу {sheriff,mafia,peaceful} по трём полям ввода с общим префиксом id. */
  app.fillNumGroupFields = function (idPrefix, group) {
    var keys = ['sheriff', 'mafia', 'peaceful'];
    for (var i = 0; i < keys.length; i++) {
      var el = document.getElementById(idPrefix + keys[i]);
      if (el) el.value = app.normalizeNumberListText(group[keys[i]]);
    }
  };

  /** Собирает группу {sheriff,mafia,peaceful} из трёх полей ввода с общим префиксом id. */
  app.readNumGroupFields = function (idPrefix) {
    var keys = ['sheriff', 'mafia', 'peaceful'];
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      var el = document.getElementById(idPrefix + keys[i]);
      out[keys[i]] = el ? el.value : '';
    }
    return out;
  };

  app.applySummaryBonusDelta = function (delta) {
    var inp = document.getElementById('modal-summary-bonus');
    if (!inp || inp.disabled) return;
    var v = parseBonusFloat(inp.value) + delta;
    v = Math.round(v * 10) / 10;
    inp.value = v % 1 === 0 ? String(Math.round(v)) : String(v).replace('.', ',');
  };

  /**
   * Сохраняет общие игровые данные игрока (лучший ход, протокол, мнение, примечание)
   * из полей модалки с заданным префиксом id. Используется и модалкой итогов
   * (`modal-summary-`), и модалкой игрового стола (`modal-player-`) — данные общие.
   */
  app.savePlayerGameExtras = function (idPrefix, pid) {
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object')
      app.bestMoveByPlayerId = {};
    if (!app.protocolByPlayerId || typeof app.protocolByPlayerId !== 'object')
      app.protocolByPlayerId = {};
    if (!app.opinionByPlayerId || typeof app.opinionByPlayerId !== 'object')
      app.opinionByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object')
      app.bonusNoteByPlayerId = {};
    var key = String(pid);
    var bm = document.getElementById(idPrefix + 'bestmove');
    if (bm && app.showSummaryBestMoveField(pid)) {
      app.bestMoveByPlayerId[key] = app.normalizeNumberListText(bm.value);
    }
    app.setPlayerNumGroup(
      app.protocolByPlayerId,
      pid,
      app.readNumGroupFields(idPrefix + 'protocol-')
    );
    app.setPlayerNumGroup(
      app.opinionByPlayerId,
      pid,
      app.readNumGroupFields(idPrefix + 'opinion-')
    );
    var noteTa = document.getElementById(idPrefix + 'note');
    if (noteTa) app.bonusNoteByPlayerId[key] = noteTa.value;
  };
})(window.MafiaApp);
