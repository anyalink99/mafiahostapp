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

  // Запуск автономной игры (полный путь setup → reveal).
  var autoPhase = await page.evaluate(function () {
    window.MafiaApp.startFreshAutoGame();
    return window.MafiaApp.autoState.phase + ':' + window.MafiaApp.autoState.seats.length;
  });
  if (autoPhase !== 'reveal:10')
    errors.push('startFreshAutoGame: ожидалось reveal:10, получено ' + autoPhase);
  await page.waitForSelector('#auto-reveal-screen.active', { timeout: 3000 });

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
  console.log('Браузерный смоук-тест прошёл: экраны, реестр рендереров, автономный режим OK');
})().catch(function (err) {
  console.error('SMOKE CRASHED:', err);
  process.exit(1);
});
