'use strict';
// Смоук-тест в реальном Chromium: грузит index.html, ходит по основным экранам
// и валится при любой JS-ошибке (console.error / pageerror).
// Запуск: node tests/smoke-browser.cjs  (нужен установленный Chrome)

var http = require('http');
var fs = require('fs');
var path = require('path');
var { chromium } = require('playwright-core');

var root = path.join(__dirname, '..');
var MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

var server = http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  var file = path.join(root, urlPath);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function findChrome() {
  var candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', // GitHub Actions ubuntu runner
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] && fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

(async function main() {
  var chromePath = findChrome();
  if (!chromePath) {
    console.log('smoke: Chrome не найден — пропускаем браузерный смоук-тест');
    process.exit(0);
  }
  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve);
  });
  var port = server.address().port;
  var errors = [];
  var browser = await chromium.launch({ executablePath: chromePath, headless: true });
  // Мобильный viewport: на lg-экранах desktop-shell сам уводит с меню на game-screen.
  // serviceWorkers: 'block' — иначе SW активируется с clients.claim(), main.js на
  // controllerchange перезагружает страницу, и evaluate падает посреди теста (гонка).
  var page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  page.on('console', function (msg) {
    if (msg.type() === 'error') errors.push('console.error: ' + msg.text());
  });
  page.on('pageerror', function (err) {
    errors.push('pageerror: ' + err.message);
  });

  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });

  // Меню видно?
  try {
    await page.waitForSelector('#menu-screen.active', { timeout: 5000 });
  } catch (e) {
    var dbg = await page.evaluate(function () {
      var m = document.getElementById('menu-screen');
      var actives = Array.prototype.map.call(
        document.querySelectorAll('.screen.active'),
        function (x) {
          return x.id;
        }
      );
      return {
        exists: !!m,
        cls: m ? m.className : null,
        actives: actives,
        autoPhase:
          window.MafiaApp && window.MafiaApp.autoState
            ? window.MafiaApp.autoState.phase + '/' + window.MafiaApp.autoState.active
            : null,
      };
    });
    errors.push('menu-screen не виден: ' + JSON.stringify(dbg));
    console.error('DEBUG:', JSON.stringify(dbg));
    console.error('ERRORS so far:\n  ' + errors.join('\n  '));
    process.exit(1);
  }

  // Deep-link любого экспериментального варианта включает эксперименты,
  // выбирает host-вариант и сразу открывает экран подготовки.
  var linkPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  linkPage.on('console', function (msg) {
    if (msg.type() === 'error') errors.push('gameType console.error: ' + msg.text());
  });
  linkPage.on('pageerror', function (err) {
    errors.push('gameType pageerror: ' + err.message);
  });
  await linkPage.addInitScript(function () {
    localStorage.setItem('mafia_experimental_modes', '0');
    localStorage.setItem(
      'mafia_prepare_config',
      JSON.stringify({ mode: 'auto', variant: 'standard' })
    );
  });
  var gameTypes = ['kasper', 'merlin', 'donskaya', 'urban'];
  for (var gti = 0; gti < gameTypes.length; gti++) {
    var gameType = gameTypes[gti];
    await linkPage.goto('http://127.0.0.1:' + port + '/?gameType=' + gameType, {
      waitUntil: 'networkidle',
    });
    await linkPage.waitForSelector('#prepare-mode-screen.active', { timeout: 3000 });
    var gameTypeState = await linkPage.evaluate(function () {
      var app = window.MafiaApp;
      var selected = document.querySelector(
        '#prepare-variant-options [data-variant].prepare-toggle-active'
      );
      return {
        enabled: app.experimentalModesEnabled,
        mode: app.prepareConfig.mode,
        variant: app.prepareConfig.variant,
        selected: selected ? selected.getAttribute('data-variant') : '',
        persisted: localStorage.getItem('mafia_experimental_modes'),
      };
    });
    if (
      !gameTypeState.enabled ||
      gameTypeState.mode !== 'host' ||
      gameTypeState.variant !== gameType ||
      gameTypeState.selected !== gameType ||
      gameTypeState.persisted !== '1'
    ) {
      errors.push('gameType=' + gameType + ': неверное состояние ' + JSON.stringify(gameTypeState));
    }
  }
  await linkPage.setViewportSize({ width: 1366, height: 900 });
  await linkPage.goto('http://127.0.0.1:' + port + '/?gameType=URBAN', {
    waitUntil: 'networkidle',
  });
  await linkPage.waitForSelector(
    '#prepare-mode-screen.active [data-variant="urban"].prepare-toggle-active',
    { timeout: 3000 }
  );
  await linkPage.close();

  // Локальная история: создание и фоновое обновление снимка, восстановление,
  // экспорт, удаление и автоматическое сохранение завершённой auto-партии.
  var historyPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  historyPage.on('console', function (msg) {
    if (msg.type() === 'error') errors.push('history console.error: ' + msg.text());
  });
  historyPage.on('pageerror', function (err) {
    errors.push('history pageerror: ' + err.message);
  });
  await historyPage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });

  var firstHistorySetup = await historyPage.evaluate(function () {
    var app = window.MafiaApp;

    // Обычные экспорты строятся из одной модели и не теряют ночные
    // выстрелы и роли экспериментальных вариантов.
    app.prepareConfig.variant = 'merlin';
    app.experimentalModesEnabled = true;
    app.summaryRoleByPlayerId = { 1: 'merlin', 2: 'mafia', 3: 'doctor' };
    app.players[0].nick = 'Архивный игрок';
    app.players[0].fouls = 1;
    app.gameLog = [
      { type: 'elimination', playerId: 4, reason: 'shot', dayNum: 1, ts: 1 },
      {
        type: 'urban_night',
        ts: 2,
        nightNumber: 2,
        actions: {
          mafiaShot: 4,
          donCheck: 7,
          sheriffCheck: 2,
          maniacShot: null,
          beautyVisit: null,
          doctorHeal: 4,
        },
        result: {
          shots: [4],
          deaths: [],
          healed: 4,
          donFoundSheriff: true,
          sheriffFoundMafia: true,
        },
      },
    ];
    app.saveState();
    var model = app.buildGameExportModel();
    var text = app.buildGameExportText();
    var csv = app.buildGameExportCsv();
    var entry = app.saveCurrentGameToHistory({ silent: true });
    return {
      id: entry && entry.id,
      merlin: model.players[0] && model.players[0].roleCode,
      eventReason: model.events[0] && model.events[0].reason,
      textHasShot: text.indexOf('Игрок №4 — убит') !== -1,
      textHasMerlin: text.indexOf('Мерлин') !== -1,
      textHasUrbanNight: text.indexOf('Ночь 2') !== -1,
      csvHasShot: csv.indexOf('shot') !== -1,
      csvHasNightActions:
        csv.indexOf('выстрел мафии: №4') !== -1 && csv.indexOf('доктор спас №4') !== -1,
      csvHasSpecialRoles:
        csv.indexOf('merlin') !== -1 &&
        csv.indexOf('doctor') !== -1 &&
        csv.indexOf('Мерлин') !== -1 &&
        csv.indexOf('Доктор') !== -1,
    };
  });
  var firstHistoryId = firstHistorySetup.id;
  if (!firstHistoryId) errors.push('история игр: первая игра не сохранилась');
  if (
    firstHistorySetup.merlin !== 'merlin' ||
    firstHistorySetup.eventReason !== 'shot' ||
    !firstHistorySetup.textHasShot ||
    !firstHistorySetup.textHasMerlin ||
    !firstHistorySetup.textHasUrbanNight ||
    !firstHistorySetup.csvHasShot ||
    !firstHistorySetup.csvHasNightActions ||
    !firstHistorySetup.csvHasSpecialRoles
  ) {
    errors.push('экспорт: потеряны отстрелы или спецроли ' + JSON.stringify(firstHistorySetup));
  }

  await historyPage.evaluate(function () {
    window.MafiaApp.players[0].fouls = 2;
    window.MafiaApp.saveState();
  });
  await historyPage.waitForTimeout(650);
  var historySynced = await historyPage.evaluate(function () {
    var app = window.MafiaApp;
    var entries = JSON.parse(localStorage.getItem(app.GAME_HISTORY_STORAGE_KEY) || '[]');
    var badge = document.getElementById('history-menu-count');
    var first = entries[0];
    return {
      count: entries.length,
      foul: first && first.snapshot.hostState.players[0].fouls,
      hasText: !!(first && first.exports && first.exports.text),
      hasCsv: !!(first && first.exports && first.exports.csv),
      badge: badge ? badge.textContent : '',
    };
  });
  if (
    historySynced.count !== 1 ||
    historySynced.foul !== 2 ||
    !historySynced.hasText ||
    !historySynced.hasCsv ||
    historySynced.badge !== '1'
  ) {
    errors.push('история игр: снимок не обновился ' + JSON.stringify(historySynced));
  }

  var secondHistoryId = await historyPage.evaluate(function () {
    var app = window.MafiaApp;
    app.clearCurrentHistoryLink();
    app.players[0].nick = 'Вторая партия';
    app.players[0].fouls = 0;
    app.gameLog = [{ type: 'vote_hang', playerId: 7, dayNum: 2, ts: 2 }];
    app.saveState();
    var entry = app.saveCurrentGameToHistory({ silent: true });
    app.navigateToScreen('history-screen');
    return entry && entry.id;
  });
  await historyPage.waitForSelector('#history-screen.active .history-card');
  var historyCards = await historyPage.evaluate(function () {
    return {
      count: document.querySelectorAll('#history-list .history-card').length,
      current: document.querySelectorAll('#history-list .history-card.is-current').length,
      actions: document.querySelectorAll('#history-list [data-action="history-resume"]').length,
    };
  });
  if (historyCards.count !== 2 || historyCards.current !== 1 || historyCards.actions !== 2) {
    errors.push('история игр: неверный список ' + JSON.stringify(historyCards));
  }

  var csvDownloadPromise = historyPage.waitForEvent('download');
  await historyPage.click(
    '[data-history-entry="' + firstHistoryId + '"] [data-action="history-export-csv"]'
  );
  var csvDownload = await csvDownloadPromise;
  if (!/\.csv$/i.test(csvDownload.suggestedFilename())) {
    errors.push('история игр: CSV получил неверное имя ' + csvDownload.suggestedFilename());
  }

  await Promise.all([
    historyPage.waitForNavigation({ waitUntil: 'load' }),
    historyPage.click(
      '[data-history-entry="' + firstHistoryId + '"] [data-action="history-resume"]'
    ),
  ]);
  await historyPage.waitForSelector('#game-screen.active');
  var historyRestored = await historyPage.evaluate(function () {
    var app = window.MafiaApp;
    return {
      nick: app.players[0].nick,
      foul: app.players[0].fouls,
      log: app.gameLog.length,
      current: JSON.parse(localStorage.getItem('mafia_game_history_current_v1') || 'null'),
    };
  });
  if (
    historyRestored.nick !== 'Архивный игрок' ||
    historyRestored.foul !== 2 ||
    historyRestored.log !== 2 ||
    !historyRestored.current ||
    historyRestored.current.id !== firstHistoryId
  ) {
    errors.push('история игр: восстановлено неверное состояние ' + JSON.stringify(historyRestored));
  }

  await historyPage.evaluate(function () {
    window.MafiaApp.navigateToScreen('history-screen');
  });
  await historyPage.click(
    '[data-history-entry="' + secondHistoryId + '"] [data-action="history-delete-open"]'
  );
  await historyPage.waitForSelector('#modal-history-delete-confirm[data-open]');
  await historyPage.click('[data-action="history-delete-apply"]');
  var historyAfterDelete = await historyPage.evaluate(function () {
    return JSON.parse(localStorage.getItem(window.MafiaApp.GAME_HISTORY_STORAGE_KEY) || '[]')
      .length;
  });
  if (historyAfterDelete !== 1) {
    errors.push('история игр: удаление оставило ' + historyAfterDelete + ' записей вместо 1');
  }

  await historyPage.click(
    '[data-history-entry="' + firstHistoryId + '"] [data-action="history-open-summary"]'
  );
  await historyPage.waitForSelector('#summary-screen.active');

  var autoHistoryId = await historyPage.evaluate(function () {
    var app = window.MafiaApp;
    app.clearCurrentHistoryLink();
    app.prepareConfig.mode = 'auto';
    app.prepareConfig.variant = 'standard';
    app.experimentalModesEnabled = true;
    app._autoInternals.savePrepareConfig();
    var state = app._autoInternals.makeFreshState();
    state.active = true;
    state.phase = 'day';
    state.dayNum = 2;
    state.variant = 'standard';
    state.seats = Array.from({ length: 10 }, function (_, i) {
      return {
        id: i + 1,
        role: i === 9 ? 'don' : i > 6 ? 'mafia' : 'peaceful',
        alive: true,
        fouls: 0,
        nick: i === 0 ? 'Автоигрок' : '',
      };
    });
    app.autoState = state;
    app._auto.endGame('mafia');
    var entries = JSON.parse(localStorage.getItem(app.GAME_HISTORY_STORAGE_KEY) || '[]');
    var autoEntry = entries.find(function (entry) {
      return entry.mode === 'auto';
    });
    return autoEntry && autoEntry.id;
  });
  if (!autoHistoryId) {
    errors.push('история игр: завершённая auto-партия не сохранилась автоматически');
  } else {
    await historyPage.evaluate(function () {
      window.MafiaApp.navigateToScreen('history-screen');
    });
    var jsonDownloadPromise = historyPage.waitForEvent('download');
    await historyPage.click(
      '[data-history-entry="' + autoHistoryId + '"] [data-action="history-export-json"]'
    );
    var jsonDownload = await jsonDownloadPromise;
    if (!/\.json$/i.test(jsonDownload.suggestedFilename())) {
      errors.push('история игр: JSON получил неверное имя ' + jsonDownload.suggestedFilename());
    }
  }
  await historyPage.close();

  // Пройтись по основным экранам через реестр рендереров.
  var screens = [
    'prepare-mode-screen',
    'prepare-screen',
    'game-screen',
    'summary-screen',
    'settings-screen',
    'menu-screen',
  ];
  for (var i = 0; i < screens.length; i++) {
    await page.evaluate(function (id) {
      window.MafiaApp.navigateToScreen(id);
    }, screens[i]);
    await page.waitForSelector('#' + screens[i] + '.active', { timeout: 3000 });
  }

  // MU autocomplete: список совпадает с шириной поля, остаётся внутри viewport,
  // прокручивается сам и поддерживает клавиатурный выбор.
  await page.evaluate(function () {
    var app = window.MafiaApp;
    app.MU.searchPlayers = function () {
      return Promise.resolve(
        Array.from({ length: 18 }, function (_, i) {
          return {
            label: 'Игрок ' + (i + 1),
            id: 1000 + i,
            logoId: null,
            note: 'Клуб с длинным названием · Москва',
            avatarUrl: null,
          };
        })
      );
    };
    app.navigateToScreen('summary-screen');
    var input = document.getElementById('summary-host-name');
    input.value = 'иг';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  await page.waitForFunction(function () {
    return document.querySelectorAll('.mu-ac-dropdown .mu-ac-item').length === 18;
  });
  var autocompleteLayout = await page.evaluate(function () {
    var input = document.getElementById('summary-host-name');
    var dd = document.querySelector('.mu-ac-dropdown');
    var ir = input.getBoundingClientRect();
    var dr = dd.getBoundingClientRect();
    return {
      widthDelta: Math.abs(ir.width - dr.width),
      left: dr.left,
      right: dr.right,
      maxHeight: parseFloat(getComputedStyle(dd).maxHeight),
      expanded: input.getAttribute('aria-expanded'),
      controls: input.getAttribute('aria-controls') === dd.id,
      inputFontSize: parseFloat(getComputedStyle(input).fontSize),
      scrollRange: dd.scrollHeight - dd.clientHeight,
    };
  });
  if (
    autocompleteLayout.widthDelta > 1.5 ||
    autocompleteLayout.left < 7 ||
    autocompleteLayout.right > 383 ||
    autocompleteLayout.maxHeight > 321 ||
    autocompleteLayout.expanded !== 'true' ||
    !autocompleteLayout.controls ||
    autocompleteLayout.inputFontSize < 16 ||
    autocompleteLayout.scrollRange < 100
  ) {
    errors.push('MU autocomplete: неверная геометрия ' + JSON.stringify(autocompleteLayout));
  }
  await page.evaluate(function () {
    var dd = document.querySelector('.mu-ac-dropdown');
    dd.scrollTop = 180;
    dd.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(50);
  var autocompleteScroll = await page.evaluate(function () {
    var dd = document.querySelector('.mu-ac-dropdown');
    return {
      visible: getComputedStyle(dd).display !== 'none',
      scrollTop: dd.scrollTop,
    };
  });
  if (!autocompleteScroll.visible || autocompleteScroll.scrollTop < 100) {
    errors.push(
      'MU autocomplete: список закрылся при прокрутке ' + JSON.stringify(autocompleteScroll)
    );
  }
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  var autocompletePick = await page.evaluate(function () {
    var app = window.MafiaApp;
    var input = document.getElementById('summary-host-name');
    var result = input.value + ':' + input.getAttribute('aria-expanded');
    // Не оставляем тестовое имя ведущего: hasResettableState справедливо
    // считает его пользовательскими данными и блокирует смену варианта ниже.
    app.summaryHostName = '';
    input.value = '';
    app.saveState();
    return result;
  });
  if (autocompletePick !== 'Игрок 1:false') {
    errors.push('MU autocomplete: клавиатурный выбор не сработал — ' + autocompletePick);
  }

  // Игровой стол отрисовал 10 слотов игроков?
  var slots = await page.evaluate(function () {
    window.MafiaApp.navigateToScreen('game-screen');
    return document.querySelectorAll('#players-list [data-player-id]').length;
  });
  if (slots !== 10) errors.push('game-screen: ожидалось 10 слотов игроков, получено ' + slots);

  // В модалке игрока фол меняется отдельными кнопками −/+, без закрытия модалки.
  var foulInitial = await page.evaluate(function () {
    var app = window.MafiaApp;
    app.players[0].fouls = 0;
    app.showPlayerActionsModal(1);
    var minus = document.querySelector('[data-action="player-modal-foul-minus"]');
    var count = document.getElementById('modal-player-foul-count');
    return (minus && minus.disabled ? 'disabled' : 'enabled') + ':' + count.textContent;
  });
  if (foulInitial !== 'disabled:0 / 4') {
    errors.push('контрол фолов: неверное начальное состояние ' + foulInitial);
  }
  await page.click('[data-action="player-modal-foul-plus"]');
  await page.waitForTimeout(150);
  var foulAdded = await page.evaluate(function () {
    var modal = document.getElementById('modal-player-actions');
    var panel = modal.querySelector('.modal-panel');
    var panelRect = panel.getBoundingClientRect();
    var count = document.getElementById('modal-player-foul-count');
    var close = panel.querySelector('.modal-panel__close-x');
    var nick = document.getElementById('modal-player-nick');
    return (
      window.MafiaApp.players[0].fouls +
      ':' +
      count.textContent +
      ':' +
      modal.hasAttribute('data-open') +
      ':' +
      Math.round(window.innerHeight - panelRect.bottom) +
      ':' +
      getComputedStyle(close).display +
      ':' +
      parseFloat(getComputedStyle(nick).fontSize)
    );
  });
  if (foulAdded !== '1:1 / 4:true:8:flex:16') {
    errors.push('контрол фолов: плюс не обновил счётчик ' + foulAdded);
  }
  await page.click('[data-action="player-modal-foul-minus"]');
  var foulRemoved = await page.evaluate(function () {
    var app = window.MafiaApp;
    var minus = document.querySelector('[data-action="player-modal-foul-minus"]');
    var count = document.getElementById('modal-player-foul-count');
    var result =
      app.players[0].fouls +
      ':' +
      count.textContent +
      ':' +
      (minus.disabled ? 'disabled' : 'enabled');
    app.hidePlayerActionsModal();
    app.bestMoveByPlayerId = {};
    app.protocolByPlayerId = {};
    app.opinionByPlayerId = {};
    app.bonusNoteByPlayerId = {};
    app.saveState();
    return result;
  });
  if (foulRemoved !== '0:0 / 4:disabled') {
    errors.push('контрол фолов: минус не обновил счётчик ' + foulRemoved);
  }

  // Настройки карточки игрока сохраняют видимость секций и лимит фолов.
  var playerCardSettings = await page.evaluate(function () {
    var app = window.MafiaApp;
    app.navigateToScreen('settings-screen');
    app.setSettingsTab('general');
    var bestMove = document.getElementById('setting-player-bestmove-visible');
    var protocol = document.getElementById('setting-player-protocol-visible');
    var foulLimit = document.getElementById('setting-player-foul-limit');
    bestMove.click();
    protocol.click();
    foulLimit.value = '3';
    foulLimit.dispatchEvent(new Event('input', { bubbles: true }));
    var cardSection = foulLimit.closest('section');
    var voiceSection = document.getElementById('setting-timer-voice').closest('section');
    var voiceBelow = !!(
      cardSection.compareDocumentPosition(voiceSection) & Node.DOCUMENT_POSITION_FOLLOWING
    );

    app.players[0].fouls = 2;
    app.players[0].eliminationReason = null;
    app.addFoul(1);
    var result = [
      app.playerBestMoveVisible,
      app.playerProtocolVisible,
      app.getFoulLimit(),
      voiceBelow,
      app.players[0].fouls,
      app.players[0].eliminationReason,
    ].join(':');
    app.setPlayerEliminationState(1, 'disqual');
    app.setPlayerFoulLimit(4);
    return result;
  });
  if (playerCardSettings !== 'false:false:3:true:3:disqual') {
    errors.push('настройки карточки игрока: неверное состояние ' + playerCardSettings);
  }

  // «Городская»: динамический состав на верхней границе (16 игроков).
  var urbanChecks = await page.evaluate(function () {
    var app = window.MafiaApp;
    app.experimentalModesEnabled = true;
    app.prepareConfig.mode = 'host';
    app.prepareConfig.variant = 'urban';
    app.prepareConfig.playerCount = 16;
    app.prepareConfig.roleCounts = app.urbanSuggestedCounts(16);
    var anchor12 = app.urbanSuggestedCounts(12);
    app.applyHostVariantDeck();
    app.navigateToScreen('prepare-screen');
    var list = document.getElementById('prepare-players-list');
    var roleSvg = list ? list.querySelector('.player-slot--compact svg') : null;
    var svgBorder = roleSvg ? window.getComputedStyle(roleSvg).borderTopWidth : '';
    app.navigateToScreen('setup-screen');
    var cards = document.getElementById('card-container');
    var maniacCard = cards ? cards.querySelector('.card-front.bg-urban-maniac') : null;
    var maniacBg = maniacCard ? window.getComputedStyle(maniacCard).backgroundColor : '';
    app.revealedIndices = app.roles.map(function (_, i) {
      return i;
    });
    var previousLog = app.gameLog.slice();
    app.gameLog = [{ type: 'elimination', playerId: 1, reason: 'shot', ts: 1 }];
    app.showPlayerActionsModal(1);
    var hiddenBestMove = document.getElementById('modal-player-bestmove-wrap').style.display;
    var hiddenProtocol = document.getElementById('modal-player-protocol-section').style.display;
    app.hidePlayerActionsModal();
    app.setPlayerBestMoveVisible(true);
    app.setPlayerProtocolVisible(true);
    app.showPlayerActionsModal(1);
    var bestMoveInput = document.getElementById('modal-player-bestmove');
    var bestMoveInputLimit = bestMoveInput.getAttribute('data-bestmove-limit');
    bestMoveInput.value = '1,2,3,4,5,6';
    bestMoveInput.dispatchEvent(new Event('input', { bubbles: true }));
    var limitedBestMove = bestMoveInput.value;
    var bestMoveExport = app.formatBestMoveForExport('1,2,3,4,5');
    var shownProtocol = document.getElementById('modal-player-protocol-section').style.display;
    app.hidePlayerActionsModal();
    app.gameLog = previousLog;
    app.showHostToolsModal();
    var nightSection = document.getElementById('host-tools-urban-night-section');
    app.toolsRevealRoles();
    var namedRoles = document.getElementById('host-tools-roles-result').textContent;
    app.hideHostToolsModal();
    app.goToUrbanNightActions();
    var nightScreen = document.getElementById('urban-night-screen');
    var nightActions = document.querySelectorAll('#urban-night-actions .urban-night-role-tile');
    app.showUrbanNightTargetModal('mafiaShot');
    var nightTargetModal = document.getElementById('modal-urban-night-target');
    var nightTargetCount = document.querySelectorAll(
      '#modal-urban-night-target-grid .urban-night-target'
    ).length;
    var result = [
      'players:' + app.players.length,
      'roles:' + app.roles.length,
      'mafia:' +
        app.roles.filter(function (x) {
          return x === 'Мафия';
        }).length,
      'peaceful:' +
        app.roles.filter(function (x) {
          return x === 'Мирный';
        }).length,
      'rows:' + (list ? list.style.gridTemplateRows : ''),
      'svg-border:' + svgBorder,
      'cards:' + (cards ? cards.children.length : 0),
      'card-grid:' +
        (cards
          ? cards.style.getPropertyValue('--card-cols') +
            'x' +
            cards.style.getPropertyValue('--card-rows')
          : ''),
      'maniac:' + maniacBg,
      'night-button:' + (nightSection && !nightSection.classList.contains('hidden') ? 1 : 0),
      'named-urban:' +
        (namedRoles.indexOf('Маньяк') !== -1 &&
        namedRoles.indexOf('Доктор') !== -1 &&
        namedRoles.indexOf('Красотка') !== -1
          ? 1
          : 0),
      'night-screen:' + (nightScreen && nightScreen.classList.contains('active') ? 1 : 0),
      'night-actions:' + nightActions.length,
      'night-modal:' + (nightTargetModal && nightTargetModal.hasAttribute('data-open') ? 1 : 0),
      'night-targets:' + nightTargetCount,
      'anchor12:' + anchor12.mafia + '/' + anchor12.peaceful,
      'player-fields:' +
        hiddenBestMove +
        '/' +
        hiddenProtocol +
        '/' +
        bestMoveInputLimit +
        '/' +
        shownProtocol +
        '/' +
        limitedBestMove +
        '/' +
        bestMoveExport,
    ].join(' ');
    // Остальные проверки ниже ожидают классический стол.
    app.hideUrbanNightTargetModal();
    app.urbanNightDraft = null;
    app.revealedIndices = [];
    app.prepareConfig.variant = 'standard';
    app.applyHostVariantDeck();
    return result;
  });
  if (
    urbanChecks !==
    'players:16 roles:16 mafia:3 peaceful:8 rows:repeat(8, minmax(0px, 1fr)) svg-border:0px cards:16 card-grid:4x4 maniac:rgb(20, 83, 45) night-button:1 named-urban:1 night-screen:1 night-actions:6 night-modal:1 night-targets:16 anchor12:2/5 player-fields:none/none/5/flex/1, 2, 3, 4, 5/1, 2, 3, 4, 5'
  ) {
    errors.push('режим «Городская»: неверная конфигурация — ' + urbanChecks);
  }

  // Автономный режим: рендереры зарегистрированы?
  var autoOk = await page.evaluate(function () {
    var need = [
      'auto-setup-screen',
      'auto-reveal-screen',
      'auto-night-intro-screen',
      'auto-night-pass-screen',
      'auto-night-action-screen',
      'auto-night-result-screen',
      'auto-day-screen',
      'auto-vote-screen',
      'auto-last-words-screen',
      'auto-merlin-guess-screen',
      'auto-end-screen',
    ];
    return need.filter(function (id) {
      return typeof window.MafiaApp.screenRenderers[id] !== 'function';
    });
  });
  if (autoOk.length) errors.push('нет рендереров: ' + autoOk.join(', '));

  // _autoInternals — контракт для events/*.
  var missingInternals = await page.evaluate(function () {
    var need = [
      'clearAllAutoTimers',
      'hideRevealOverlay',
      'makeFreshState',
      'saveAuto',
      'pushHistory',
      'loadAuto',
      'loadPrepareConfig',
      'savePrepareConfig',
      'loadExperimentalModes',
      'seatById',
      'withAutoModalSeatId',
      'addAutoFoul',
      'removeAutoFoul',
      'toggleAutoNominee',
      'setAutoElim',
      'bindRevealHoldGestures',
      'bindBackGestures',
      'bindAutoPlayerGestures',
      'el',
    ];
    return need.filter(function (k) {
      return typeof window.MafiaApp._autoInternals[k] !== 'function';
    });
  });
  if (missingInternals.length) errors.push('нет _autoInternals: ' + missingInternals.join(', '));

  // Логика голосования (host): креативный попил 3/3/3/1 → 5/5/0 → 5/5.
  // Циклы переголосования не лимитированы; «подъём» — только при повторе.
  var voteFlow = await page.evaluate(function () {
    var app = window.MafiaApp;
    var out = [];
    app.gameLog = [];
    app.activeVoteRound = null;
    app.nomineeQueue = [1, 4, 6, 9];
    app.startVoteRoundFromNomineeQueue();
    function applyVotes(votes) {
      var s = app.activeVoteRound;
      for (var i = 0; i < votes.length; i++) s.votes[i] = votes[i];
      app.tryFinalizeVoteRound();
    }
    applyVotes([3, 3, 3, 1]);
    var s1 = app.activeVoteRound;
    out.push('r1:' + s1.phase + ':' + s1.candidateIds.join(','));
    applyVotes([5, 5, 0]);
    var s2 = app.activeVoteRound;
    out.push('r2:' + s2.phase + ':' + s2.candidateIds.join(','));
    applyVotes([5, 5]);
    var s3 = app.activeVoteRound;
    out.push('r3:' + s3.phase + ':' + (s3.raiseCandidateIds || []).join(','));
    return out.join(' | ');
  });
  var voteFlowExpected = 'r1:counting:1,4,6 | r2:counting:1,4 | r3:raiseAll:1,4';
  if (voteFlow !== voteFlowExpected) {
    errors.push('голосование: ожидалось «' + voteFlowExpected + '», получено «' + voteFlow + '»');
  }

  // Настройки музыки: список (DOM-билдер), режим выбора, раскрытие панели.
  var musicChecks = await page.evaluate(function () {
    var app = window.MafiaApp;
    var out = [];
    app.navigateToScreen('settings-screen');
    var c1 = document.getElementById('music-list-slot-1');
    out.push('items:' + (c1 ? c1.querySelectorAll('li[data-music-item-id]').length : -1));
    app.musicEnterSelectMode('1');
    out.push('selbar:' + (c1.querySelector('[data-music-select-count]') ? 1 : 0));
    app.musicExitSelectMode('1');
    var li = c1.querySelector('li[data-music-item-id]');
    var id = li ? li.getAttribute('data-music-item-id') : null;
    if (id) app.toggleMusicItemExpanded('1', id);
    out.push(
      'expand:' + (c1.querySelector('li.music-item-pending-expand, li.music-item-expanded') ? 1 : 0)
    );
    return out.join(' ');
  });
  if (musicChecks !== 'items:1 selbar:1 expand:1') {
    errors.push(
      'настройки музыки: ожидалось «items:1 selbar:1 expand:1», получено «' + musicChecks + '»'
    );
  }

  // Удаление загруженной музыки требует явного подтверждения с названием объекта.
  await page.evaluate(function () {
    var app = window.MafiaApp;
    app.saveMusicMeta({
      version: 1,
      slots: {
        1: [
          {
            id: 'delete-track',
            name: 'Ночная тема',
            enabled: true,
            source: { type: 'idb', blobId: '' },
          },
        ],
        2: [],
      },
      spotify: { 1: null, 2: null },
    });
    app.renderMusicSettings();
    var deleteButton = document.querySelector(
      '[data-action="music-remove-item"][data-item-id="delete-track"]'
    );
    if (!deleteButton) throw new Error('Кнопка удаления трека не отрисовалась');
    deleteButton.click();
  });
  await page.waitForSelector('#modal-music-delete-confirm[data-open]', { timeout: 3000 });
  var musicDeleteModal = await page.evaluate(function () {
    return [
      document.getElementById('modal-music-delete-title').textContent,
      document.getElementById('modal-music-delete-copy').textContent,
      document.getElementById('modal-music-delete-cancel-label').textContent,
      window.MafiaApp.getMusicSlotItems('1').length,
    ].join('|');
  });
  if (
    musicDeleteModal !==
    'Удалить трек?|Трек «Ночная тема» будет удалён с этого устройства. Загруженный файл восстановить не получится.|Оставить трек|1'
  ) {
    errors.push('модалка удаления музыки: неверное содержимое ' + musicDeleteModal);
  }
  await page.click('[data-action="music-delete-cancel"]');
  var musicKept = await page.evaluate(function () {
    return window.MafiaApp.getMusicSlotItems('1').length;
  });
  if (musicKept !== 1) errors.push('модалка удаления музыки: отмена удалила трек');

  await page.evaluate(function () {
    window.MafiaApp.showMusicDeleteConfirm('1', 'delete-track');
  });
  await page.click('[data-action="music-delete-apply"]');
  await page.waitForFunction(function () {
    return window.MafiaApp.getMusicSlotItems('1').length === 0;
  });

  var playlistDeleteCopy = await page.evaluate(function () {
    var app = window.MafiaApp;
    app.saveMusicMeta({
      version: 1,
      slots: {
        1: [
          {
            id: 'delete-playlist',
            type: 'playlist',
            name: 'Финал',
            tracks: [
              { id: 'a', name: 'A', blobId: '' },
              { id: 'b', name: 'B', blobId: '' },
            ],
          },
        ],
        2: [],
      },
      spotify: { 1: null, 2: null },
    });
    app.showMusicDeleteConfirm('1', 'delete-playlist');
    var value = [
      document.getElementById('modal-music-delete-title').textContent,
      document.getElementById('modal-music-delete-copy').textContent,
      document.getElementById('modal-music-delete-cancel-label').textContent,
    ].join('|');
    app.hideMusicDeleteConfirm();
    return value;
  });
  if (
    playlistDeleteCopy !==
    'Удалить плейлист?|Плейлист «Финал» будет удалён с этого устройства. Внутри: 2 трека. Загруженные файлы восстановить не получится.|Оставить плейлист'
  ) {
    errors.push('модалка удаления плейлиста: неверное содержимое ' + playlistDeleteCopy);
  }

  // Запуск автономной игры (полный путь setup → reveal).
  var autoPhase = await page.evaluate(function () {
    window.MafiaApp.startFreshAutoGame();
    return window.MafiaApp.autoState.phase + ':' + window.MafiaApp.autoState.seats.length;
  });
  if (autoPhase !== 'reveal:10')
    errors.push('startFreshAutoGame: ожидалось reveal:10, получено ' + autoPhase);
  await page.waitForSelector('#auto-reveal-screen.active', { timeout: 3000 });

  var autoFoulLimit = await page.evaluate(function () {
    var app = window.MafiaApp;
    app.setPlayerFoulLimit(3);
    var seat = app.autoState.seats[0];
    seat.fouls = 2;
    seat.eliminationReason = null;
    seat.alive = true;
    app._autoInternals.addAutoFoul(1);
    var result = seat.fouls + ':' + seat.eliminationReason + ':' + seat.alive;
    app._autoInternals.setAutoElim(1, 'disqual');
    app.setPlayerFoulLimit(4);
    return result;
  });
  if (autoFoulLimit !== '3:disqual:false') {
    errors.push('автономный лимит фолов: неверное состояние ' + autoFoulLimit);
  }

  await page.evaluate(function () {
    window.MafiaApp.showAutoPlayerActionsModal(1);
  });
  await page.click('[data-action="auto-player-modal-foul-plus"]');
  await page.click('[data-action="auto-player-modal-foul-minus"]');
  var autoFoulControl = await page.evaluate(function () {
    var app = window.MafiaApp;
    var count = document.getElementById('modal-auto-player-foul-count');
    var minus = document.querySelector('[data-action="auto-player-modal-foul-minus"]');
    app.hideAutoPlayerActionsModal();
    return app.autoState.seats[0].fouls + ':' + count.textContent + ':' + minus.disabled;
  });
  if (autoFoulControl !== '0:0 / 4:true') {
    errors.push('автономный контрол фолов: неверное состояние ' + autoFoulControl);
  }

  // ── Десктоп-контекст (lg+): desktop-shell/player-panel/setup-slot работают
  // через официальные API ядра (перехватчики модалок, nav-гварды, события). ──
  var dpage = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    serviceWorkers: 'block',
  });
  dpage.on('console', function (msg) {
    if (msg.type() === 'error') errors.push('desktop console.error: ' + msg.text());
  });
  dpage.on('pageerror', function (err) {
    errors.push('desktop pageerror: ' + err.message);
  });
  await dpage.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle' });

  // desktop-shell на старте уводит с меню на игровой стол (через nav-гварды).
  await dpage.waitForSelector('#game-screen.active', { timeout: 5000 });

  // Модалка игрока перехватывается в unified-панель (registerModalInterceptor).
  var desktopPlayersWidthBefore = await dpage.evaluate(function () {
    return document.getElementById('players-list').getBoundingClientRect().width;
  });
  await dpage.evaluate(function () {
    window.MafiaApp.showPlayerActionsModal(3);
  });
  await dpage.waitForSelector('.unified-player-slot.is-open', { timeout: 3000 });
  await dpage.waitForTimeout(420);
  var unifiedNum = await dpage.evaluate(function () {
    var n = document.getElementById('unified-player-num');
    return n ? n.textContent : null;
  });
  if (unifiedNum !== '3') {
    errors.push('unified-панель: ожидался игрок 3, получено ' + unifiedNum);
  }

  var desktopPanelLayout = await dpage.evaluate(function () {
    function rect(el) {
      var r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    }
    var list = document.getElementById('players-list');
    var panel = document.querySelector('#game-screen .unified-player-slot');
    var workspace = panel.closest('.desktop-workspace');
    var right = document.getElementById('game-side-right');
    var collisions = 0;
    list.querySelectorAll('.player-slot__row').forEach(function (row) {
      var status = row.children[0].getBoundingClientRect();
      var number = row.children[1].getBoundingClientRect();
      var foul = row.children[2].getBoundingClientRect();
      if (number.left < status.right - 1 || number.right > foul.left + 1) collisions++;
    });
    return {
      list: rect(list),
      panel: rect(panel),
      workspace: rect(workspace),
      rightDisplay: getComputedStyle(right).display,
      collisions: collisions,
      overflow: list.scrollWidth - list.clientWidth,
    };
  });
  if (Math.abs(desktopPanelLayout.list.width - desktopPlayersWidthBefore) > 1) {
    errors.push('unified-панель сжимает стол на широком desktop');
  }
  if (
    desktopPanelLayout.panel.width < 340 ||
    Math.abs(desktopPanelLayout.panel.right - desktopPanelLayout.workspace.right) > 1
  ) {
    errors.push('unified-панель неверно выровнена поверх правого инспектора');
  }
  if (desktopPanelLayout.rightDisplay === 'none') {
    errors.push('правый инспектор удалён из layout вместо перекрытия drawer-панелью');
  }
  if (desktopPanelLayout.collisions || desktopPanelLayout.overflow > 1) {
    errors.push('карточки игроков пересекаются или выходят за ширину desktop-сетки');
  }

  // Закрытие должно быть обратной анимацией, а не мгновенным исчезновением.
  var openPanelWidth = desktopPanelLayout.panel.width;
  await dpage.locator('#unified-player-panel [data-action="unified-player-close"]').first().click();
  await dpage.waitForTimeout(80);
  var closingPanelWidth = await dpage.evaluate(function () {
    return document.querySelector('#game-screen .unified-player-slot').getBoundingClientRect()
      .width;
  });
  await dpage.waitForTimeout(420);
  var closedPanelWidth = await dpage.evaluate(function () {
    return document.querySelector('#game-screen .unified-player-slot').getBoundingClientRect()
      .width;
  });
  if (!(closingPanelWidth > 0 && closingPanelWidth < openPanelWidth && closedPanelWidth < 1)) {
    errors.push('unified-панель закрывается без плавной обратной анимации');
  }

  // На узком desktop drawer также не участвует в расчёте flex-колонок.
  await dpage.setViewportSize({ width: 1180, height: 900 });
  await dpage.waitForTimeout(300);
  var mediumPlayersWidthBefore = await dpage.evaluate(function () {
    return document.getElementById('players-list').getBoundingClientRect().width;
  });
  await dpage.evaluate(function () {
    window.MafiaApp.showPlayerActionsModal(3);
  });
  await dpage.waitForSelector('#game-screen .unified-player-slot.is-open', { timeout: 3000 });
  await dpage.waitForTimeout(420);
  var mediumPanelLayout = await dpage.evaluate(function () {
    var list = document.getElementById('players-list').getBoundingClientRect();
    var panel = document.querySelector('#game-screen .unified-player-slot').getBoundingClientRect();
    return { listWidth: list.width, panelWidth: panel.width };
  });
  if (
    Math.abs(mediumPanelLayout.listWidth - mediumPlayersWidthBefore) > 1 ||
    mediumPanelLayout.panelWidth < 340
  ) {
    errors.push(
      'unified-панель ломает компоновку на desktop 1024–1279px: ' +
        JSON.stringify({ before: mediumPlayersWidthBefore, after: mediumPanelLayout })
    );
  }
  await dpage.evaluate(function () {
    window.MafiaApp.hidePlayerActionsModal();
  });
  await dpage.waitForTimeout(420);
  await dpage.setViewportSize({ width: 1366, height: 900 });
  await dpage.evaluate(function () {
    window.MafiaApp.showPlayerActionsModal(3);
  });
  await dpage.waitForSelector('#game-screen .unified-player-slot.is-open', { timeout: 3000 });

  // Переход экрана закрывает панель (навигационный гвард панели).
  await dpage.evaluate(function () {
    window.MafiaApp.navigateToScreen('summary-screen');
  });
  await dpage.waitForSelector('#summary-screen.active', { timeout: 3000 });
  var slotStillOpen = await dpage.evaluate(function () {
    return !!document.querySelector('.unified-player-slot.is-open');
  });
  if (slotStillOpen) errors.push('unified-панель не закрылась при переходе экрана');

  // История использует ту же ширину, что глобальный таймер, и общий чёрный фон экранов.
  await dpage.setViewportSize({ width: 1600, height: 900 });
  await dpage.waitForTimeout(300);
  await dpage.evaluate(function () {
    window.MafiaApp.navigateToScreen('history-screen');
  });
  await dpage.waitForSelector('#history-screen.active', { timeout: 3000 });
  var desktopHistoryLayout = await dpage.evaluate(function () {
    var timer = document.getElementById('timer-panel-wrap').getBoundingClientRect();
    var shell = document.querySelector('#history-screen .history-shell').getBoundingClientRect();
    var style = getComputedStyle(document.getElementById('history-screen'));
    return {
      timerLeft: timer.left,
      timerWidth: timer.width,
      shellLeft: shell.left,
      shellWidth: shell.width,
      backgroundImage: style.backgroundImage,
    };
  });
  if (
    Math.abs(desktopHistoryLayout.shellLeft - desktopHistoryLayout.timerLeft) > 1 ||
    Math.abs(desktopHistoryLayout.shellWidth - desktopHistoryLayout.timerWidth) > 1
  ) {
    errors.push('desktop-история не совпадает по ширине с глобальным таймером');
  }
  if (desktopHistoryLayout.backgroundImage !== 'none') {
    errors.push('desktop-история содержит лишнюю фоновую подложку');
  }

  // Городская ночь на ПК раскрывается встроенным слотом и возвращает body обратно при закрытии.
  await dpage.evaluate(function () {
    var app = window.MafiaApp;
    app.experimentalModesEnabled = true;
    app.prepareConfig.mode = 'host';
    app.prepareConfig.variant = 'urban';
    app.prepareConfig.playerCount = 12;
    app.prepareConfig.roleCounts = app.urbanSuggestedCounts(12);
    app.gameLog = [];
    app.revealedIndices = [];
    app.roles = app.variantConfig('urban').getHostDeck();
    app.resizeHostPlayers(app.roles.length);
    app.revealedIndices = app.roles.map(function (_, i) {
      return i;
    });
    app.navigateToScreen('game-screen');
    app.goToUrbanNightActions();
  });
  await dpage.waitForSelector('#game-screen.game-night-actions #game-night-slot.night-slot-open', {
    timeout: 3000,
  });
  await dpage.evaluate(function () {
    window.MafiaApp.showUrbanNightTargetModal('mafiaShot');
  });
  await dpage.waitForSelector('#night-target-slot.is-open', { timeout: 3000 });
  var desktopNight = await dpage.evaluate(function () {
    var body = document.getElementById('urban-night-body');
    var slot = document.getElementById('game-night-slot');
    var targetPanel = document.getElementById('night-target-slot');
    var targets = document.querySelectorAll(
      '#modal-urban-night-target-grid .urban-night-target'
    ).length;
    return (
      (body && body.parentNode === slot ? 'inline' : 'detached') +
      ':' +
      (targetPanel.classList.contains('is-open') ? 'target-inline' : 'target-closed') +
      ':' +
      targets
    );
  });
  if (desktopNight !== 'inline:target-inline:12') {
    errors.push(
      'городская ночь на ПК: ожидалось inline:target-inline:12, получено ' + desktopNight
    );
  }
  await dpage.evaluate(function () {
    window.MafiaApp.pickUrbanNightTarget(1);
  });
  var desktopNightAssigned = await dpage.evaluate(function () {
    return !!document.querySelector(
      '#urban-night-actions [data-night-action="mafiaShot"].is-complete'
    );
  });
  if (!desktopNightAssigned) errors.push('городская ночь: выбранная цель не записалась в плитку');
  var sheriffManiacResult = await dpage.evaluate(function () {
    var app = window.MafiaApp;
    var maniacIndex = app.roles.indexOf('Маньяк');
    app.showUrbanNightTargetModal('sheriffCheck');
    app.pickUrbanNightTarget(maniacIndex + 1);
    var tile = document.querySelector('#urban-night-actions [data-night-action="sheriffCheck"]');
    return tile ? tile.textContent.toLowerCase() : '';
  });
  if (sheriffManiacResult.indexOf('маньяк') === -1) {
    errors.push('городская ночь: проверка шерифа не показала маньяка ведущему');
  }
  await dpage.evaluate(function () {
    window.MafiaApp.closeUrbanNightActions();
  });
  var desktopNightClosed = await dpage.evaluate(function () {
    var body = document.getElementById('urban-night-body');
    var screen = document.getElementById('urban-night-screen');
    return body && body.parentNode === screen;
  });
  if (!desktopNightClosed) errors.push('городская ночь: body не вернулся на экран после закрытия');

  await browser.close();
  server.close();

  // Отфильтровываем некритичное (404 favicon и т.п. не ловим — same-origin only).
  var critical = errors.filter(function (e) {
    return (
      e.indexOf('favicon') === -1 && e.indexOf('the server responded with a status of 404') === -1
    );
  });
  if (critical.length) {
    console.error('SMOKE FAILED:');
    critical.forEach(function (e) {
      console.error('  ' + e);
    });
    process.exit(1);
  }
  console.log(
    'Браузерный смоук-тест прошёл: экраны, реестр, голосование, автономный режим, десктоп-панели OK'
  );
})().catch(function (err) {
  console.error('SMOKE CRASHED:', err);
  process.exit(1);
});
