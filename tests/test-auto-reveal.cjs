'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'modes', 'auto', 'reveal.js'),
  'utf8'
);

var saved = 0;
var history = 0;
var renderers = {};
var app = {
  _auto: {
    ROLE_NAMES: {
      peaceful: 'Мирный',
      mafia: 'Мафия',
      don: 'Дон',
      sheriff: 'Шериф',
      merlin: 'Мерлин',
    },
    REVEAL_SEC: 3,
    el: function () {
      return null;
    },
    playerCount: function () {
      return 10;
    },
    isPhantomSeat: function (seat) {
      return !!(seat && seat.phantom);
    },
    isMafiaSide: function (role) {
      return role === 'mafia' || role === 'don';
    },
    seatById: function (id) {
      return app.autoState.seats[id - 1] || null;
    },
    pushHistory: function () {
      history++;
    },
    saveAuto: function () {
      saved++;
    },
    roleIconEl: function () {
      return {};
    },
    transitionToNightIntro: function () {},
  },
  _autoEphemeral: {},
  h: function () {
    return {};
  },
  registerScreenRenderer: function (id, fn) {
    renderers[id] = fn;
  },
};

vm.runInNewContext(source, {
  window: { MafiaApp: app },
  Date: Date,
  Number: Number,
  isFinite: isFinite,
  setInterval: setInterval,
  clearInterval: clearInterval,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
});

function assert(value, message) {
  if (!value) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(message + ': ' + actual + ' !== ' + expected);
}

console.log('auto-reveal');

var legacyRoles = [
  'peaceful',
  'mafia',
  'don',
  'peaceful',
  'sheriff',
  'peaceful',
  'mafia',
  'peaceful',
  'peaceful',
  'peaceful',
];
var legacy = {
  phase: 'reveal',
  reveal: { cursor: 3 },
  seats: legacyRoles.map(function (role, index) {
    return { id: index + 1, role: role };
  }),
};
assert(app._auto.normalizeRevealState(legacy), 'старое состояние должно мигрировать');
equal(legacy.reveal.version, 2, 'версия состояния');
equal(legacy.reveal.remainingRoles.length, 8, 'остаток закрытой колоды');
equal(legacy.seats[0].role, 'peaceful', 'уже просмотренная роль №1 сохраняется');
equal(legacy.seats[1].role, 'mafia', 'уже просмотренная роль №2 сохраняется');
equal(legacy.seats[2].role, null, 'роль текущего игрока возвращается в колоду');

app.autoState = {
  phase: 'reveal',
  reveal: {
    version: 2,
    cursor: 1,
    stage: 'pick',
    remainingRoles: legacyRoles.slice(),
    selectedRole: null,
    showUntil: 0,
  },
  seats: legacyRoles.map(function (_, index) {
    return { id: index + 1, role: null };
  }),
};
assert(app.chooseAutoRevealCard(4), 'закрытая карта должна выбираться');
equal(app.autoState.seats[0].role, 'sheriff', 'выбранная роль назначается текущему месту');
equal(app.autoState.reveal.remainingRoles.length, 9, 'выбранная карта удаляется из колоды');
equal(app.autoState.reveal.stage, 'showing', 'после выбора начинается показ роли');
equal(history, 1, 'выбор карты сохраняет шаг истории');
assert(saved >= 1, 'выбор карты сохраняет состояние');
assert(typeof renderers['auto-reveal-screen'] === 'function', 'рендерер экрана зарегистрирован');

console.log('Все тесты auto-reveal прошли');
