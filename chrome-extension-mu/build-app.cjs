'use strict';
// Копирует основное приложение mafia-host-app в chrome-extension-mu/app/
// для использования в iframe-режиме расширения.
//
// Не копируется: service-worker.js и manifest.webmanifest (PWA-вещи, в iframe
// внутри chrome-extension они только мешают). MU-режим определяется в runtime
// через js/mu-bridge.js, поэтому сам index.html копируется как есть.
//
// Запуск: npm run build:extension  (или прямо `node chrome-extension-mu/build-app.cjs`)

var fs = require('fs');
var path = require('path');

var here = __dirname;
var root = path.join(here, '..');
var dest = path.join(here, 'app');

var DIRS = ['css', 'js', 'icons', 'audio'];
var FILES = ['index.html'];

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true });
}
fs.mkdirSync(dest, { recursive: true });

DIRS.forEach(function (d) {
  var src = path.join(root, d);
  if (!fs.existsSync(src)) {
    console.warn('skip missing dir:', d);
    return;
  }
  fs.cpSync(src, path.join(dest, d), { recursive: true });
});

FILES.forEach(function (f) {
  var from = path.join(root, f);
  if (!fs.existsSync(from)) {
    console.warn('skip missing file:', f);
    return;
  }
  fs.copyFileSync(from, path.join(dest, f));
});

// MV3 запрещает внешние скрипты (script-src 'self'). Tailwind у нас через CDN —
// в standalone это удобно, но в расширении ломается. Подменяем на локальную
// копию (js/vendor/tailwind-cdn.js), которую один раз скачали с того же CDN.
patchIndexHtmlForExtension();

// Бандлим mu-reskin.css в JS-строку (mu-reskin-css.js), чтобы content-script
// мог инжектить стиль СИНХРОННО при document_start (без fetch — иначе на долю
// секунды виден неотрескиненный MU). Файл коммитится в репозиторий, чтобы
// пользователи без npm-сборки получали актуальную версию.
bundleReskinCss();

console.log('Built extension app at', dest);

function bundleReskinCss() {
  var srcCss = path.join(here, 'mu-reskin.css');
  var outJs = path.join(here, 'mu-reskin-css.js');
  if (!fs.existsSync(srcCss)) {
    console.warn('skip reskin bundle: mu-reskin.css not found');
    return;
  }
  var css = fs.readFileSync(srcCss, 'utf8');
  var js =
    '// AUTO-GENERATED from mu-reskin.css by build-app.cjs. DO NOT EDIT.\n' +
    '// Inlining CSS as a JS string позволяет content-script инжектить стили\n' +
    '// синхронно при document_start (без async fetch → без FOUC).\n' +
    'window.MU_RESKIN_CSS = ' + JSON.stringify(css) + ';\n';
  fs.writeFileSync(outJs, js);
}

function patchIndexHtmlForExtension() {
  var indexPath = path.join(dest, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  var html = fs.readFileSync(indexPath, 'utf8');
  var before = html;
  // Заодно глушим production-warning от tailwind CDN отдельным внешним
  // скриптом (inline-скрипты запрещены CSP-политикой MV3 на extension-страницах).
  // js/vendor/tailwind-suppress.js уже скопирован вместе с остальными js.
  html = html.replace(
    /<script\s+src="https:\/\/cdn\.tailwindcss\.com"><\/script>/,
    '<script src="js/vendor/tailwind-suppress.js"></script>\n    <script src="js/vendor/tailwind-cdn.js"></script>'
  );
  // Niokit (https://github.com/anyalink99/niokit) — MV3 запрещает script-src
  // с CDN. Меняем jsdelivr-ссылки на локальный vendor (js/vendor/niokit/).
  // Грузим только tokens + components (без reset, без motion — см. комментарий
  // в index.html: reset.css ломает Tailwind-рамки).
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/gh\/anyalink99\/niokit@[^"]+\/css\/tokens\.css">/,
    '<link rel="stylesheet" href="js/vendor/niokit/tokens.css">'
  );
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="https:\/\/cdn\.jsdelivr\.net\/gh\/anyalink99\/niokit@[^"]+\/css\/components\.css">/,
    '<link rel="stylesheet" href="js/vendor/niokit/components.css">'
  );
  html = html.replace(
    /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/gh\/anyalink99\/niokit@[^"]+\/dist\/niokit\.js"><\/script>/,
    '<script src="js/vendor/niokit/niokit.js"></script>'
  );
  if (html === before) {
    console.warn('warn: tailwind CDN line not found in index.html — патч не сработал');
    return;
  }
  fs.writeFileSync(indexPath, html, 'utf8');

  // Проверяем, что локальные vendor-bundle'ы действительно есть в собранной папке.
  var localTw = path.join(dest, 'js', 'vendor', 'tailwind-cdn.js');
  var localNiokitJs = path.join(dest, 'js', 'vendor', 'niokit', 'niokit.js');
  if (!fs.existsSync(localNiokitJs)) {
    console.warn(
      'warn: js/vendor/niokit/{tokens.css,components.css,niokit.js} не найдены. Скачайте:\n' +
        '  mkdir -p js/vendor/niokit && \\\n' +
        '  curl -sL https://cdn.jsdelivr.net/gh/anyalink99/niokit@v0.3.0/css/tokens.css -o js/vendor/niokit/tokens.css && \\\n' +
        '  curl -sL https://cdn.jsdelivr.net/gh/anyalink99/niokit@v0.3.0/css/components.css -o js/vendor/niokit/components.css && \\\n' +
        '  curl -sL https://cdn.jsdelivr.net/gh/anyalink99/niokit@v0.3.0/dist/niokit.js -o js/vendor/niokit/niokit.js'
    );
  }
  if (!fs.existsSync(localTw)) {
    console.warn(
      'warn: js/vendor/tailwind-cdn.js не найден в собранной папке. ' +
        'Скачайте его командой:\n' +
        '  curl -sL https://cdn.tailwindcss.com -o js/vendor/tailwind-cdn.js'
    );
  }
}
