# Мафия — Ведущий

Веб-приложение для ведущего классической «Мафии» на 10 игроков: раздача и показ ролей, таймер обсуждения, фолы и очередь голосования, фоновая музыка по режимам, сохранение состояния в браузере. Можно установить как **PWA** или собрать **Android** через [Capacitor](https://capacitorjs.com) 8.

## Возможности

- Главное меню, сброс партии, переход к столу без повторной раздачи
- Экран карт: случайная перетасовка ролей, открытие роли по нажатию на карту
- Полноэкранный показ роли игроку (иконки ролей в SVG)
- Игровой стол: таймер 30/60 с, музыка (слоты «Раздача карт» / «Ночные действия»), список игроков, фолы, очередь голосования
- Настройки музыки: несколько треков на режим, случайный выбор, старт с заданной секунды, множитель громкости
- Данные игры в `localStorage`; пользовательские аудиофайлы в **IndexedDB**; встроенные треки из `audio/`

## Требования

- [Node.js](https://nodejs.org/) (LTS) — для зависимостей Capacitor и скриптов `npm`
- Локальный HTTP-сервер для полноценной работы PWA, сервис-воркера и медиа (не открывать как `file://`)
- **Windows:** для `npm run icons` нужен PowerShell (скрипт ресайза иконок)

## Быстрый старт (веб)

```bash
git clone https://github.com/anyalink99/mafia-host-app.github.io
cd mafia-host-app
npm install
npx serve .
```

Откройте в браузере выданный адрес (`http://localhost:…`).

## Скрипты npm

| Скрипт | Назначение |
|--------|------------|
| `npm run copy:www` | Копирует статику в `www/` для Capacitor |
| `npm run cap:sync` | `copy:www` + `npx cap sync` |
| `npm run icons` | Генерация `icons/icon-192.png`, `icon-512.png` и `mipmap-*` для Android из `icons/icon.png` |

## Структура репозитория

```
mafia-host-app/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── capacitor.config.json
├── package.json
├── audio/                 встроенные треки (track1.mp3, track2.mp3)
├── icons/                 icon.png (исходник) + сгенерированные PNG
├── css/styles.css
├── js/
│   ├── tailwind.config.js тема Tailwind для CDN
│   ├── state.js           состояние игры → localStorage
│   ├── music-storage.js   метаданные музыки + IndexedDB
│   ├── music.js
│   ├── screens.js
│   ├── cards.js
│   ├── game.js
│   ├── events.js
│   └── main.js
└── scripts/
    ├── copy-www.cjs
    └── generate-icons.ps1
```

Папки `www/`, `android/`, `ios/` и `node_modules/` в `.gitignore`: после клона их нужно получить командами ниже.

## PWA

После открытия по **HTTPS** или **localhost** браузер может предложить установку на главный экран.

1. Положите квадратный мастер-файл в `icons/icon.png` (желательно от 512×512).
2. На Windows: `npm run icons`.
3. При сборке под Android после смены иконок выполните `npm run cap:sync`, чтобы актуальные файлы попали в нативный проект.

Сервис-воркер **не** регистрируется в нативном приложении Capacitor (см. `js/main.js`).

## Android (Capacitor)

1. `npm install`
2. Если каталога `android/` нет: `npx cap add android`
3. `npm run copy:www`
4. `npm run cap:sync` (или отдельно `npx cap sync`)
5. `npx cap open android` — сборка APK/AAB в Android Studio

После правок HTML/CSS/JS или иконок перед сборкой снова выполняйте `npm run cap:sync`.

## Музыка

- У таймера на игровом столе кнопка с нотой: первый тап — выбор режима, повторный во время воспроизведения — стоп.
- В настройках для каждого режима можно добавить несколько файлов; при старте выбирается случайный трек.
- Параметры трека: секунда старта, множитель громкости 0.25–2 (итог ограничен `volume ≤ 1` у элемента `audio`).
- Ключ метаданных в `localStorage`: `mafia_host_music`. Сброс игры настройки музыки не удаляет.

## Сборка фронтенда

Статический фронтенд без бандлера: [Tailwind CSS](https://tailwindcss.com) подключается с CDN; кастомная тема — в `js/tailwind.config.js`. Шрифты: Google Fonts (Cormorant Garamond, Manrope).

## Атрибуции

SVG-иконки ролей основаны на наборах [Lucide](https://lucide.dev) (лицензия MIT).

## Лицензия

Репозиторий публикуется без указания лицензии в корне; при необходимости добавьте файл `LICENSE` в репозиторий.
