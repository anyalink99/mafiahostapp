'use strict';
// Генерирует прекэш-блок в service-worker.js:
//   - ASSETS — все файлы из build-config (appDirs + appFiles + manifest),
//     найденные на диске, так что список не может разойтись с реальностью;
//   - CACHE_NAME — суффикс из sha1-хэша содержимого этих файлов, так что
//     версия кэша бампается автоматически при любом изменении статики.
// Перезаписывает service-worker.js между маркерами BUILD:PRECACHE.
//
// Запуск: npm run build:sw (входит в npm run build:extension)

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var config = require('./build-config.cjs');

var root = path.join(__dirname, '..');
var swPath = path.join(root, 'service-worker.js');

function listFilesRecursive(dir) {
  var out = [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (ent) {
    var full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out = out.concat(listFilesRecursive(full));
    } else {
      out.push(full);
    }
  });
  return out;
}

function toRelUrl(absPath) {
  return path.relative(root, absPath).split(path.sep).join('/');
}

var excluded = {};
config.swExclude.forEach(function (p) {
  excluded[p] = true;
});

var assets = [];
config.appFiles.forEach(function (f) {
  if (fs.existsSync(path.join(root, f))) assets.push(f);
});
if (fs.existsSync(path.join(root, 'manifest.webmanifest'))) {
  assets.push('manifest.webmanifest');
}
config.appDirs.forEach(function (d) {
  var dir = path.join(root, d);
  if (!fs.existsSync(dir)) return;
  listFilesRecursive(dir).forEach(function (abs) {
    var rel = toRelUrl(abs);
    if (!excluded[rel]) assets.push(rel);
  });
});
assets.sort();

// Хэш содержимого всех прекэшируемых файлов → версия кэша.
// Текстовые файлы нормализуем к LF: в Windows-чекаутах (autocrlf) рабочая
// копия CRLF, на CI — LF, и без нормализации хэш у всех разный.
var TEXT_EXT = /\.(js|css|html|json|webmanifest|svg|txt|md)$/i;
function fileBytesForHash(rel) {
  var buf = fs.readFileSync(path.join(root, rel));
  if (!TEXT_EXT.test(rel)) return buf;
  return Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}
var hash = crypto.createHash('sha1');
assets.forEach(function (rel) {
  hash.update(rel);
  hash.update(fileBytesForHash(rel));
});
var version = hash.digest('hex').slice(0, 12);

var BEGIN = '// BUILD:PRECACHE-BEGIN';
var END = '// BUILD:PRECACHE-END';

var sw = fs.readFileSync(swPath, 'utf8');
var beginIdx = sw.indexOf(BEGIN);
var endIdx = sw.indexOf(END);
if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
  console.error('error: маркеры BUILD:PRECACHE не найдены в service-worker.js');
  process.exit(1);
}

var block =
  BEGIN +
  ' (автогенерация scripts/build-sw.cjs — не редактировать руками)\n' +
  "var CACHE_NAME = 'mafia-host-static-" +
  version +
  "';\n" +
  'var ASSETS = [\n' +
  "  './',\n" +
  assets
    .map(function (rel) {
      return "  './" + rel + "',";
    })
    .join('\n') +
  '\n];\n';

var next = sw.slice(0, beginIdx) + block + sw.slice(endIdx);
if (next !== sw) {
  fs.writeFileSync(swPath, next, 'utf8');
  console.log(
    'service-worker.js: ' + assets.length + ' assets, cache mafia-host-static-' + version
  );
} else {
  console.log('service-worker.js: без изменений (cache mafia-host-static-' + version + ')');
}
