'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function makePlayers() {
  return Array.from({ length: 10 }, function (_, index) {
    return { id: index + 1, nick: '', fouls: 0, eliminationReason: null };
  });
}

function loadApi() {
  var app = {
    players: makePlayers(),
    roles: [],
    revealedIndices: [],
    roleState: {
      version: 1,
      assignmentsByPlayerId: {},
      source: null,
      revision: 0,
    },
    summaryRoleCorrections: {},
    summaryRoleByPlayerId: {},
    playerRoleOverrides: {},
    saveCount: 0,
    events: [],
    saveState: function () {
      this.saveCount++;
    },
    emit: function (name, payload) {
      this.events.push({ name: name, payload: payload });
    },
  };
  var context = vm.createContext({ window: { MafiaApp: app }, console: console, Math: Math });
  var source = fs.readFileSync(path.join(__dirname, '..', 'js', 'game', 'roles.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'roles.js' });
  return app;
}

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
  } catch (error) {
    console.error('  ✗ ' + name);
    throw error;
  }
}

console.log('role-api');

test('полная раздача коммитится атомарно', function () {
  var app = loadApi();
  var deck = [
    'Мафия',
    'Шериф',
    'Дон',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мафия',
  ];
  assert.strictEqual(app.rolesApi.beginDeal(deck, { shuffle: false }), true);
  for (var i = 0; i < 9; i++) {
    assert.strictEqual(app.rolesApi.revealCard(i), true);
    assert.deepStrictEqual(
      Object.keys(app.roleState.assignmentsByPlayerId),
      [],
      'частичная раздача не должна публиковать неполный расклад'
    );
  }
  assert.strictEqual(app.rolesApi.revealCard(9), true);
  assert.strictEqual(app.rolesApi.getAssignedRole(1, 0), 'mafia');
  assert.strictEqual(app.rolesApi.getAssignedRole(2, 1), 'sheriff');
  assert.strictEqual(app.rolesApi.getAssignedRole(3, 2), 'don');
  assert.strictEqual(app.roleState.source, 'deal');
});

test('повторное открытие карты идемпотентно', function () {
  var app = loadApi();
  var deck = Array.from({ length: 10 }, function () {
    return 'Мирный';
  });
  app.rolesApi.beginDeal(deck, { shuffle: false });
  assert.strictEqual(app.rolesApi.revealCard(0), true);
  assert.strictEqual(app.rolesApi.revealCard(0), false);
  assert.deepStrictEqual(Array.from(app.revealedIndices), [0]);
});

test('ручное назначение и исправление итогов разделены', function () {
  var app = loadApi();
  app.rolesApi.assignPlayerRole(1, 'mafia', { source: 'manual' });
  assert.strictEqual(app.rolesApi.getAssignedRole(1, 0), 'mafia');
  assert.strictEqual(app.rolesApi.getEffectiveRole(1, 0), 'mafia');
  app.rolesApi.setSummaryCorrection(1, 'peaceful');
  assert.strictEqual(app.rolesApi.getAssignedRole(1, 0), 'mafia');
  assert.strictEqual(app.rolesApi.getEffectiveRole(1, 0), 'peaceful');
});

test('legacy peaceful не перебивает полную раздачу до итогов', function () {
  var app = loadApi();
  app.roles = [
    'Мафия',
    'Шериф',
    'Дон',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мирный',
    'Мафия',
  ];
  app.revealedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  app.rolesApi.hydrate(null, {
    summaryRoleByPlayerId: { 1: 'peaceful' },
    winnerChosen: false,
  });
  assert.strictEqual(app.rolesApi.getEffectiveRole(1, 0), 'mafia');
  assert.deepStrictEqual(Object.keys(app.summaryRoleCorrections), []);
});

test('явные исправления завершённой игры мигрируют', function () {
  var app = loadApi();
  app.roles = Array.from({ length: 10 }, function () {
    return 'Мирный';
  });
  app.revealedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  app.rolesApi.hydrate(null, {
    summaryRoleByPlayerId: { 1: 'mafia' },
    winnerChosen: true,
  });
  assert.strictEqual(app.rolesApi.getAssignedRole(1, 0), 'peaceful');
  assert.strictEqual(app.rolesApi.getEffectiveRole(1, 0), 'mafia');
});

console.log('Все тесты role-api прошли');

test('явная ручная правка снимает устаревшую коррекцию даже при той же роли', function () {
  var app = loadApi();
  app.rolesApi.assignPlayerRole(1, 'mafia');
  app.rolesApi.setSummaryCorrection(1, 'don');
  app.rolesApi.assignPlayerRole(1, 'mafia', { clearSummaryCorrection: true });
  assert.strictEqual(app.rolesApi.getEffectiveRole(1, 0), 'mafia');
  assert.strictEqual(Object.keys(app.summaryRoleCorrections).length, 0);
});

test('несуществующему игроку нельзя назначить роль', function () {
  var app = loadApi();
  assert.strictEqual(app.rolesApi.assignPlayerRole(null, 'mafia'), false);
  assert.strictEqual(app.rolesApi.assignPlayerRole(11, 'don'), false);
  assert.strictEqual(app.rolesApi.assignPlayerRole(1.5, 'sheriff'), false);
  assert.strictEqual(Object.keys(app.roleState.assignmentsByPlayerId).length, 0);
});

test('новая раздача очищает старые ручные оверрайды', function () {
  var app = loadApi();
  app.playerRoleOverrides = { 1: 'don' };
  app.rolesApi.beginDeal(
    Array.from({ length: 10 }, function () {
      return 'Мирный';
    })
  );
  assert.strictEqual(app.rolesApi.getAssignedRole(1), 'peaceful');
});
