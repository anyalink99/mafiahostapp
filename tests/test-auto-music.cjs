'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var source = fs.readFileSync(path.join(__dirname, '..', 'js', 'modes', 'auto', 'music.js'), 'utf8');
var calls = [];
var navigationListener = null;
var currentSlot = null;
var active = false;
var hasSource = true;
var now = 1000;
var app = {
  _auto: { INTRO_PRE_SEC: 10 },
  _autoEphemeral: {},
  onNavigated: function (fn) {
    navigationListener = fn;
  },
  musicGetSlotPlayablePool: function () {
    return hasSource ? [{ id: 'track' }] : [];
  },
  musicStartSlot: function (slot, opts) {
    currentSlot = String(slot);
    active = true;
    calls.push('start:' + slot + ':' + (opts && opts.intro ? 'intro' : 'normal'));
  },
  stopMusic: function () {
    calls.push('stop');
    currentSlot = null;
    active = false;
  },
  musicSetSessionVolumeMul: function (mul) {
    calls.push('volume:' + (mul === null ? 'default' : mul));
  },
  getCurrentMusicSlot: function () {
    return currentSlot;
  },
  hasActiveMusicSession: function () {
    return active;
  },
  isMusicPlaying: function () {
    return active;
  },
};

vm.runInNewContext(source, {
  window: { MafiaApp: app },
  Date: {
    now: function () {
      return now;
    },
  },
});

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
  } catch (error) {
    console.error('  ✗ ' + name);
    throw error;
  }
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

console.log('auto-music');

test('раздача ролей запускает слот «Раздача карт»', function () {
  navigationListener('auto-reveal-screen');
  assert(calls.join('|') === 'volume:default|start:1:normal', calls.join('|'));
});

test('переходы внутри обычной ночи не перезапускают трек', function () {
  navigationListener('auto-night-pass-screen');
  navigationListener('auto-night-action-screen');
  navigationListener('auto-night-result-screen');
  assert(
    calls.filter(function (entry) {
      return entry.indexOf('start:1') === 0;
    }).length === 1,
    calls.join('|')
  );
});

test('ночь знакомства переключается на intro слота 2', function () {
  now += 6000;
  navigationListener('auto-night-intro-screen');
  assert(calls[calls.length - 1] === 'start:2:intro', calls.join('|'));
});

test('договорка и свободная посадка используют разные уровни сессии', function () {
  app._auto.setAutoIntroMusicStage('main');
  app._auto.setAutoIntroMusicStage('ambient');
  assert(calls.slice(-2).join('|') === 'volume:default|volume:0.5', calls.join('|'));
});

test('дневной экран останавливает только автофон', function () {
  navigationListener('auto-day-screen');
  assert(calls[calls.length - 1] === 'stop', calls.join('|'));
  navigationListener('auto-day-screen');
  assert(
    calls.filter(function (entry) {
      return entry === 'stop';
    }).length === 1,
    calls.join('|')
  );
});

test('пустой музыкальный слот не открывает модалку и не создаёт сессию', function () {
  hasSource = false;
  navigationListener('auto-reveal-screen');
  assert(app._autoEphemeral.autoMusicActive !== true, 'auto music marked active');
  assert(calls[calls.length - 1] === 'stop', calls.join('|'));
});

console.log('Все тесты auto-music прошли');
