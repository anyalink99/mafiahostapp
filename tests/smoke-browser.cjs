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

  // Игровой стол отрисовал 10 слотов игроков?
  var slots = await page.evaluate(function () {
    window.MafiaApp.navigateToScreen('game-screen');
    return document.querySelectorAll('#players-list [data-player-id]').length;
  });
  if (slots !== 10) errors.push('game-screen: ожидалось 10 слотов игроков, получено ' + slots);

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
    'players:16 roles:16 mafia:3 peaceful:8 rows:repeat(8, minmax(0px, 1fr)) svg-border:0px cards:16 card-grid:4x4 maniac:rgb(20, 83, 45) night-button:1 named-urban:1 night-screen:1 night-actions:6 night-modal:1 night-targets:16 anchor12:2/5'
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

  // Запуск автономной игры (полный путь setup → reveal).
  var autoPhase = await page.evaluate(function () {
    window.MafiaApp.startFreshAutoGame();
    return window.MafiaApp.autoState.phase + ':' + window.MafiaApp.autoState.seats.length;
  });
  if (autoPhase !== 'reveal:10')
    errors.push('startFreshAutoGame: ожидалось reveal:10, получено ' + autoPhase);
  await page.waitForSelector('#auto-reveal-screen.active', { timeout: 3000 });

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
  await dpage.evaluate(function () {
    window.MafiaApp.showPlayerActionsModal(3);
  });
  await dpage.waitForSelector('.unified-player-slot.is-open', { timeout: 3000 });
  var unifiedNum = await dpage.evaluate(function () {
    var n = document.getElementById('unified-player-num');
    return n ? n.textContent : null;
  });
  if (unifiedNum !== '3') {
    errors.push('unified-панель: ожидался игрок 3, получено ' + unifiedNum);
  }

  // Переход экрана закрывает панель (навигационный гвард панели).
  await dpage.evaluate(function () {
    window.MafiaApp.navigateToScreen('summary-screen');
  });
  await dpage.waitForSelector('#summary-screen.active', { timeout: 3000 });
  var slotStillOpen = await dpage.evaluate(function () {
    return !!document.querySelector('.unified-player-slot.is-open');
  });
  if (slotStillOpen) errors.push('unified-панель не закрылась при переходе экрана');

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
