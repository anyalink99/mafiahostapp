'use strict';
// Собирает index.html из html/index.template.html: маркеры
//   <!-- @include <путь относительно html/> -->
// заменяются содержимым файла как есть (без какой-либо обработки).
// index.html — генерируемый артефакт, коммитится; править нужно html/*.
//
// Запуск: npm run build:html (входит в npm run build:extension / copy:www)

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var htmlDir = path.join(root, 'html');
var templatePath = path.join(htmlDir, 'index.template.html');
var outPath = path.join(root, 'index.html');

var template = fs.readFileSync(templatePath, 'utf8');

var missing = [];
var out = template.replace(/[ \t]*<!-- @include ([^\s]+) -->/g, function (full, rel) {
  var file = path.join(htmlDir, rel);
  if (!fs.existsSync(file)) {
    missing.push(rel);
    return full;
  }
  // Содержимое партиала вставляется как есть; завершающий \n файла убираем,
  // потому что перевод строки уже есть после маркера в шаблоне.
  return fs.readFileSync(file, 'utf8').replace(/\n$/, '');
});

if (missing.length) {
  console.error('error: не найдены партиалы: ' + missing.join(', '));
  process.exit(1);
}

var prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
if (prev !== out) {
  fs.writeFileSync(outPath, out, 'utf8');
  console.log('index.html: собран из html/ (' + out.length + ' байт)');
} else {
  console.log('index.html: без изменений');
}
