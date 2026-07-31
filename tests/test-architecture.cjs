'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var storageModule = require('../js/core/storage.js');
var clockModule = require('../js/core/clock.js');
var sessionModule = require('../js/game/session-api.js');
var voteApi = require('../js/game/vote-api.js');
var phaseModule = require('../js/game/phase-machine.js');
var nightModule = require('../js/game/night-action-registry.js');
var audioModule = require('../js/audio/audio-director.js');

function test(name, fn) {
  fn();
  console.log('  ✓ ' + name);
}

console.log('architecture contracts');

test('application code cannot bypass the storage boundary', function () {
  var jsRoot = path.join(__dirname, '..', 'js');
  var offenders = [];

  function scan(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach(function (entry) {
      var fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'vendor') scan(fullPath);
        return;
      }
      if (!entry.name.endsWith('.js') || fullPath.endsWith(path.join('core', 'storage.js'))) return;
      var source = fs.readFileSync(fullPath, 'utf8');
      if (/localStorage\.(getItem|setItem|removeItem)/.test(source)) {
        offenders.push(path.relative(jsRoot, fullPath));
      }
    });
  }

  scan(jsRoot);
  assert.deepStrictEqual(offenders, []);
});

test('versioned repositories migrate legacy snapshots without changing their shape', function () {
  var data = {
    game: JSON.stringify({ players: [{ id: 1 }], oldFlag: true }),
  };
  var storage = {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function (key, value) {
      data[key] = value;
    },
    removeItem: function (key) {
      delete data[key];
    },
  };
  var storageApi = storageModule.createStorageApi(storage);
  var repository = storageModule.createGameRepository(storageApi);
  repository.register('game', {
    version: 2,
    migrations: {
      1: function (snapshot) {
        snapshot.players = snapshot.players || [];
        return snapshot;
      },
      2: function (snapshot) {
        snapshot.migrated = true;
        delete snapshot.oldFlag;
        return snapshot;
      },
    },
  });
  var loaded = repository.read('game', null);
  assert.strictEqual(loaded.schemaVersion, 2);
  assert.strictEqual(loaded.migrated, true);
  assert.deepStrictEqual(loaded.players, [{ id: 1 }]);
  assert.strictEqual(JSON.parse(data.game).schemaVersion, 2);
});

test('settings repository keeps typed reads and writes behind one boundary', function () {
  var data = {};
  var storageApi = storageModule.createStorageApi({
    getItem: function (key) {
      return data[key] == null ? null : data[key];
    },
    setItem: function (key, value) {
      data[key] = value;
    },
    removeItem: function (key) {
      delete data[key];
    },
  });
  var settings = storageModule.createSettingsRepository(storageApi);
  settings.setBoolean('music', true);
  settings.setNumber('seconds', 7);
  assert.strictEqual(settings.getBoolean('music', false), true);
  assert.strictEqual(settings.getNumber('seconds', 0, { min: 1, max: 10 }), 7);
  assert.strictEqual(settings.getNumber('missing', 60), 60);
});

test('ClockApi uses wall time and is deterministic with an injected scheduler', function () {
  var now = 1000;
  var callback = null;
  var clock = clockModule.createClockApi({
    now: function () {
      return now;
    },
    setInterval: function (fn) {
      callback = fn;
      return 42;
    },
    clearInterval: function () {
      callback = null;
    },
  });
  var ticks = [];
  clock.startCountdown('turn', 7000, {
    onTick: function (state) {
      ticks.push(state.remainingMs);
    },
  });
  now += 2500;
  callback();
  assert.deepStrictEqual(ticks, [7000, 4500]);
  assert.strictEqual(clock.pause('turn').elapsedMs, 2500);
});

test('PlayerApi sends the same semantic commands to host and auto adapters', function () {
  var session = sessionModule.createGameSessionApi();
  var playerApi = sessionModule.createPlayerApi(session);

  function adapter() {
    var state = { fouls: 0, nominees: [] };
    return {
      state: state,
      addFoul: function () {
        state.fouls++;
        return true;
      },
      toggleNominee: function (command) {
        var index = state.nominees.indexOf(command.playerId);
        if (index === -1) state.nominees.push(command.playerId);
        else state.nominees.splice(index, 1);
        return true;
      },
    };
  }

  var host = adapter();
  var auto = adapter();
  session.registerMode('host', host);
  session.registerMode('auto', auto);
  ['host', 'auto'].forEach(function (mode) {
    playerApi.addFoul(mode, 3);
    playerApi.toggleNominee(mode, 3);
  });
  assert.deepStrictEqual(host.state, auto.state);
});

test('VoteApi owns pool limits, casting and round resolution', function () {
  var round = voteApi.createRound([2, 5], 7, false);
  voteApi.cast(round, 0, 4);
  voteApi.cast(round, 1, 3);
  assert.strictEqual(voteApi.maxVotesFor(round, 0), 4);
  assert.deepStrictEqual(voteApi.resolve(round), { status: 'hang', seatId: 2 });
});

test('PhaseMachine rejects unknown transitions', function () {
  var machine = phaseModule.createPhaseMachine();
  machine.register('game', { transitions: { day: ['night'], night: ['day'] } });
  var state = { phase: 'day' };
  machine.transition('game', state, 'night');
  assert.strictEqual(state.phase, 'night');
  assert.throws(function () {
    machine.transition('game', state, 'result');
  }, /Invalid phase transition/);
});

test('NightActionRegistry isolates host and auto policies for the same role', function () {
  var registry = nightModule.createNightActionRegistry();
  registry.register('don', { key: 'auto-don' }, 'auto');
  registry.register('don', { key: 'host-don' }, 'host');
  assert.strictEqual(registry.get('don', { mode: 'auto' }).key, 'auto-don');
  assert.strictEqual(registry.get('don', { mode: 'host' }).key, 'host-don');
});

test('AudioDirector deduplicates phase cues and centralizes stage changes', function () {
  var calls = [];
  var director = audioModule.createAudioDirector();
  director.registerMode('auto', {
    routes: { reveal: { key: 'cards' }, night: { key: 'cards' } },
    play: function (cue) {
      calls.push('play:' + cue.key);
    },
    setStage: function (stage) {
      calls.push('stage:' + stage);
    },
  });
  director.enter('auto', 'reveal');
  director.enter('auto', 'night');
  director.setStage('auto', 'ambient');
  assert.deepStrictEqual(calls, ['play:cards', 'stage:ambient']);
});

console.log('Architecture contracts passed');
