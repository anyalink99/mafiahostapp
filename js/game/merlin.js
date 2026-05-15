(function (app) {
  'use strict';

  var POOL = ['peaceful', 'peaceful', 'peaceful', 'peaceful', 'peaceful', 'sheriff', 'merlin', 'mafia', 'mafia', 'don'];

  app.registerVariant({
    key: 'merlin',
    label: 'Мерлин',
    rolePool: POOL,
    dealRoles: function () { return app.shuffleVariantPool(POOL); },
    firstNightKillsKasper: false,
    firstNightSheriffRandom: false,
    introWakesMerlin: true,
    bestMoveOnFirstKill: true,
    postGameMerlinGuess: true,
    manualRoles: ['peaceful', 'mafia', 'don', 'sheriff', 'merlin'],
    hostDeck: ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон', 'Мерлин'],
  });
})(window.MafiaApp);
