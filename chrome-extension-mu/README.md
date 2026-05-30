# Mafia Host on MafiaUniverse

Chrome-расширение, которое на странице `mafiauniverse.org/Games/Edit` подменяет
их интерфейс редактирования игры на UI приложения **Mafia Host**, а потом
переносит данные обратно в их форму одной кнопкой.

В расширении есть **два режима** работы:

- **MU-режим (основной).** На `/Games/Edit` поверх страницы открывается оверлей
  с iframe нашего приложения. Внутри iframe — обычный Mafia Host: те же
  экраны (Меню → Подготовка → Игра → Итоги), та же логика. Плюс
  доступны фичи, которых нет в standalone-версии:
  - **Автокомплит ника игрока и ведущего из базы MafiaUniverse** —
    выпадайка с аватаркой и клубом, поиск через их же `/Players/Search/`.
  - **Кнопка «Применить к форме MafiaUniverse»** на экране Итоги —
    заполняет их скрытую форму, прячет iframe, показывает их UI с
    данными и баннером «проверьте и нажмите Сохранить».
  - **Авто-привязка ника к учётке.** Если ник выбран из автокомплита,
    в форму уходит `PlayerId` — больше не надо после Apply руками
    тыкать в выпадайки сайта.
- **Popup-режим (fallback).** Иконка расширения открывает текстовое окошко
  с textarea, куда можно вставить JSON, скопированный кнопкой
  «Скопировать MU JSON» из standalone-версии приложения. Удобно, когда
  игру вели не через MU-режим, а в обычном приложении или на телефоне.

## Установка

```bash
git clone https://github.com/anyalink99/mafiahostapp.git
cd mafiahostapp
npm install            # ставит dev-зависимости (для cap, но не помешает)
npm run build:extension  # копирует index.html + js/ + css/ + icons/ + audio/ в chrome-extension-mu/app/
```

Затем:

1. Откройте `chrome://extensions` (или `edge://extensions`).
2. Включите **Developer mode** (правый верхний угол).
3. **Load unpacked** → выберите папку `chrome-extension-mu/`.
4. Залогиньтесь на mafiauniverse.org.
5. Перейдите на любую страницу `https://mafiauniverse.org/Games/Edit?...` —
   увидите оверлей с нашим UI поверх их страницы.

После любого изменения кода в нашем приложении нужно перезапустить `npm run build:extension`
и нажать **Reload** на расширении в `chrome://extensions`.

## Использование — MU-режим

1. Откройте `/Games/Edit?...` нужного турнира.
2. В оверлее Mafia Host идёт обычный путь: «Подготовка» → раздача ролей →
   игра → итоги. В полях ника игрока и ведущего начинайте вводить ник —
   снизу появится выпадайка с никами из базы MU. Выбор кликом / стрелками + Enter.
3. На экране Итоги нажмите **«Применить к форме MafiaUniverse»**.
4. Оверлей закроется, появится их форма с заполненными полями и баннером
   «Данные применены». Проверьте всё глазами, нажмите их кнопку «Сохранить».
5. Если нужно вернуться в Mafia Host — кнопка «Вернуться в Mafia Host»
   в правом нижнем углу страницы.

## Использование — popup-режим

1. В standalone-приложении Mafia Host (открытом в браузере или на телефоне)
   на экране Итоги нажмите **«Скопировать MU JSON»**.
2. Откройте `/Games/Edit?...`, выйдите из MU-режима (кнопка «Показать форму MU»).
3. Кликните по иконке расширения, нажмите **«Вставить»**, затем **«Заполнить форму»**.

## Что подставляется в форму MU

- Дата игры (`DateOfGame`)
- Ведущий (если ник выбран из автокомплита — с привязкой к учётке)
- Победитель (`GameWinnerId`)
- Коэффициент игры (`ScoreCoefficient`)
- Для каждой из 10 позиций:
  - Никнейм текстом (`PlayerName_i`, `NickName`)
  - `PlayerId` — если ник был выбран из автокомплита
  - Роль (`GameRoleId`: 1=Мирный, 2=Шериф, 3=Мафия, 4=Дон)
  - Фолы (`Foul`, hidden)
  - Первый отстрел (`KilledFirst`, hidden)
  - Лучший ход (`BestMove`)
  - Доп. баллы плюс/минус (`BonusScore`, `PenaltyScore`)
  - Технический штраф (`TechPenaltyScore`)
- Голосования — пишутся в скрытое поле `Process`
  как массив `[{VotingId, VotingStrings:[{PlayerNumber, VotesCount}]}]`,
  и в превью-таблицу «Результаты голосований» внизу страницы.

## Известные ограничения

- **Сохранение пока не делается из нашего UI.** «Применить» только заполняет
  их форму; кнопку их «Сохранить» нужно нажимать руками. Это сознательное
  решение для v0.2 — пока не доковыряем save-flow (нужен `__RequestVerificationToken`,
  правила `PlayersGone` в `Process`).
- **`TableOfCurrentVoting` не перерисовывается** — это виджет активного раунда
  голосования. На итог это не влияет (источник правды — поле `Process`),
  но визуально в нём пусто.
- **Не поддерживается ничья** — наше приложение не различает ничью;
  поле «Победа» останется пустым.

## Архитектура

```
chrome-extension-mu/
  manifest.json          # MV3: content script + inject.css на /Games/Edit, web_accessible_resources для app/
  content.js             # Скрипты на стороне MU: оверлей с iframe, postMessage-прокси к MU API, fillForm
  inject.css             # Стили оверлея и баннера
  popup.html, popup.js   # Fallback-режим с textarea
  app/                   # КОПИЯ нашего приложения (создаётся `npm run build:extension`)
  build-app.cjs          # Скрипт копирования
```

В нашем приложении ([../index.html](../index.html) + [../js/](../js/)) есть три
файла, которые отвечают за интеграцию с расширением:

- [js/mu-bridge.js](../js/mu-bridge.js) — детектит, что мы в iframe внутри
  расширения (по `location.protocol === 'chrome-extension:'` + `?mu=1` в URL),
  открывает `app.MU` с методами `searchPlayers`, `applyToForm`, `showOriginalForm`,
  `getLastGamePlayers`. Под капотом — postMessage к content-script.
- [js/mu-autocomplete.js](../js/mu-autocomplete.js) — виджет автокомплита плюс
  bootstrap: автоматически вешается на `#modal-player-nick`, `#modal-summary-nick`,
  `#modal-auto-player-nick`, `#summary-host-name`. Хранит выбранные привязки
  в `app.muPlayerIdByNick`.
- [js/summary/mu-export.js](../js/summary/mu-export.js) — собирает MU JSON,
  включая `playerId` из `muPlayerIdByNick`. Этот же JSON летит и в popup-flow,
  и в MU-режиме через Apply.

Поток MU-режима: `iframe (наш UI) ←postMessage→ content.js на mafiauniverse.org ←fetch→ MU API + их форма`.
