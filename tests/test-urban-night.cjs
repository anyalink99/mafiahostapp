'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var roles = [
  'peaceful',
  'mafia',
  'don',
  'sheriff',
  'maniac',
  'doctor',
  'beauty',
  'peaceful',
  'peaceful',
];
var app = {
  players: roles.map(function (_, i) {
    return { id: i + 1, eliminationReason: null, nick: '' };
  }),
  revealedIndices: roles.map(function (_, i) {
    return i;
  }),
  gameLog: [],
  getHostDealtRoles: function () {
    return roles.map(function (code, i) {
      return { seatId: i + 1, code: code };
    });
  },
  mapDealRoleToCode: function (role) {
    return role;
  },
  registerScreenRenderer: function () {},
};

var context = vm.createContext({ window: { MafiaApp: app }, console: console });
var file = path.join(__dirname, '..', 'js', 'modes', 'host', 'night-actions.js');
vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

function equal(actual, expected, label) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a !== e) throw new Error(label + ': ожидалось ' + e + ', получено ' + a);
  console.log('  ✓ ' + label);
}

console.log('urban-night-actions');

var saved = app.resolveUrbanNightActions({
  mafiaShot: 8,
  maniacShot: 9,
  beautyVisit: 8,
  doctorHeal: 9,
  donCheck: 4,
  sheriffCheck: 2,
});
equal(saved.deaths, [], 'красотка и доктор спасают две цели');
equal(saved.savedByBeauty, 8, 'защита красотки записана');
equal(saved.healed, 9, 'лечение врача записано');
equal(saved.donFoundSheriff, true, 'дон находит шерифа');
equal(saved.sheriffFoundMafia, true, 'шериф находит мафию');
equal(saved.sheriffFoundManiac, false, 'мафия не определяется как маньяк');

var maniacCheck = app.resolveUrbanNightActions({ sheriffCheck: 5 });
equal(maniacCheck.sheriffFoundMafia, false, 'маньяк не определяется как мафия');
equal(maniacCheck.sheriffFoundManiac, true, 'шериф узнаёт маньяка');

var beautyShot = app.resolveUrbanNightActions({
  mafiaShot: 7,
  maniacShot: 9,
  beautyVisit: 8,
  doctorHeal: 7,
});
equal(beautyShot.beautySeatsShot, [7], 'выстрел в красотку распознан');
equal(beautyShot.deaths, [8, 9], 'врач спасает красотку, но её гость и вторая цель погибают');

var negativeChecks = app.resolveUrbanNightActions({ donCheck: 2, sheriffCheck: 4 });
equal(negativeChecks.donFoundSheriff, false, 'дон получает отрицательную проверку');
equal(negativeChecks.sheriffFoundMafia, false, 'шериф получает отрицательную проверку');
equal(negativeChecks.sheriffFoundManiac, false, 'мирный не определяется как маньяк');

console.log('Все тесты городской ночи прошли');
