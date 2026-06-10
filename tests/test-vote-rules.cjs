'use strict';
// Тесты чистой логики исхода голосования (js/game/vote-rules.js).
// Запуск: node tests/test-vote-rules.cjs (входит в npm test)

var VR = require('../js/game/vote-rules.js');

var failures = 0;
function check(name, actual, expected) {
  var a = JSON.stringify(actual);
  var e = JSON.stringify(expected);
  if (a === e) {
    console.log('  ✓ ' + name);
  } else {
    failures++;
    console.error('  ✗ ' + name + '\n    ожидалось: ' + e + '\n    получено:  ' + a);
  }
}

function resolve(cands, votes, pool, isRevote) {
  // votes копируем: resolveVoteRound мутирует массив (авто-нули).
  return VR.resolveVoteRound(cands.slice(), votes.slice(), pool, isRevote);
}

console.log('Базовые исходы:');
check('не все позиции заполнены → pending', resolve([1, 2], [5, null], 10, false), {
  status: 'pending',
});
check('единоличный лидер → казнь', resolve([1, 2], [6, 4], 10, false), {
  status: 'hang',
  seatId: 1,
});
check(
  'исчерпанный пул дозаполняет нулями и казнит лидера',
  resolve([1, 2, 3], [6, 4, null], 10, false),
  { status: 'hang', seatId: 1 }
);
check(
  'нулевой остаток пула: 5/5 и третий null → ничья двоих',
  resolve([1, 2, 3], [5, 5, null], 10, false),
  {
    status: 'revote',
    tied: [1, 2],
  }
);

console.log('Классика 5/5:');
check('первое голосование 5/5 → переголосование, НЕ подъём', resolve([3, 7], [5, 5], 10, false), {
  status: 'revote',
  tied: [3, 7],
});
check('переголосование 5/5 теми же двумя → подъём (повтор)', resolve([3, 7], [5, 5], 10, true), {
  status: 'raiseAll',
  tied: [3, 7],
});

console.log('Креативный попил 3/3/3/1 (пример из правил):');
check(
  'четверо, 3/3/3/1 → переголосование между тремя',
  resolve([1, 4, 6, 9], [3, 3, 3, 1], 10, false),
  {
    status: 'revote',
    tied: [1, 4, 6],
  }
);
check(
  'трое (уже переголосование), 5/5/0 → состав ИЗМЕНИЛСЯ → новый цикл двоих, НЕ подъём',
  resolve([1, 4, 6], [5, 5, 0], 10, true),
  { status: 'revote', tied: [1, 4] }
);
check('двое (переголосование), снова 5/5 → повтор → подъём', resolve([1, 4], [5, 5], 10, true), {
  status: 'raiseAll',
  tied: [1, 4],
});
check('двое (переголосование), 6/4 → казнь, подъёма нет', resolve([1, 4], [6, 4], 10, true), {
  status: 'hang',
  seatId: 1,
});

console.log('Повтор всем составом:');
check(
  'трое (переголосование), 3/3/3 теми же тремя → подъём всех',
  resolve([2, 5, 8], [3, 3, 3], 9, true),
  { status: 'raiseAll', tied: [2, 5, 8] }
);
check(
  'первое голосование троих 3/3/3 → переголосование (не повтор)',
  resolve([2, 5, 8], [3, 3, 3], 9, false),
  { status: 'revote', tied: [2, 5, 8] }
);

console.log('Длинная цепочка сужений 10 → 5 → 3 → 2 → 2:');
var ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
check(
  'десять кандидатов, лидируют пятеро → переголосование пятерых',
  resolve(ten, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10, false),
  { status: 'revote', tied: ten }
);
check(
  'пятеро (переголосование), 2/2/2/2/2 теми же → подъём',
  resolve([1, 2, 3, 4, 5], [2, 2, 2, 2, 2], 10, true),
  { status: 'raiseAll', tied: [1, 2, 3, 4, 5] }
);
check(
  'пятеро (переголосование), 3/3/3/1/0 → новый цикл троих',
  resolve([1, 2, 3, 4, 5], [3, 3, 3, 1, 0], 10, true),
  { status: 'revote', tied: [1, 2, 3] }
);
check('трое (переголосование), 4/4/2 → новый цикл двоих', resolve([1, 2, 3], [4, 4, 2], 10, true), {
  status: 'revote',
  tied: [1, 2],
});
check('двое (переголосование), 5/5 → подъём', resolve([1, 2], [5, 5], 10, true), {
  status: 'raiseAll',
  tied: [1, 2],
});

console.log('fillZeroesIfPoolExhausted:');
check('пул не исчерпан — null остаются', VR.fillZeroesIfPoolExhausted([4, null, 2], 10), [
  4,
  null,
  2,
]);
check('пул исчерпан — null → 0', VR.fillZeroesIfPoolExhausted([6, null, 4], 10), [6, 0, 4]);

if (failures) {
  console.error('\nПровалено проверок: ' + failures);
  process.exit(1);
}
console.log('\nВсе тесты vote-rules прошли');
