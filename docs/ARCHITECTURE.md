# Архитектура Mafia Host: целевое состояние и миграция

## Статус реализации

Первый архитектурный контур реализован. Это не пустые фасады: production-пути host и auto уже проходят через общие контракты.

| Граница                    | Реализация                         | Где используется                                                                              |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Storage / Settings         | `js/core/storage.js`               | Все обращения прикладного кода к `localStorage`, включая музыку, голос, Spotify, MU и историю |
| GameRepository             | `js/core/storage.js`               | Версионированные host/auto snapshots, восстановление истории, последовательные миграции       |
| ClockApi                   | `js/core/clock.js`                 | Host-таймер, день, последние слова, показ роли, ночной секундомер, intro и лучший ход         |
| GameSessionApi / PlayerApi | `js/game/session-api.js`           | Фолы, выставления, выбывание и псевдонимы через адаптеры host/auto                            |
| VoteApi                    | `js/game/vote-api.js`              | Создание раунда, лимит пула, ввод голоса и исход в обоих режимах                              |
| PhaseMachine               | `js/game/phase-machine.js`         | Все рабочие переходы `autoState.phase`                                                        |
| NightActionRegistry        | `js/game/night-action-registry.js` | Ролевые экраны auto и метаданные городских ночных действий host                               |
| AudioDirector              | `js/audio/audio-director.js`       | Маршрутизация музыки авторежима и уровни договорки/свободной посадки                          |

Контракты тестируются без DOM в `tests/test-architecture.cjs`. Старые публичные функции пока сохранены как слой совместимости: адаптеры вызывают проверенную существующую доменную мутацию, а общий UI (`playerTable`) уже обращается к `PlayerApi`.

## Что уже является хорошим фундаментом

- `rolesApi` атомарно управляет раздачей и не даёт UI напрямую менять завершённую колоду.
- Реестр вариантов (`game/variants.js`) отделяет составы и особенности правил от экранов.
- Чистые правила голосования (`game/vote-rules.js`) тестируются без DOM.
- `playerTable` даёт host/auto общий рендер и жесты игрового стола.
- Реестры экранов, навигационных guard-ов и модальных interceptor-ов заменяют неявные monkey patch.
- Музыка, PWA, MU и Capacitor могут быть оформлены как платформенные адаптеры, не затрагивая правила игры.

Цель дальнейшей работы — развивать эти контракты, не переписывая приложение одним большим релизом.

## Целевая схема

```text
UI (экраны, модалки, жесты)
            │ команды / read models
            ▼
Application API (GameSession, Prepare, History)
            │
            ▼
Domain (roles, players, vote, night, variants, phase machine)
            │ события / effects
            ▼
Platform adapters (Storage, Clock, Audio, PWA, MU, Capacitor)
```

Правило границ: UI не меняет игровое состояние, `localStorage` или аудио напрямую. Он отправляет команду API и заново получает готовую модель для отображения.

## Реализованные API и направление их развития

### 1. `SettingsRepository`

Настройки из `voice.js`, `timer.js`, `player-data.js`, `music-store.js`, `spotify-auth.js`, `mu-bridge.js` и `auto/core.js` читаются и пишутся через единый репозиторий.

Контракт:

```js
settings.getNumber('mafia_host_timer_main_sec', 60);
settings.setBoolean('mafia_player_protocol_visible', false);
settings.subscribe('mafia_host_music', renderAudioSettings);
```

Внутри: один namespace, schema version, миграции, валидация и обработка недоступного storage. Это самый безопасный первый шаг.

### 2. `GameSessionApi`

Единый владелец партии вместо параллельных `app.players`, `gameLog`, `autoState` и множества публичных массивов.

```js
session.dispatch({ type: 'PLAYER_FOUL_ADDED', playerId: 3 });
session.dispatch({ type: 'PLAYER_ELIMINATED', playerId: 7, reason: 'shot' });
session.getPlayer(3);
session.getTableView();
session.snapshot();
```

