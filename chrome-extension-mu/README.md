# Mafia Host on MafiaUniverse

Chrome-расширение, которое на странице `mafiauniverse.org/Games/Edit` подменяет
интерфейс редактирования игры на UI приложения **Mafia Host**, а потом
переносит данные обратно в их форму одной кнопкой.

В расширении два режима:

- **MU-режим (основной).** На `/Games/Edit` поверх страницы открывается оверлей
  с iframe нашего приложения. Внутри iframe — обычный Mafia Host, плюс
  специфичные для MU фичи:
  - Автокомплит ника игрока и ведущего из базы MafiaUniverse — выпадайка с
    аватаркой и клубом, поиск через их же `/Players/Search/`.
  - Двусторонний sync state ↔ форма при каждом переключении интерфейса
    («Показать форму MU» / «Вернуться в Mafia Host»). При первой загрузке
    содержимое уже сохранённой игры подтягивается в наш UI.
  - Кнопка «Применить к форме MafiaUniverse» на экране Итоги — заполняет
    их скрытую форму, прячет iframe, показывает их UI с данными и баннером
    «проверьте и нажмите Сохранить».
  - Авто-привязка ника к учётке: если ник выбран из автокомплита, в форму
    уходит `PlayerId` — после Apply не надо руками тыкать в выпадайки сайта.
- **Popup-режим (fallback).** Иконка расширения открывает textarea, куда можно
  вставить JSON, скопированный кнопкой «Скопировать MU JSON» из standalone-
  версии. Удобно, когда игру вели на телефоне или без подключения к MU.

## Установка

```bash
git clone https://github.com/anyalink99/mafiahostapp.git
cd mafiahostapp
npm install
npm run build:extension
```

`npm run build:extension` копирует `index.html` + `js/` + `css/` + `icons/` +
`audio/` в `chrome-extension-mu/app/` и патчит index.html на локальный
Tailwind bundle (CSP MV3 запрещает внешние CDN).

Затем:

1. `chrome://extensions` (или `edge://extensions`) → включить **Developer mode**.
2. **Load unpacked** → выбрать папку `chrome-extension-mu/`.
3. Залогиниться на mafiauniverse.org.
4. Перейти на `https://mafiauniverse.org/Games/Edit?...` — увидите оверлей.

**После любых правок исходников** запускайте `npm run build:extension`
(копия в `app/` обновится) и нажимайте **Reload** на расширении.
Правки в самих файлах расширения (`content.js`, `mu-form-io.js`, `inject.css`,
`popup.*`, `manifest.json`, `build-app.cjs`) rebuild **не требуют** — только
Reload расширения.

## Использование — MU-режим

1. Открыть `/Games/Edit?...` нужного турнира.
2. В оверлее Mafia Host идёт обычный путь: Подготовка → раздача ролей → игра
   → итоги. В полях ника начинайте вводить — снизу выпадает автокомплит из
   базы MU (стрелки/Enter/клик).
3. На экране Итоги — **«Применить к форме MafiaUniverse»**.
4. Оверлей закроется, появится их форма с заполненными полями + баннер
   «Данные применены». Проверьте, нажмите их «Сохранить».
5. Вернуться в Mafia Host — кнопка в правом нижнем углу.

## Использование — popup-режим

1. В standalone Mafia Host на экране Итоги → «Скопировать MU JSON».
2. На `/Games/Edit?...` сначала «Показать форму MU», потом иконка расширения
   → «Вставить» → «Заполнить форму».

## Что подставляется в форму MU

- Шапка: `DateOfGame`, `Leading_Name`, `LeadingId` (если привязан), `GameWinnerId`,
  `ScoreCoefficient`.
- Для каждой из 10 позиций: `NickName`, `PlayerId` (если из автокомплита),
  `GameRoleId` (1=Мирный, 2=Шериф, 3=Мафия, 4=Дон), `Foul` (hidden + видимый
  span обновляется), `KilledFirst`, `BestMove`, `BonusScore`, `PenaltyScore`,
  `TechPenaltyScore`. Свободный ник → text-light + `PlayerId=""`; привязанный
  → text-black + `PlayerId=<id>` (как делают они сами в `select`-обработчике).
