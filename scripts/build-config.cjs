'use strict';
// Единый источник правды о составе статики приложения.
// Используется тремя потребителями:
//   - scripts/copy-www.cjs            (www/ для Capacitor)
//   - chrome-extension-mu/build-app.cjs (app/ внутри расширения)
//   - scripts/build-sw.cjs            (прекэш-список service-worker.js)
// Новая папка/файл добавляется ТОЛЬКО здесь.

module.exports = {
  // Каталоги статики, копируемые целиком.
  appDirs: ['css', 'js', 'icons', 'audio'],

  // Файлы приложения (нужны и вебу, и расширению, и Capacitor).
  appFiles: ['index.html'],

  // PWA-файлы: нужны вебу и Capacitor, но НЕ расширению
  // (в iframe внутри chrome-extension service worker только мешает).
  pwaFiles: ['manifest.webmanifest', 'service-worker.js'],

  // Что не попадает в прекэш service worker'а (но копируется в сборки):
  // не-runtime входы сборки и служебные файлы.
  swExclude: ['css/tailwind.input.css', 'audio/.gitkeep'],
};