Host и auto становятся контроллерами одной сессии. Отличается способ ввода действий, но не правила фолов, выбываний, выставлений и журналирования.

### 3. `PlayerApi`

Первый срез `GameSessionApi`, который можно внедрить отдельно:

- псевдоним;
- фолы и дисквалификация;
- жив/выбыл и причина;
- выставление;
- роль и публичная видимость роли.

Один вызов должен атомарно менять игрока, журнал и очередь голосования. Тогда desktop panel, host modal и auto modal перестанут дублировать мутации.

### 4. `VoteApi`

`vote-rules.js` решает чистую математику, а `VoteApi` владеет общей механикой раунда:

```js
const round = vote.createRound(candidateIds, poolTotal, isRevote);
vote.cast(round, candidateIndex, count);
vote.resolve(round); // hang | revote | raiseAll
```

Host и auto используют один API и разные представления. История голосований формируется внутри, а не восстанавливается постфактум из UI-состояния.

### 5. `PhaseMachine`

Переходы `prepare → reveal → intro → night → day → vote → result` описываются таблицей допустимых состояний и guard-ов.

Каждый переход:

- проверяет предусловия;
- сохраняет snapshot;
- возвращает список effects (`PLAY_AUDIO`, `NAVIGATE`, `START_CLOCK`);
- идемпотентен при повторном вызове.

Это устранит переходы, которые сегодня распределены между renderer-ами, обработчиками и таймерами.

### 6. `NightActionRegistry`

Ночные роли описываются данными варианта, а не ветвлениями отдельно в host/auto:

```js
{
  role: 'sheriff',
  order: 30,
  targets: 'alive-except-self',
  resolve: resolveSheriffCheck
}
```

UI спрашивает registry, какие действия и цели доступны. Добавление Доктора, Красотки или нового варианта не требует новой копии ночного flow.

### 7. `ClockApi` и `AudioDirector`

Все таймеры получают инъецируемые часы:

```js
clock.start('night-turn', { duration: 7, mode: 'stopwatch' });
clock.subscribe('night-turn', render);
```

В тестах используется fake clock без реального ожидания. `AudioDirector` подписывается на phase/effects и единолично решает, что играть, приглушать или останавливать.

### 8. `GameRepository`

Snapshot партии получает:

- `schemaVersion`;
- последовательные миграции `v1 → v2 → v3`;
- атомарную запись;
- проверку целостности;
- экспорт/импорт;
- отдельные namespaces для текущей партии, истории и настроек.

`localStorage` можно оставить первым адаптером. IndexedDB понадобится только при росте истории и медиа, а не ради самой архитектуры.

## Как мигрировать без большого переписывания

1. Завести новый API поверх текущего состояния.
2. Перевести на него один законченный пользовательский путь.
3. Запретить новые прямые мутации этого участка.
4. Добавить contract-тесты и миграцию сохранений.
5. Удалить старый путь только после перевода host и auto.

Рекомендуемый порядок релизов:

1. `SettingsRepository`.
2. `PlayerApi` для фолов/выбываний/выставлений.
3. `VoteApi`.
4. `GameRepository` и schema migrations.
5. `PhaseMachine`.
6. `NightActionRegistry`.
7. `ClockApi` + `AudioDirector`.
8. Объединение host/auto вокруг единого `GameSessionApi`.

## Definition of done для нового API

- Только модуль-владелец мутирует свои данные.
- Каждая команда валидируется и возвращает явный результат.
- Повтор команды безопасен либо имеет idempotency key.
- DOM, `localStorage`, `Date.now()` и `Audio` не используются внутри чистого domain.
- Есть unit-тесты контракта и browser-тест критического пользовательского пути.
- Сохранённые партии предыдущей версии продолжают открываться.
- Публичные методы документированы JSDoc-типами; TypeScript можно вводить постепенно через `checkJs`, без смены runtime.

Главный анти-паттерн, которого следует избегать: создавать еще одну «улучшенную» копию host или auto. Новая функциональность должна появляться в общем domain/application API, а режимы должны отличаться только экраном и источником команд.
