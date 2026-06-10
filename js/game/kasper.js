(function (app) {
  'use strict';

  // 9 живых игроков + 10-е место — фантом (всегда мирный), убивается ночью 1.
  var POOL_9 = [
    'peaceful',
    'peaceful',
    'peaceful',
    'peaceful',
    'peaceful',
    'sheriff',
    'mafia',
    'mafia',
    'don',
  ];

  app.registerVariant({
    key: 'kasper',
    label: 'Каспер',
    rolePool: POOL_9,
    dealRoles: function () {
      var shuffled = app.shuffleVariantPool(POOL_9);
      shuffled.push('peaceful');
      return shuffled;
    },
    firstNightKillsKasper: true,
    firstNightSheriffRandom: true,
    introWakesMerlin: false,
    bestMoveOnFirstKill: false,
    postGameMerlinGuess: false,
    manualRoles: ['peaceful', 'mafia', 'don', 'sheriff'],
    // 9 карт: 10-е место — фантом, своей карты не получает.
    hostDeck: ['Мирный', 'Мирный', 'Мирный', 'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мафия', 'Дон'],
  });
})(window.MafiaApp);
