/**
 * Единый доменный API ролей.
 *
 * Роль текущей игры и исправление роли в итогах — разные слои:
 *   roleState.assignmentsByPlayerId — подтверждённый расклад текущей игры;
 *   summaryRoleCorrections          — явные исправления после игры.
 *
 * UI не должен напрямую писать revealedIndices / summaryRoleByPlayerId.
 * Карточная раздача сначала собирается как draft в revealedIndices, затем
 * целиком и атомарно коммитится в assignmentsByPlayerId.
 */
(function (app) {
  'use strict';

  var VALID_CODES = {
    peaceful: true,
    sheriff: true,
    mafia: true,
    don: true,
    merlin: true,
    maniac: true,
    doctor: true,
    beauty: true,
  };

  function emptyRoleState() {
    return {
      version: 1,
      assignmentsByPlayerId: {},
      source: null,
      revision: 0,
    };
  }

  function own(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function normalizeCode(code) {
    return typeof code === 'string' && VALID_CODES[code] ? code : null;
  }

  function normalizeRoleMap(value) {
    var out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    Object.keys(value).forEach(function (key) {
      var code = normalizeCode(value[key]);
      if (code) out[String(key)] = code;
    });
    return out;
  }

  function installLegacyCorrectionAlias() {
    var initial =
      app.summaryRoleCorrections && typeof app.summaryRoleCorrections === 'object'
        ? app.summaryRoleCorrections
        : app.summaryRoleByPlayerId && typeof app.summaryRoleByPlayerId === 'object'
          ? app.summaryRoleByPlayerId
          : {};
    app.summaryRoleCorrections = initial;
    try {
      Object.defineProperty(app, 'summaryRoleByPlayerId', {
        configurable: true,
        enumerable: true,
        get: function () {
          return app.summaryRoleCorrections;
        },
        set: function (value) {
          app.summaryRoleCorrections =
            value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        },
      });
    } catch (_) {
      app.summaryRoleByPlayerId = app.summaryRoleCorrections;
    }
  }

  installLegacyCorrectionAlias();

  function ensureState() {
    if (!app.roleState || typeof app.roleState !== 'object') app.roleState = emptyRoleState();
    if (
      !app.roleState.assignmentsByPlayerId ||
      typeof app.roleState.assignmentsByPlayerId !== 'object' ||
      Array.isArray(app.roleState.assignmentsByPlayerId)
    ) {
      app.roleState.assignmentsByPlayerId = {};
    }
    if (typeof app.roleState.revision !== 'number') app.roleState.revision = 0;
    if (
      !app.summaryRoleCorrections ||
      typeof app.summaryRoleCorrections !== 'object' ||
      Array.isArray(app.summaryRoleCorrections)
    ) {
      app.summaryRoleCorrections = {};
    }
    // Временный совместимый alias для старых модулей и сохранений.
    app.summaryRoleByPlayerId = app.summaryRoleCorrections;
    return app.roleState;
  }

  function roleCodeFromDeckRole(role) {
    if (!role) return 'peaceful';
    if (role === 'Шериф' || role === 'sheriff') return 'sheriff';
    if (role === 'Дон' || role === 'don') return 'don';
    if (role === 'Мафия' || role === 'mafia') return 'mafia';
    if (role === 'Мерлин' || role === 'merlin') return 'merlin';
    if (role === 'Маньяк' || role === 'maniac') return 'maniac';
    if (role === 'Доктор' || role === 'doctor') return 'doctor';
    if (role === 'Красотка' || role === 'beauty') return 'beauty';
    return 'peaceful';
  }

  function dealRolesForSeats() {
    if (!Array.isArray(app.players) || !Array.isArray(app.roles)) return null;
    if (!Array.isArray(app.revealedIndices)) return null;
    if (app.revealedIndices.length !== app.players.length) return null;
    if (app.roles.length !== app.players.length) return null;
    var seen = {};
    var out = [];
    for (var i = 0; i < app.players.length; i++) {
      var deckIndex = app.revealedIndices[i];
      if (
        typeof deckIndex !== 'number' ||
        deckIndex < 0 ||
        deckIndex >= app.roles.length ||
        seen[deckIndex]
      ) {
        return null;
      }
      seen[deckIndex] = true;
      if (app.roles[deckIndex] == null) return null;
      out[i] = app.roles[deckIndex];
    }
    return out;
  }

  function emitChanged(reason) {
    if (app.emit) {
      app.emit('roles-changed', {
        reason: reason || 'update',
        state: api.serialize(),
      });
    }
  }

  function persist(opts, reason) {
    opts = opts || {};
    if (opts.save !== false && app.saveState) app.saveState();
    if (opts.emit !== false) emitChanged(reason);
  }

  function commitDeal(opts) {
    opts = opts || {};
    var deal = dealRolesForSeats();
    if (!deal) return false;
    var state = ensureState();
    var assignments = {};
    for (var i = 0; i < app.players.length; i++) {
      assignments[String(app.players[i].id)] = roleCodeFromDeckRole(deal[i]);
    }
    state.assignmentsByPlayerId = assignments;
    state.source = opts.source || 'deal';
    state.revision++;
    // Новая полная раздача — источник истины. Старые ручные/итоговые значения
    // не имеют права незаметно перебивать её.
    if (opts.keepSummaryCorrections !== true) {
      app.summaryRoleCorrections = {};
      app.summaryRoleByPlayerId = app.summaryRoleCorrections;
    }
    persist(opts, 'deal-committed');
    return true;
  }

  function shuffleDeck(deck) {
    var out = deck.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  var api = {
    beginDeal: function (deck, opts) {
      opts = opts || {};
      if (!Array.isArray(deck) || !deck.length) return false;
      if (Array.isArray(app.players) && app.players.length && deck.length !== app.players.length) {
        return false;
      }
      app.roles = opts.shuffle === false ? deck.slice() : shuffleDeck(deck);
      app.revealedIndices = [];
      var state = ensureState();
      state.assignmentsByPlayerId = {};
      state.source = 'deal-pending';
      state.revision++;
      app.summaryRoleCorrections = {};
      app.summaryRoleByPlayerId = app.summaryRoleCorrections;
      persist(opts, 'deal-started');
      return true;
    },

    revealCard: function (deckIndex, opts) {
      opts = opts || {};
      if (!Array.isArray(app.roles) || !Array.isArray(app.revealedIndices)) return false;
      if (
        typeof deckIndex !== 'number' ||
        deckIndex < 0 ||
        deckIndex >= app.roles.length ||
        app.revealedIndices.indexOf(deckIndex) !== -1
      ) {
        return false;
      }
      app.revealedIndices.push(deckIndex);
      if (app.revealedIndices.length === app.roles.length) {
        return commitDeal(opts);
      }
      persist(opts, 'card-revealed');
      return true;
    },

    commitDeal: commitDeal,

    assignPlayerRole: function (playerId, roleCode, opts) {
      opts = opts || {};
      var code = normalizeCode(roleCode);
      if (!code || playerId == null) return false;
      var state = ensureState();
      var key = String(playerId);
      if (state.assignmentsByPlayerId[key] === code) return true;
      state.assignmentsByPlayerId[key] = code;
      state.source = opts.source || 'manual';
      state.revision++;
      persist(opts, 'assignment-changed');
      return true;
    },

    replaceAssignments: function (assignments, opts) {
      opts = opts || {};
      var normalized = normalizeRoleMap(assignments);
      var state = ensureState();
      state.assignmentsByPlayerId = normalized;
      state.source = opts.source || 'import';
      state.revision++;
      if (opts.clearSummaryCorrections !== false) {
        app.summaryRoleCorrections = {};
        app.summaryRoleByPlayerId = app.summaryRoleCorrections;
      }
      persist(opts, 'assignments-replaced');
      return true;
    },

    clearPlayerAssignment: function (playerId, opts) {
      var state = ensureState();
      var key = String(playerId);
      if (!own(state.assignmentsByPlayerId, key)) return false;
      delete state.assignmentsByPlayerId[key];
      state.revision++;
      persist(opts, 'assignment-cleared');
      return true;
    },

    setSummaryCorrection: function (playerId, roleCode, opts) {
      var code = normalizeCode(roleCode);
      if (!code || playerId == null) return false;
      ensureState();
      var key = String(playerId);
      if (app.summaryRoleCorrections[key] === code) return true;
      app.summaryRoleCorrections[key] = code;
      persist(opts, 'summary-correction-changed');
      return true;
    },

    clearSummaryCorrection: function (playerId, opts) {
      ensureState();
      var key = String(playerId);
      if (!own(app.summaryRoleCorrections, key)) return false;
      delete app.summaryRoleCorrections[key];
      persist(opts, 'summary-correction-cleared');
      return true;
    },

    getAssignedRole: function (playerId, seatIndex) {
      var state = ensureState();
      var key = String(playerId);
      if (own(state.assignmentsByPlayerId, key)) return state.assignmentsByPlayerId[key];
      var deal = dealRolesForSeats();
      if (deal && deal[seatIndex] != null) return roleCodeFromDeckRole(deal[seatIndex]);
      if (
        app.playerRoleOverrides &&
        own(app.playerRoleOverrides, key) &&
        normalizeCode(app.playerRoleOverrides[key])
      ) {
        return app.playerRoleOverrides[key];
      }
      return 'peaceful';
    },

    getEffectiveRole: function (playerId, seatIndex) {
      ensureState();
      var key = String(playerId);
      if (own(app.summaryRoleCorrections, key)) return app.summaryRoleCorrections[key];
      return api.getAssignedRole(playerId, seatIndex);
    },

    getDealRolesForSeats: dealRolesForSeats,

    hasCompleteDeal: function () {
      return dealRolesForSeats() !== null;
    },

    getDealProgress: function () {
      return {
        revealed: Array.isArray(app.revealedIndices) ? app.revealedIndices.length : 0,
        total: Array.isArray(app.roles) ? app.roles.length : 0,
        complete: dealRolesForSeats() !== null,
      };
    },

    reset: function (opts) {
      opts = opts || {};
      app.roleState = emptyRoleState();
      app.summaryRoleCorrections = {};
      app.summaryRoleByPlayerId = app.summaryRoleCorrections;
      if (opts.clearDeal !== false) app.revealedIndices = [];
      persist(opts, 'roles-reset');
    },

    hydrate: function (savedState, legacy) {
      legacy = legacy || {};
      var legacyCorrections = normalizeRoleMap(
        legacy.summaryRoleCorrections || legacy.summaryRoleByPlayerId
      );
      if (savedState && savedState.version === 1) {
        app.roleState = {
          version: 1,
          assignmentsByPlayerId: normalizeRoleMap(savedState.assignmentsByPlayerId),
          source: typeof savedState.source === 'string' ? savedState.source : null,
          revision: typeof savedState.revision === 'number' ? savedState.revision : 0,
        };
        app.summaryRoleCorrections = legacyCorrections;
        app.summaryRoleByPlayerId = app.summaryRoleCorrections;
        return;
      }

      app.roleState = emptyRoleState();
      var deal = dealRolesForSeats();
      if (deal) {
        var migrated = {};
        for (var i = 0; i < app.players.length; i++) {
          migrated[String(app.players[i].id)] = roleCodeFromDeckRole(deal[i]);
        }
        app.roleState.assignmentsByPlayerId = migrated;
        app.roleState.source = 'legacy-deal';
        app.roleState.revision = 1;
        // До выбора победителя legacy-map был общим хранилищем и содержал
        // в том числе случайные peaceful от закрытия карточки игрока.
        app.summaryRoleCorrections = legacy.winnerChosen ? legacyCorrections : {};
      } else {
        // Без полной раздачи legacy-map мог быть явной ручной расстановкой.
        app.roleState.assignmentsByPlayerId = legacyCorrections;
        app.roleState.source = Object.keys(legacyCorrections).length ? 'legacy-manual' : null;
        app.roleState.revision = Object.keys(legacyCorrections).length ? 1 : 0;
        app.summaryRoleCorrections = {};
      }
      app.summaryRoleByPlayerId = app.summaryRoleCorrections;
    },

    serialize: function () {
      var state = ensureState();
      return {
        version: 1,
        assignmentsByPlayerId: Object.assign({}, state.assignmentsByPlayerId),
        source: state.source,
        revision: state.revision,
      };
    },

    validRoleCode: function (roleCode) {
      return !!normalizeCode(roleCode);
    },
  };

  app.rolesApi = api;
  app.mapDealRoleToCode = roleCodeFromDeckRole;
  app.rolesFromDealForSeats = dealRolesForSeats;
  app.hasFullCardDeal = api.hasCompleteDeal;
  app.getEffectiveSummaryRoleCode = function (playerId, seatIndex) {
    return api.getEffectiveRole(playerId, seatIndex);
  };
})(window.MafiaApp);
