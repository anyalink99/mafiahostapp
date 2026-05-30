// Глушим единственное сообщение «cdn.tailwindcss.com should not be used in
// production», которое tailwind CDN бросает в console.warn на каждую загрузку.
// Подключается перед js/vendor/tailwind-cdn.js в собранной версии для расширения.
(function () {
  var orig = console.warn;
  console.warn = function () {
    if (arguments[0] && String(arguments[0]).indexOf('cdn.tailwindcss.com should not be used') !== -1) {
      return;
    }
    return orig.apply(console, arguments);
  };
})();
