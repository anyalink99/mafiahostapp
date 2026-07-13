/**
 * «Городская» — настраиваемый host-only вариант на 7–16 игроков.
 * Состав хранится в prepareConfig, поэтому ведущий может менять как размер
 * стола, так и количество каждой роли до начала раздачи.
 */
(function (app) {
  'use strict';

  var ROLE_ORDER = ['mafia', 'don', 'sheriff', 'maniac', 'doctor', 'beauty', 'peaceful'];
  var ROLE_NAMES = {
    peaceful: 'Мирный',
    mafia: 'Мафия',
    don: 'Дон',
    sheriff: 'Шериф',
    maniac: 'Маньяк',
    doctor: 'Доктор',
    beauty: 'Красотка',
  };

  app.URBAN_ROLE_ORDER = ROLE_ORDER.slice();

  app.urbanSuggestedCounts = function (playerCount) {
    var n = Math.max(7, Math.min(16, parseInt(playerCount, 10) || 12));
    var mafia = n >= 15 ? 3 : n >= 8 ? 2 : 1;
    var don = n >= 11 ? 1 : 0;
    var beauty = n >= 10 ? 1 : 0;
    // Шериф, маньяк и доктор участвуют при любом размере стола.
    // Красотка добавляется на 10, дон — на 11, третья мафия — на 15 игроков.
    var fixed = mafia + don + beauty + 3;
    return {
      mafia: mafia,
      don: don,
      sheriff: 1,
      maniac: 1,
      doctor: 1,
      beauty: beauty,
      peaceful: Math.max(0, n - fixed),
    };
  };

  app.ensureUrbanPrepareConfig = function () {
    app.prepareConfig = app.prepareConfig || { mode: 'host', variant: 'urban' };
    var n = parseInt(app.prepareConfig.playerCount, 10);
    if (isNaN(n)) n = 12;
    n = Math.max(7, Math.min(16, n));
    app.prepareConfig.playerCount = n;
    var src = app.prepareConfig.roleCounts;
    if (!src || typeof src !== 'object' || Array.isArray(src)) {
      app.prepareConfig.roleCounts = app.urbanSuggestedCounts(n);
      return app.prepareConfig;
    }
    var normalized = {};
    for (var i = 0; i < ROLE_ORDER.length; i++) {
      var key = ROLE_ORDER[i];
      var value = parseInt(src[key], 10);
      normalized[key] = isNaN(value) ? 0 : Math.max(0, Math.min(16, value));
    }
    app.prepareConfig.roleCounts = normalized;
    return app.prepareConfig;
  };

  app.urbanRoleTotal = function () {
    var cfg = app.ensureUrbanPrepareConfig();
    var total = 0;
    for (var i = 0; i < ROLE_ORDER.length; i++) total += cfg.roleCounts[ROLE_ORDER[i]] || 0;
    return total;
  };

  app.urbanConfigIsValid = function () {
    var cfg = app.ensureUrbanPrepareConfig();
    return (
      cfg.playerCount >= 7 && cfg.playerCount <= 16 && app.urbanRoleTotal() === cfg.playerCount
    );
  };

  function hostDeck() {
    var cfg = app.ensureUrbanPrepareConfig();
    var counts = app.urbanConfigIsValid()
      ? cfg.roleCounts
      : app.urbanSuggestedCounts(cfg.playerCount);
    var deck = [];
    for (var i = 0; i < ROLE_ORDER.length; i++) {
      var code = ROLE_ORDER[i];
      for (var j = 0; j < counts[code]; j++) deck.push(ROLE_NAMES[code]);
    }
    return deck;
  }

  app.registerVariant({
    key: 'urban',
    label: 'Городская',
    rolePool: [],
    dealRoles: function () {
      return app.shuffleVariantPool(
        hostDeck().map(function (role) {
          for (var code in ROLE_NAMES) if (ROLE_NAMES[code] === role) return code;
          return 'peaceful';
        })
      );
    },
    firstNightKillsKasper: false,
    firstNightSheriffRandom: false,
    introWakesMerlin: false,
    bestMoveOnFirstKill: false,
    postGameMerlinGuess: false,
    manualRoles: ROLE_ORDER.slice(),
    hostOnly: true,
    getHostDeck: hostDeck,
  });
})(window.MafiaApp);
