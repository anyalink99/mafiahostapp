'use strict';

// Проверяет PWA в настоящем Chrome: manifest, install API и офлайн-перезапуск
// под управлением service worker.

var http = require('http');
var fs = require('fs');
var path = require('path');
var { chromium } = require('playwright-core');

var root = path.join(__dirname, '..');
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] && fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

(async function main() {
  var chromePath = findChrome();
  if (!chromePath) {
    console.log('pwa: Chrome не найден — пропускаем браузерный PWA-тест');
    return;
  }

  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve);
  });
  var origin = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: chromePath, headless: true });
  var context = await browser.newContext({
    serviceWorkers: 'allow',
    viewport: { width: 390, height: 844 },
  });
  var page = await context.newPage();
  var pageErrors = [];
  page.on('pageerror', function (error) {
    pageErrors.push(error.message);
  });

  await page.goto(origin + '/', { waitUntil: 'networkidle' });
  await page.evaluate(function () {
    return navigator.serviceWorker.ready;
  });
  await page.waitForFunction(
    function () {
      return !!navigator.serviceWorker.controller;
    },
    null,
    { timeout: 15000 }
  );

  var cdp = await context.newCDPSession(page);
  var manifestResult = await cdp.send('Page.getAppManifest');
  assert(manifestResult.url === origin + '/manifest.webmanifest', 'manifest не подключён');
  assert(
    !manifestResult.errors.length,
    'ошибки manifest: ' + JSON.stringify(manifestResult.errors)
  );
  var manifest = JSON.parse(manifestResult.data);
  assert(manifest.id === './', 'manifest.id должен быть стабильным');
  assert(manifest.display === 'standalone', 'display должен быть standalone');
  assert(
    manifest.icons.some(function (icon) {
      return String(icon.purpose).indexOf('maskable') !== -1;
    }),
    'нет maskable-иконки'
  );

  var installability = await cdp.send('Page.getInstallabilityErrors');
  var realInstallErrors = installability.installabilityErrors.filter(function (error) {
    return error.errorId !== 'in-incognito';
  });
  assert(
    !realInstallErrors.length,
    'Chrome считает PWA неустанавливаемой: ' + JSON.stringify(realInstallErrors)
  );

  var installUi = await page.evaluate(function () {
    window.__pwaPromptCalls = 0;
    var event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = function () {
      window.__pwaPromptCalls++;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
    var button = document.getElementById('btn-pwa-install');
    return {
      prevented: event.defaultPrevented,
      visible: button && !button.classList.contains('hidden'),
    };
  });
  assert(installUi.prevented && installUi.visible, 'install prompt не появился в интерфейсе');
  await page.click('[data-action="pwa-install"]');
  var promptCalls = await page.evaluate(function () {
    return window.__pwaPromptCalls;
  });
  assert(promptCalls === 1, 'нативный install prompt не был вызван');

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu-screen.active', { timeout: 5000 });
  var offlineState = await page.evaluate(function () {
    return {
      controlled: !!navigator.serviceWorker.controller,
      badge: !document.getElementById('pwa-offline-badge').classList.contains('hidden'),
      title: document.title,
    };
  });
  assert(offlineState.controlled, 'офлайн-страница не контролируется service worker');
  assert(offlineState.badge, 'не показан офлайн-статус');
  assert(offlineState.title === 'Мафия — Ведущий', 'офлайн загрузился неверный документ');
  assert(!pageErrors.length, 'ошибки страницы: ' + pageErrors.join('; '));

  await browser.close();
  server.close();
  console.log('PWA-тест прошёл: manifest, установка и офлайн-запуск OK');
})().catch(function (error) {
  server.close();
  console.error('PWA TEST FAILED:', error);
  process.exit(1);
});
