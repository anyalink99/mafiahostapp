'use strict';
// Копирует основное приложение mafia-host-app в chrome-extension-mu/app/
// для использования в iframe-режиме расширения.
//
// Состав файлов берётся из scripts/build-config.cjs (общий с www-сборкой и SW).
// Не копируются pwaFiles (service-worker.js, manifest.webmanifest) — в iframe
// внутри chrome-extension они только мешают. MU-режим определяется в runtime
// через js/mu-bridge.js, поэтому сам index.html копируется как есть:
// все ресурсы (Tailwind-сборка, niokit) уже локальные, патчить HTML не нужно.
//
// Запуск: npm run build:extension  (или прямо `node chrome-extension-mu/build-app.cjs`)

var fs = require('fs');
var path = require('path');

var here = __dirname;
var root = path.join(here, '..');
var dest = path.join(here, 'app');
var config = require(path.join(root, 'scripts', 'build-config.cjs'));

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true });
}
fs.mkdirSync(dest, { recursive: true });

config.appDirs.forEach(function (d) {
  var src = path.join(root, d);
  if (!fs.existsSync(src)) {
    console.warn('skip missing dir:', d);
    return;
  }
  fs.cpSync(src, path.join(dest, d), { recursive: true });
});

config.appFiles.forEach(function (f) {
  var from = path.join(root, f);
  if (!fs.existsSync(from)) {
    console.warn('skip missing file:', f);
    return;
  }
  fs.copyFileSync(from, path.join(dest, f));
});

// MV3 (script-src 'self') запрещает внешние ресурсы — проверяем, что собранный
// index.html не тянет ничего, кроме шрифтов (стили MV3 не блокирует).
checkNoForbiddenCdn();

// Бандлим mu-reskin.css в JS-строку (mu-reskin-css.js), чтобы content-script
// мог инжектить стиль СИНХРОННО при document_start (без fetch — иначе на долю
// секунды виден неотрескиненный MU). Файл коммитится в репозиторий, чтобы
// пользователи без npm-сборки получали актуальную версию.
bundleReskinCss();

console.log('Built extension app at', dest);

function checkNoForbiddenCdn() {
  var indexPath = path.join(dest, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  var html = fs.readFileSync(indexPath, 'utf8');
  var m = html.match(/<script[^>]+src="https?:\/\/[^"]+"/g);
  if (m) {
    console.warn('warn: в index.html остались внешние <script> (MV3 их заблокирует):');
    m.forEach(function (tag) {
      console.warn('  ' + tag);
    });
  }
  var tw = path.join(dest, 'css', 'tailwind.css');
  if (!fs.existsSync(tw)) {
    console.warn('warn: css/tailwind.css не найден. Соберите его: npm run build:css');
  }
}

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
    'window.MU_RESKIN_CSS = ' +
    JSON.stringify(css) +
    ';\n';
  fs.writeFileSync(outJs, js);
}
