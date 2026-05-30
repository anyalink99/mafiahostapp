// Smoke-тест реконструкции голосований из MU Process в наш gameLog.
// Запуск:
//   node tests/test-mu-vote-roundtrip.cjs
// или:
//   npm test
//
// Проверяет, что MuVoteReconstruct.buildVoteEvents правильно расщепляет
// последовательность entries MU Process на логические раунды и эмитит
// правильные события для нашего gameLog (vote_tie / vote_hang /
// vote_no_elimination / vote_raise_all + vote_hang viaRaiseAll).

'use strict';

var path = require('path');
var fs = require('fs');
var assert = require('assert');

var VR = require(path.join(__dirname, '..', 'js', 'mu-vote-reconstruct.js'));

var failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
  } catch (e) {
    failures++;
    console.log('  ✗ ' + name + '\n    ' + (e.stack || e.message));
  }
}

function loadFixture(name) {
  var p = path.join(__dirname, 'fixtures', name);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

console.log('mu-vote-reconstruct');

test('пустой массив → нет событий', function () {
  assert.deepStrictEqual(VR.buildVoteEvents([], 0), []);
  assert.deepStrictEqual(VR.buildVoteEvents(null, 0), []);
});

test('одиночное казнение → один vote_hang', function () {
  var events = VR.buildVoteEvents([
    { candidates: [{ playerNumber: 3, votesCount: 5 }], playersGone: [3] },
  ], 1000);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'vote_hang');
  assert.deepStrictEqual(events[0].eliminatedIds, [3]);
  assert.strictEqual(events[0].tieRevote, false);
  assert.strictEqual(events[0].viaRaiseAll, false);
});

test('ничья + revote + единичная казнь → 2× vote_tie + vote_hang', function () {
  var events = VR.buildVoteEvents([
    { candidates: [{ playerNumber: 1, votesCount: 5 }, { playerNumber: 2, votesCount: 5 }] },
    { candidates: [{ playerNumber: 1, votesCount: 5 }, { playerNumber: 2, votesCount: 5 }] },
    { candidates: [{ playerNumber: 1, votesCount: 8 }, { playerNumber: 2, votesCount: 2 }], playersGone: [1] },
  ], 1000);
  // Раунд один: 2 ничьи + казнь. Эмиттер ставит ничьи + последний hang.
  // Логика: третий entry с PlayersGone:[1] — single, его cands [1,2] — subset
  // [1,2], значит он остаётся в текущем раунде. Получается 3 entries в раунде:
  // 2 vote_tie (isRevote=false, true) + 1 vote_hang.
  assert.strictEqual(events.length, 3);
  assert.strictEqual(events[0].type, 'vote_tie');
  assert.strictEqual(events[0].isRevote, false);
  assert.strictEqual(events[1].type, 'vote_tie');
  assert.strictEqual(events[1].isRevote, true);
  assert.strictEqual(events[2].type, 'vote_hang');
  assert.deepStrictEqual(events[2].eliminatedIds, [1]);
  assert.strictEqual(events[2].tieRevote, true);
});

test('Игра 36: 2 раунда (оставили 1,2 + Подняли 4,5)', function () {
  var fx = loadFixture('mu-process-game36.json');
  var events = VR.buildVoteEvents(fx.votings, 1000);

  // День 1: vote_tie + vote_tie(isRevote) + vote_no_elimination → 3 events
  // День 2: vote_tie + vote_tie(isRevote) + vote_raise_all + vote_hang(viaRaiseAll) → 4 events
  // Итого 7 событий.
  assert.strictEqual(events.length, 7);

  // --- Раунд 1 ---
  assert.strictEqual(events[0].type, 'vote_tie');
  assert.deepStrictEqual(events[0].candidateIds, [1, 2]);
  assert.deepStrictEqual(events[0].tiedIds, [1, 2]);
  assert.strictEqual(events[0].isRevote, false);

  assert.strictEqual(events[1].type, 'vote_tie');
  assert.deepStrictEqual(events[1].candidateIds, [1, 2]);
  assert.strictEqual(events[1].isRevote, true);

  assert.strictEqual(events[2].type, 'vote_no_elimination');
  assert.deepStrictEqual(events[2].tiedIds, [1, 2]);

  // --- Раунд 2 ---
  assert.strictEqual(events[3].type, 'vote_tie');
  assert.deepStrictEqual(events[3].candidateIds, [4, 5]);
  assert.strictEqual(events[3].isRevote, false);

  assert.strictEqual(events[4].type, 'vote_tie');
  assert.deepStrictEqual(events[4].candidateIds, [4, 5]);
  assert.strictEqual(events[4].isRevote, true);

  assert.strictEqual(events[5].type, 'vote_raise_all');
  assert.deepStrictEqual(events[5].tiedIds, [4, 5]);
  assert.strictEqual(events[5].poolTotal, 10); // 5+5 из последней ничьи

  assert.strictEqual(events[6].type, 'vote_hang');
  assert.strictEqual(events[6].viaRaiseAll, true);
  assert.strictEqual(events[6].tieRevote, true);
  assert.deepStrictEqual(events[6].eliminatedIds, [4, 5]);
});

test('groupRounds: tie с разными candidates → разные раунды', function () {
  var rounds = VR.groupRounds([
    { cands: [1, 2], votes: [5, 5], pg: [] },
    { cands: [3, 4], votes: [4, 4], pg: [] },
  ]);
  assert.strictEqual(rounds.length, 2);
  assert.strictEqual(rounds[0].type, 'no_elimination');
  assert.strictEqual(rounds[1].type, 'no_elimination');
});

test('groupRounds: tie + subset tie → один раунд (revote)', function () {
  var rounds = VR.groupRounds([
    { cands: [1, 2, 3], votes: [3, 3, 3], pg: [] },
    { cands: [1, 2], votes: [4, 4], pg: [] },
  ]);
  assert.strictEqual(rounds.length, 1);
  assert.strictEqual(rounds[0].entries.length, 2);
});

test('findTied: одиночный максимум', function () {
  assert.deepStrictEqual(VR.findTied([1, 2, 3], [5, 3, 1]), [1]);
});
test('findTied: ничья', function () {
  assert.deepStrictEqual(VR.findTied([1, 2, 3], [5, 5, 2]), [1, 2]);
});
test('findTied: все нули → пустой массив', function () {
  assert.deepStrictEqual(VR.findTied([1, 2], [0, 0]), []);
});

test('canonVotings: одинаковая структура → одинаковая строка', function () {
  var a = [{ candidates: [{ playerNumber: 1, votesCount: 5 }] }];
  var b = [{ candidates: [{ playerNumber: 1, votesCount: 5 }] }];
  assert.strictEqual(VR.canonVotings(a), VR.canonVotings(b));
});
test('canonVotings: разные votesCount → разные строки', function () {
  var a = [{ candidates: [{ playerNumber: 1, votesCount: 5 }] }];
  var b = [{ candidates: [{ playerNumber: 1, votesCount: 6 }] }];
  assert.notStrictEqual(VR.canonVotings(a), VR.canonVotings(b));
});

console.log('');
if (failures > 0) {
  console.log(failures + ' тест(ов) упало');
  process.exit(1);
} else {
  console.log('Все тесты прошли');
}
