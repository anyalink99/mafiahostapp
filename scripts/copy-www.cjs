'use strict';
// Собирает www/ — статику для Capacitor (Android/iOS оболочка).
// Состав файлов берётся из scripts/build-config.cjs (общий с расширением и SW).
// Запуск: npm run copy:www (входит в npm run cap:sync)

var fs = require('fs');
var path = require('path');
var config = require('./build-config.cjs');

var root = path.join(__dirname, '..');
var www = path.join(root, 'www');

if (fs.existsSync(www)) fs.rmSync(www, { recursive: true });
fs.mkdirSync(www, { recursive: true });

config.appDirs.forEach(function (d) {
  var src = path.join(root, d);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(www, d), { recursive: true });
});

config.appFiles.concat(config.pwaFiles).forEach(function (f) {
  var from = path.join(root, f);
  if (!fs.existsSync(from)) {
    console.warn('skip missing:', f);
    return;
  }
  fs.copyFileSync(from, path.join(www, f));
});

console.log('Copied static assets to', www);
