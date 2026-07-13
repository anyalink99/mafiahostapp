'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var app = {
  registerVariant: function () {},
  shuffleVariantPool: function (roles) {
    return roles;
  },
};

var context = vm.createContext({ window: { MafiaApp: app }, console: console });
var file = path.join(__dirname, '..', 'js', 'game', 'urban.js');
vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

function equal(actual, expected, label) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) throw new Error(label + ': ожидалось ' + e + ', получено ' + a);
  console.log('  ✓ ' + label);
}

console.log('urban-setup');

var expected = {
  7: [1, 0, 1, 1, 1, 0, 3],
  8: [2, 0, 1, 1, 1, 0, 3],
  9: [2, 0, 1, 1, 1, 0, 4],
  10: [2, 0, 1, 1, 1, 1, 4],
  11: [2, 1, 1, 1, 1, 1, 4],
  12: [2, 1, 1, 1, 1, 1, 5],
  13: [2, 1, 1, 1, 1, 1, 6],
  14: [2, 1, 1, 1, 1, 1, 7],
  15: [3, 1, 1, 1, 1, 1, 7],
  16: [3, 1, 1, 1, 1, 1, 8],
};

Object.keys(expected).forEach(function (playerCount) {
  var counts = app.urbanSuggestedCounts(Number(playerCount));
  var compact = app.URBAN_ROLE_ORDER.map(function (role) {
    return counts[role];
  });
  equal(compact, expected[playerCount], playerCount + ' игроков');
});

equal(
  app.urbanSuggestedCounts(8),
  { mafia: 2, don: 0, sheriff: 1, maniac: 1, doctor: 1, beauty: 0, peaceful: 3 },
  'якорный состав на 8 игроков'
);

console.log('Все тесты подготовки городской игры прошли');
