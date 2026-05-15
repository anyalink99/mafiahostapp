(function (app) {
  'use strict';

  var POOL = ['peaceful', 'peaceful', 'peaceful', 'peaceful', 'peaceful', 'peaceful', 'sheriff', 'mafia', 'mafia', 'don'];

  app.registerVariant({
    key: 'standard',
    label: 'Стандарт',
    rolePool: POOL,
    dealRoles: function () { return app.shuffleVariantPool(POOL); },
    firstNightKillsKasper: false,
    firstNightSheriffRandom: false,
    introWakesMerlin: false,
    bestMoveOnFirstKill: true,
    postGameMerlinGuess: false,
    manualRoles: ['peaceful', 'mafia', 'don', 'sheriff'],
    hostDeck: ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'],
  });
})(window.MafiaApp);
