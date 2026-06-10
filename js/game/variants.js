/**
 * Game variant registry.
 *
 * Per-variant files (standard.js, kasper.js, merlin.js, donskaya.js) call
 * app.registerVariant(cfg) at load time. Everything else reads through
 * app.variantConfig(name) / app.SUPPORTED_VARIANTS.
 *
 * Variant config shape:
 *   key:                       string identifier
 *   label:                     display name
 *   rolePool:                  array of role codes — full deck
 *   dealRoles:                 () => shuffled role codes for one game
 *   firstNightKillsKasper:     phantom Каспер dies on night 1 (auto only)
 *   firstNightSheriffRandom:   sheriff check is random on night 1 (auto only)
 *   introWakesMerlin:          Мерлин видит троих чёрных в первую ночь
 *   bestMoveOnFirstKill:       первый ход — лучший ход
 *   postGameMerlinGuess:       последний чёрный называет Мерлина
 *   manualRoles:               role codes manually assignable in summary
 *   hostOnly:                  true → режим скрыт в auto-режиме (пока не реализован для авто)
 */
(function (app) {
  'use strict';

  app.gameVariants = app.gameVariants || {};

  app.registerVariant = function (cfg) {
    if (!cfg || !cfg.key) return;
    app.gameVariants[cfg.key] = cfg;
  };

  app.variantConfig = function (name) {
    return (name && app.gameVariants[name]) || app.gameVariants.standard;
  };

  Object.defineProperty(app, 'SUPPORTED_VARIANTS', {
    get: function () {
      return Object.keys(app.gameVariants);
    },
  });

  app.shuffleVariantPool = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  };

  // Применяет колоду варианта для обычного ведущего: пишет app.roles из cfg.hostDeck.
  // Вызывается при переходе с prepare-mode-screen → prepare-screen.
  // Не трогает roles, если экспериментальные режимы выключены или есть незавершённая партия.
  app.applyHostVariantDeck = function () {
    if (!app.experimentalModesEnabled) return;
    if (app.hasResettableState && app.hasResettableState()) return;
    var cfg = app.variantConfig(app.prepareConfig && app.prepareConfig.variant);
    if (!cfg || !cfg.hostDeck) return;
    app.roles = cfg.hostDeck.slice();
    app.revealedIndices = [];
    if (app.saveState) app.saveState();
  };
})(window.MafiaApp);
