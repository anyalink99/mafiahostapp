'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var storage = require('../js/core/storage.js');

function load() {
  var saved = {};
  var storageApi = storage.createStorageApi({
    getItem: function (key) {
      return saved[key] || null;
    },
    setItem: function (key, value) {
      saved[key] = value;
    },
    removeItem: function (key) {
      delete saved[key];
    },
  });
  var app = {
    settingsRepository: storage.createSettingsRepository(storageApi),
    gameRepository: storage.createGameRepository(storageApi),
    navigateToScreen: function () {},
    updateResetButtonVisibility: function () {},
  };
  var fields = {};
  var context = vm.createContext({
    window: { MafiaApp: app },
    document: {
      getElementById: function (id) {
        return fields[id] || null;
      },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
    },
    console: console,
  });
  [
    'core/state',
    'core/utils',
    'game/roles',
    'game/scoring',
    'summary/player-data',
    'summary/export-model',
    'summary/export',
  ].forEach(function (name) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'),
      context,
      { filename: name }
    );
  });
  return { app: app, fields: fields };
}

function test(name, run) {
  run();
  console.log('  ✓ ' + name);
}

console.log('scoring and saved games');
test('МСЛ сохраняет четверти балла при вводе, шагах, экспорте и перезагрузке', function () {
  var app = load().app;
  app.setScoringSystem('msl');
  assert.strictEqual(app.parseBonusFloat('1,25'), 1.25);
  assert.strictEqual(app.parseBonusFloat('-0,75'), -0.75);
  assert.strictEqual(app.parseBonusFloat(Infinity), 0);
  var value = 0;
  for (var i = 0; i < 7; i++) value = app.stepBonus(value, 1);
  assert.strictEqual(value, 1.75);
  app.rolesApi.assignPlayerRole(1, 'sheriff');
  app.winningTeam = 'peaceful';
  app.bonusPointsByPlayerId['1'] = value;
  app.saveState();
  app.scoringSystem = 'fsm';
  app.bonusPointsByPlayerId = {};
  assert.strictEqual(app.loadState(), true);
  var model = app.buildGameExportModel();
  assert.strictEqual(model.scoringSystem, 'msl');
  assert.strictEqual(model.players[0].basePoints, 2.5);
  assert.strictEqual(model.players[0].totalPoints, 4.25);
  assert.ok(app.buildGameExportText().includes('4,25'));
  assert.ok(app.buildGameExportCsv().includes('МСЛ'));
});

test('ФСМ использует десятые, смена системы не округляет введённые допы', function () {
  var app = load().app;
  assert.strictEqual(app.stepBonus('0,2', 1), 0.3);
  assert.strictEqual(app.stepBonus('0', -1), -0.1);
  app.bonusPointsByPlayerId['1'] = 1.25;
  app.setScoringSystem('msl');
  app.setScoringSystem('fsm');
  assert.strictEqual(app.bonusPointsByPlayerId['1'], 1.25);
  app.winningTeam = 'peaceful';
  assert.strictEqual(app.buildGameExportModel().players[0].basePoints, 1);
});

test('архивная ФСМ не наследует МСЛ из настроек; новая партия наследует выбор', function () {
  var app = load().app;
  app.setScoringSystem('msl');
  var old = app.gameRepository.read(app.STORAGE_KEY, null);
  delete old.scoringSystem;
  app.gameRepository.write(app.STORAGE_KEY, old);
  app.loadState();
  assert.strictEqual(app.scoringSystem, 'fsm');
  assert.strictEqual(app.getDefaultScoringSystem(), 'msl');
  app.resetGameState();
  assert.strictEqual(app.scoringSystem, 'msl');
});

test('скрытый протокол и старое мнение сохраняются без вывода мнения в экспорт', function () {
  var app = load().app;
  app.protocolByPlayerId['1'] = { peaceful: '2, 3', mafia: '4', sheriff: '5' };
  app.opinionByPlayerId['1'] = { peaceful: '6' };
  app.setScoringSystem('msl');
  app.savePlayerGameExtras('modal-summary-', 1);
  app.saveState();
  app.loadState();
  assert.strictEqual(app.protocolByPlayerId['1'].peaceful, '2, 3');
  assert.strictEqual(app.opinionByPlayerId['1'].peaceful, '6');
  assert.strictEqual(app.buildGameExportModel().players[0].protocol.peaceful, '');
  assert.ok(!app.buildGameExportText().includes('Мнение'));
  assert.ok(!app.buildGameExportCsv().includes('Мнение'));
  app.setScoringSystem('fsm');
  assert.strictEqual(app.buildGameExportModel().players[0].protocol.peaceful, '2, 3');
});

test('ЛХ не принимает дубли, дробные, лишние и несуществующие номера', function () {
  var app = load().app;
  ['1,1,2', '1,2,11', '1,2,3,4', '1,2,3x', '1,2,3.5'].forEach(function (move) {
    assert.strictEqual(app.isBestMoveComplete(move), false, move);
    assert.strictEqual(app.isBestMoveTripleComplete(move), false, move);
  });
  assert.strictEqual(app.isBestMoveComplete('1, 2, 10'), true);
  assert.strictEqual(app.isBestMoveTripleComplete('379'), true);
});

console.log('Scoring regressions passed');
