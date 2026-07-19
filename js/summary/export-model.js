/**
 * Каноническая модель обычных экспортов партии.
 *
 * Текст и CSV не должны по-разному вычислять роли, очки и ход игры. Этот
 * модуль один раз собирает полную модель из текущего state. Рендереры в export.js
 * только превращают её в нужный формат.
 */
(function (app) {
  'use strict';

  var ROLE_TEAMS = {
    mafia: 'mafia',
    don: 'mafia',
    maniac: 'independent',
    peaceful: 'peaceful',
    sheriff: 'peaceful',
    merlin: 'peaceful',
    doctor: 'peaceful',
    beauty: 'peaceful',
  };

  var TEAM_LABELS = {
    mafia: 'мафия',
    peaceful: 'мирные',
    independent: 'независимая',
  };

  var ELIMINATION_LABELS = {
    shot: 'убит',
    hang: 'казнён',
    disqual: 'удалён',
  };

  var URBAN_ACTION_LABELS = {
    mafiaShot: 'выстрел мафии',
    donCheck: 'проверка дона',
    sheriffCheck: 'проверка шерифа',
    maniacShot: 'выстрел маньяка',
    beautyVisit: 'визит красотки',
    doctorHeal: 'лечение доктора',
  };

  function own(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function cleanText(value) {
    return value == null ? '' : String(value).trim();
  }

  function numberList(values) {
    return Array.isArray(values)
      ? values
          .filter(function (value) {
            return value !== null && value !== undefined && value !== '';
          })
          .map(String)
      : [];
  }

  function seatList(values) {
    return numberList(values).map(function (value) {
      return '№' + value;
    });
  }

  function roleLabel(code) {
    if (!code) return 'Не указана';
    if (app.ROLE_LABELS_FULL && app.ROLE_LABELS_FULL[code]) return app.ROLE_LABELS_FULL[code];
    return String(code);
  }

  function roleCodeForPlayer(playerId, seatIndex, deal) {
    var key = String(playerId);
    if (own(app.summaryRoleByPlayerId, key) && app.summaryRoleByPlayerId[key]) {
      return app.summaryRoleByPlayerId[key];
    }
    if (deal && deal[seatIndex] != null && app.mapDealRoleToCode) {
      return app.mapDealRoleToCode(deal[seatIndex]);
    }
    if (own(app.playerRoleOverrides, key) && app.playerRoleOverrides[key]) {
      return app.playerRoleOverrides[key];
    }
    return '';
  }

  function roleTeam(code) {
    if (!code) return '';
    return ROLE_TEAMS[code] || 'independent';
  }

  function playerWon(code, winner) {
    if (!code) return null;
    if (winner !== 'mafia' && winner !== 'peaceful') return null;
    return roleTeam(code) === winner;
  }

  function storeValue(store, playerId) {
    var key = String(playerId);
    return own(store, key) ? store[key] : undefined;
  }

  function numGroup(store, playerId) {
    if (app.getPlayerNumGroup) return app.getPlayerNumGroup(store, playerId);
    var value = storeValue(store, playerId) || {};
    return {
      sheriff: cleanText(value.sheriff),
      mafia: cleanText(value.mafia),
      peaceful: cleanText(value.peaceful),
    };
  }

  function sortedEvents(log) {
    if (!Array.isArray(log)) return [];
    return log
      .map(function (event, index) {
        return { event: event, index: index };
      })
      .filter(function (item) {
        return item.event && typeof item.event === 'object';
      })
      .sort(function (a, b) {
        var at = typeof a.event.ts === 'number' ? a.event.ts : 0;
        var bt = typeof b.event.ts === 'number' ? b.event.ts : 0;
        return at === bt ? a.index - b.index : at - bt;
      })
      .map(function (item) {
        return item.event;
      });
  }

  function targetLabel(value) {
    return typeof value === 'number' ? '№' + value : 'пропуск';
  }

  function formatActions(actions) {
    if (!actions || typeof actions !== 'object') return '';
    var parts = [];
    Object.keys(URBAN_ACTION_LABELS).forEach(function (key) {
      if (!own(actions, key)) return;
      parts.push(URBAN_ACTION_LABELS[key] + ': ' + targetLabel(actions[key]));
    });
    return parts.join('; ');
  }

  function formatNightResult(result) {
    if (!result || typeof result !== 'object') return '';
    var parts = [];
    if (Array.isArray(result.shots) && result.shots.length) {
      parts.push('под выстрелом: ' + seatList(result.shots).join(', '));
    }
    if (Array.isArray(result.deaths)) {
      parts.push(
        result.deaths.length ? 'погибли: ' + seatList(result.deaths).join(', ') : 'никто не погиб'
      );
    }
    if (typeof result.savedByBeauty === 'number') {
      parts.push('красотка спасла №' + result.savedByBeauty);
    }
    if (typeof result.healed === 'number') parts.push('доктор спас №' + result.healed);
    if (result.donFoundSheriff === true) parts.push('дон нашёл шерифа');
    if (result.donFoundSheriff === false) parts.push('дон не нашёл шерифа');
    if (result.sheriffFoundManiac === true) parts.push('шериф нашёл маньяка');
    else if (result.sheriffFoundMafia === true) parts.push('шериф нашёл мафию');
    else if (result.sheriffFoundMafia === false) parts.push('шериф не нашёл мафию');
    return parts.join('; ');
  }

  function describeEvent(event) {
    if (app.formatHistoryItem) {
      try {
        var formatted = app.formatHistoryItem(event);
        if (cleanText(formatted)) return String(formatted);
      } catch (e) {}
    }
    try {
      return JSON.stringify(event);
    } catch (e) {
      return String(event.type || 'Событие');
    }
  }

  function rawEventJson(event) {
    try {
      return JSON.stringify(event);
    } catch (e) {
      return '';
    }
  }

  function buildEvent(event, index) {
    var candidateIds = numberList(event.candidateIds);
    var votes = numberList(event.votes);
    var pairs = candidateIds.map(function (id, pairIndex) {
      return '№' + id + ': ' + (votes[pairIndex] != null ? votes[pairIndex] : '—');
    });
    return {
      number: index + 1,
      timestamp: typeof event.ts === 'number' ? event.ts : null,
      type: cleanText(event.type) || 'unknown',
      description: describeEvent(event),
      playerId: typeof event.playerId === 'number' ? event.playerId : null,
      reason: cleanText(event.reason),
      reasonLabel: ELIMINATION_LABELS[event.reason] || cleanText(event.reason),
      candidateIds: candidateIds,
      votes: votes,
      votePairs: pairs,
      tiedIds: numberList(event.tiedIds),
      eliminatedIds: numberList(event.eliminatedIds),
      nightNumber: typeof event.nightNumber === 'number' ? event.nightNumber : null,
      source: cleanText(event.source),
      actions: formatActions(event.actions),
      result: formatNightResult(event.result),
      rawJson: rawEventJson(event),
    };
  }

  function buildPlayer(player, seatIndex, deal, winner) {
    var id = player && typeof player.id === 'number' ? player.id : seatIndex + 1;
    var roleCode = roleCodeForPlayer(id, seatIndex, deal);
    var bonusRaw = storeValue(app.bonusPointsByPlayerId, id);
    var bonus = app.parseBonusFloat ? app.parseBonusFloat(bonusRaw) : Number(bonusRaw) || 0;
    var won = playerWon(roleCode, winner);
    var basePoints = won === null ? null : won ? 1 : 0;
    return {
      id: id,
      nick: cleanText(player && player.nick),
      roleCode: roleCode,
      role: roleLabel(roleCode),
      team: roleTeam(roleCode),
      teamLabel: roleTeam(roleCode)
        ? TEAM_LABELS[roleTeam(roleCode)] || roleTeam(roleCode)
        : 'не указана',
      eliminationReason: cleanText(player && player.eliminationReason),
      status:
        player && player.eliminationReason
          ? ELIMINATION_LABELS[player.eliminationReason] || String(player.eliminationReason)
          : 'в игре',
      fouls: player && typeof player.fouls === 'number' ? player.fouls : 0,
      won: won,
      basePoints: basePoints,
      bonus: bonus,
      totalPoints: basePoints === null ? bonus : basePoints + bonus,
      bestMove: app.formatBestMoveForExport
        ? app.formatBestMoveForExport(storeValue(app.bestMoveByPlayerId, id))
        : cleanText(storeValue(app.bestMoveByPlayerId, id)),
      protocol: numGroup(app.protocolByPlayerId, id),
      opinion: numGroup(app.opinionByPlayerId, id),
      note: cleanText(storeValue(app.bonusNoteByPlayerId, id)),
    };
  }

  function variantInfo() {
    var key = (app.prepareConfig && app.prepareConfig.variant) || 'standard';
    var config = app.variantConfig ? app.variantConfig(key) : null;
    return { key: key, label: (config && config.label) || key };
  }

  app.buildGameExportModel = function () {
    var variant = variantInfo();
    var winner =
      app.winningTeam === 'mafia' || app.winningTeam === 'peaceful' ? app.winningTeam : '';
    var deal = app.rolesFromDealForSeats ? app.rolesFromDealForSeats() : null;
    var players = (Array.isArray(app.players) ? app.players : []).map(function (player, index) {
      return buildPlayer(player, index, deal, winner);
    });
    var composition = {};
    players.forEach(function (player) {
      var key = player.roleCode || 'unknown';
      if (!composition[key]) composition[key] = { role: player.role, playerIds: [] };
      composition[key].playerIds.push(player.id);
    });
    return {
      version: 2,
      exportedAt: Date.now(),
      mode: 'host',
      variant: variant,
      host: cleanText(app.summaryHostName),
      winner: winner,
      winnerLabel: winner ? TEAM_LABELS[winner] : '',
      playerCount: players.length,
      notes: cleanText(app.gameSideNotes),
      roleCounts:
        app.prepareConfig && app.prepareConfig.roleCounts
          ? JSON.parse(JSON.stringify(app.prepareConfig.roleCounts))
          : null,
      composition: composition,
      players: players,
      events: sortedEvents(app.gameLog).map(buildEvent),
    };
  };
})(window.MafiaApp);