- Голосования в скрытое `#Process` — массив `[{VotingId, VotingStrings, PlayersGone?}]`.
  Реконструкция раундов из нашего gameLog: ничьи переголосования → несколько
  entries подряд с теми же кандидатами, казнь → entry с `PlayersGone:[id]`,
  «Подняли всех» → entry с пустым `VotingStrings` + `PlayersGone:[ids]`.
- Превью голосований дорисовывается в их таблицу `#Votings` (помечаются
  `data-mu-importer="1"` чтобы не конфликтовать с их собственным рендером).

## Известные ограничения

- **Save-flow.** «Применить» только заполняет форму; кнопку их «Сохранить»
  нажимаете руками. Save через MU API требует `__RequestVerificationToken` и
  обратной обработки `PlayersGone` — отложен.
- **`TableOfCurrentVoting`** (виджет активного раунда) не наполняется. На
  результат сохранения не влияет — источник правды для них поле `#Process`.
- **Ничья** не моделируется в нашем приложении — поле «Победа» при roundtrip
  может остаться пустым.

## Архитектура

```
chrome-extension-mu/
  manifest.json    # MV3: content_scripts (mu-form-io.js + content.js) + web_accessible_resources для app/
  mu-form-io.js    # Низкоуровневая работа с формой MU: fillForm/readFormToMUJson + MU API
                   #   (searchPlayers, getLastTournamentGame). Экспорт через window.MuFormIO.
  content.js       # Overlay/iframe, postMessage proxy между iframe и формой/MU API,
                   #   двусторонний sync state↔form, баннер, плавающая кнопка возврата.
  inject.css       # Стили оверлея и баннера.
  popup.html/.js   # Fallback-режим с textarea (вне MU-режима).
  app/             # КОПИЯ нашего приложения (создаётся `npm run build:extension`).
                   # В iframe загружается app/index.html?mu=1.
  build-app.cjs    # Скрипт копирования + патч tailwind CDN.
```

В нашем приложении (`../index.html` + `../js/`) интеграционные модули:

- [`js/mu-utils.js`](../js/mu-utils.js) — общие хелперы (escapeHtml, byId,
  parseIntOr) для всех MU-модулей.
- [`js/mu-bridge.js`](../js/mu-bridge.js) — детектит iframe-в-расширении
  (`chrome-extension:` + `?mu=1`), публикует `app.MU` с методами
  `searchPlayers`/`applyToForm`/`showOriginalForm`/`getLastGamePlayers`.
  Под капотом — postMessage к content.js + handlers dictionary для входящих
  сообщений.
- [`js/mu-autocomplete.js`](../js/mu-autocomplete.js) — виджет автокомплита
  с аватарками, плюс bootstrap — автоматически вешается на `#modal-player-nick`,
  `#modal-summary-nick`, `#modal-auto-player-nick`, `#summary-host-name`.
  Хранит выбранные привязки в `app.muPlayerIdByNick` / `app.muMetaByNick`.
- [`js/mu-state-apply.js`](../js/mu-state-apply.js) — обратный sync формы →
  state приложения (form→app при возврате в Mafia Host). Внутри —
  реконструкция голосований из MU `Process` в наш gameLog (single / raise_all
  / no_elimination с учётом переголосований).
- [`js/summary/mu-export.js`](../js/summary/mu-export.js) — собирает MU JSON
  из текущего state приложения (state→form при Apply или ручном popup-flow).

Поток MU-режима: `iframe (наш UI) ←postMessage→ content.js на MU ←fetch→ MU API/форма`.

## Тесты

`tests/test-mu-vote-roundtrip.cjs` — Node smoke-test реконструкции голосований
из MU Process. Запуск:

```bash
node tests/test-mu-vote-roundtrip.cjs
```

Использует фикстуру из реальной сохранённой игры (`tests/fixtures/mu-process-game36.json`).
Проверяет что `groupProcessEntriesIntoRounds` корректно расщепляет
последовательные tie+revote+resolution на логические раунды.
