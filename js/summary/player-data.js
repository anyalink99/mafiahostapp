/**
 * Итоги — данные игроков: роль из раздачи карт и оверрайды, «лучший ход»,
 * допы (бонусные баллы), группы «шериф/мафия/мирный» (протокол)
 * и сохранение этих полей из модалок (общих для итогов и игрового стола).
 */
(function (app) {
  'use strict';

  var parseBonusFloat = app.parseBonusFloat;
  var PLAYER_BEST_MOVE_VISIBLE_KEY = 'mafia_player_best_move_visible';
  var FOUL_LIMIT_KEY = 'mafia_player_foul_limit';

  function readBooleanPreference(key, fallback) {
    try {
      var stored = app.settingsRepository.getString(key, null);
      if (stored === null) return fallback;
      return stored !== '0';
    } catch (e) {
      return fallback;
    }
  }

  function clampFoulLimit(value) {
    var parsed = parseInt(value, 10);
    if (isNaN(parsed)) parsed = 4;
    return Math.max(1, Math.min(10, parsed));
  }

  app.playerBestMoveVisible = readBooleanPreference(PLAYER_BEST_MOVE_VISIBLE_KEY, true);
  try {
    app.playerFoulLimit = clampFoulLimit(app.settingsRepository.getNumber(FOUL_LIMIT_KEY, 4));
  } catch (e) {
    app.playerFoulLimit = 4;
  }

  app.getFoulLimit = function () {
    app.playerFoulLimit = clampFoulLimit(app.playerFoulLimit);
    return app.playerFoulLimit;
  };

  app.syncPlayerCardSettings = function () {
    var scoring = document.getElementById('setting-scoring-system');
    var bestMove = document.getElementById('setting-player-bestmove-visible');
    var foulLimit = document.getElementById('setting-player-foul-limit');
    if (scoring) scoring.value = app.getScoringProfile().id;
    if (bestMove) bestMove.checked = app.playerBestMoveVisible !== false;
    if (foulLimit) foulLimit.value = String(app.getFoulLimit());
  };

  app.setPlayerBestMoveVisible = function (visible) {
    app.playerBestMoveVisible = !!visible;
    try {
      app.settingsRepository.setBoolean(PLAYER_BEST_MOVE_VISIBLE_KEY, app.playerBestMoveVisible);
    } catch (e) {}
    app.syncPlayerCardSettings();
  };

  app.setPlayerFoulLimit = function (value) {
    app.playerFoulLimit = clampFoulLimit(value);
    try {
      app.settingsRepository.setNumber(FOUL_LIMIT_KEY, app.playerFoulLimit);
    } catch (e) {}
    app.syncPlayerCardSettings();
    return app.playerFoulLimit;
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

  function isNonRedRole(role) {
    var code = app.mapDealRoleToCode ? app.mapDealRoleToCode(role) : role;
    return code === 'mafia' || code === 'don' || code === 'maniac';
  }

  function countNonRedRoles(roles) {
    if (!Array.isArray(roles)) return 0;
    var count = 0;
    for (var i = 0; i < roles.length; i++) {
      if (isNonRedRole(roles[i])) count++;
    }
    return count;
  }

  app.getBestMoveNumberCount = function () {
    if (
      app.prepareConfig &&
      app.prepareConfig.mode === 'auto' &&
      app.autoState &&
      Array.isArray(app.autoState.seats)
    ) {
      var autoCount = countNonRedRoles(
        app.autoState.seats.map(function (seat) {
          return seat && seat.role;
        })
      );
      if (autoCount > 0) return autoCount;
    }

    var dealt = app.rolesFromDealForSeats();
    var dealtCount = countNonRedRoles(dealt);
    if (dealtCount > 0) return dealtCount;

    if (
      app.prepareConfig &&
      app.prepareConfig.variant === 'urban' &&
      app.prepareConfig.roleCounts
    ) {
      var counts = app.prepareConfig.roleCounts;
      var urbanCount =
        (parseInt(counts.mafia, 10) || 0) +
        (parseInt(counts.don, 10) || 0) +
        (parseInt(counts.maniac, 10) || 0);
      if (urbanCount > 0) return urbanCount;
    }

    var deckCount = countNonRedRoles(app.roles);
    return deckCount > 0 ? deckCount : 3;
  };

  app.parseBestMoveNumbers = function (stored) {
    if (stored === undefined || stored === null) return [];
    var value = String(stored).trim();
    if (!value) return [];
    // Старый стандартный формат мог хранить «379» без разделителей.
    if (/^\d{3}$/.test(value)) return value.split('');
    return value.split(/[\s,;]+/).filter(function (part) {
      return part !== '';
    });
  };

  function validBestMoveNumbers(parts, expectedCount) {
    if (parts.length !== expectedCount) return false;
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var number = Number(String(parts[i]).trim());
      if (!Number.isInteger(number) || number < 1 || number > app.players.length || seen[number])
        return false;
      seen[number] = true;
    }
    return true;
  }

  app.isBestMoveComplete = function (stored) {
    return validBestMoveNumbers(app.parseBestMoveNumbers(stored), app.getBestMoveNumberCount());
  };

  app.formatBestMoveForExport = function (stored) {
    if (!app.isBestMoveComplete(stored)) return '';
    return app.parseBestMoveNumbers(stored).join(', ');
  };

  app.formatBonusForDisplay = function (raw) {
    var v = parseBonusFloat(raw);
    if (v % 1 === 0) return String(Math.round(v));
    return String(v).replace('.', ',');
  };

  app.parseBestMoveTriple = function (stored) {
    var parts = app.parseBestMoveNumbers(stored);
    if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
    return ['', '', ''];
  };

  app.isBestMoveTripleComplete = function (stored) {
    return validBestMoveNumbers(app.parseBestMoveNumbers(stored), 3);
  };

  app.countCompleteBestMoves = function () {
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object') return 0;
    var c = 0;
    for (var k in app.bestMoveByPlayerId) {
      if (!Object.prototype.hasOwnProperty.call(app.bestMoveByPlayerId, k)) continue;
      if (app.isBestMoveComplete(app.bestMoveByPlayerId[k])) c++;
    }
    return c;
  };

  app.showSummaryBestMoveField = function (playerId) {
    if (app.playerBestMoveVisible === false) return false;
    // Лучший ход — только у первого убитого. Пока никого не убили — поле скрыто у всех.
    var firstShot = app.getFirstShotPlayerIdFromLog();
    if (firstShot == null) return false;
    return playerId === firstShot;
  };

  app.serializeBestMoveTriple = function (a, b, c) {
    return app.serializeBestMoveNumbers([a, b, c]);
  };

  app.serializeBestMoveNumbers = function (numbers) {
    if (!Array.isArray(numbers)) return '';
    var normalized = numbers.map(function (number) {
      return String(number != null ? number : '').trim();
    });
    var hasValue = normalized.some(function (number) {
      return number !== '';
    });
    return hasValue ? normalized.join(',') : '';
  };

  function bestMovePlaceholder(count) {
    var n = Math.abs(count) % 100;
    var last = n % 10;
    var word = 'номеров';
    if (n < 11 || n > 19) {
      if (last === 1) word = 'номер';
      else if (last >= 2 && last <= 4) word = 'номера';
    }
    return 'Введите ' + count + ' ' + word;
  }

  app.syncBestMoveField = function (inputId, stored, enabled) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var count = app.getBestMoveNumberCount();
    var values = app.parseBestMoveNumbers(stored).slice(0, count);
    input.value = values.join(', ');
    input.disabled = !enabled;
    input.placeholder = bestMovePlaceholder(count);
    input.setAttribute('data-bestmove-limit', String(count));
    input.setAttribute('aria-label', 'Лучший ход. Количество номеров: ' + count);
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

  app.applySummaryBonusDelta = function (direction) {
    var inp = document.getElementById('modal-summary-bonus');
    if (!inp || inp.disabled) return;
    var v = app.stepBonus(inp.value, direction);
    inp.value = v % 1 === 0 ? String(Math.round(v)) : String(v).replace('.', ',');
  };

  /**
   * Сохраняет общие игровые данные игрока (лучший ход, протокол, примечание)
   * из полей модалки с заданным префиксом id. Используется и модалкой итогов
   * (`modal-summary-`), и модалкой игрового стола (`modal-player-`) — данные общие.
   */
  app.savePlayerGameExtras = function (idPrefix, pid) {
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object')
      app.bestMoveByPlayerId = {};
    if (!app.protocolByPlayerId || typeof app.protocolByPlayerId !== 'object')
      app.protocolByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object')
      app.bonusNoteByPlayerId = {};
    var key = String(pid);
    var bestMove = document.getElementById(idPrefix + 'bestmove');
    if (bestMove && app.showSummaryBestMoveField(pid)) {
      app.bestMoveByPlayerId[key] = app.normalizeNumberListText(bestMove.value);
    }
    if (
      app.getScoringProfile().protocol &&
      document.getElementById(idPrefix + 'protocol-peaceful')
    ) {
      app.setPlayerNumGroup(
        app.protocolByPlayerId,
        pid,
        app.readNumGroupFields(idPrefix + 'protocol-')
      );
    }
    var noteTa = document.getElementById(idPrefix + 'note');
    if (noteTa) app.bonusNoteByPlayerId[key] = noteTa.value;
  };
})(window.MafiaApp);
