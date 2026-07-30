/**
 * Автономный режим — точка сборки.
 *
 * Сам режим разложен по файлам modes/auto/* (загружаются до этого файла):
 *   core.js       — app._auto: состояние, persistence, история, helpers, sfx
 *   music.js      — фоновая музыка фаз (раздача/ночи/знакомство)
 *   setup.js      — экран запуска (старт/продолжение/перезапуск)
 *   reveal.js     — раздача ролей (pass-and-hold)
 *   intro.js      — ночь 0, знакомство (музыка, Merlin reveal, рассадка)
 *   night.js      — активные ночи (ходы, выстрел, проверки, утро)
 *   day.js        — день (таймер, слоты, фолы, выставления, модалка)
 *   vote.js       — голосование (подсчёт, ничья, поднятие всех)
 *   last-words.js — последние слова казнённых
 *   endgame.js    — победа, угадывание Мерлина, финальный экран
 *   gestures.js   — back-hold/Backspace откат + жесты слотов дня
 *
 * Здесь — только init-хуки и публикация app._autoInternals для соседей
 * (events/auto/*.js, events/prepare.js, modes/auto/migration.js).
 */
(function (app) {
  'use strict';

  var A = app._auto;

  app.initAutoFromMenu = function () {
    A.loadAuto();
    A.loadPrepareConfig();
    A.loadExperimentalModes();
    A.bindRevealHoldGestures();
    A.bindBackGestures();
    A.bindAutoPlayerGestures();
  };

  app.initPrepareModeFromMenu = app.initAutoFromMenu;

  // Internals exposed for sibling files (events/auto/*.js, modes/auto/migration.js).
  // These are private to modes/auto/* but needed by event handlers and migration.
  app._autoInternals = {
    clearAllAutoTimers: A.clearAllAutoTimers,
    hideRevealOverlay: A.hideRevealOverlay,
    makeFreshState: A.makeFreshState,
    saveAuto: A.saveAuto,
    pushHistory: A.pushHistory,
    loadAuto: A.loadAuto,
    loadPrepareConfig: A.loadPrepareConfig,
    savePrepareConfig: A.savePrepareConfig,
    loadExperimentalModes: A.loadExperimentalModes,
    seatById: A.seatById,
    withAutoModalSeatId: A.withAutoModalSeatId,
    addAutoFoul: A.addAutoFoul,
    removeAutoFoul: A.removeAutoFoul,
    toggleAutoNominee: A.toggleAutoNominee,
    setAutoElim: A.setAutoElim,
    bindRevealHoldGestures: A.bindRevealHoldGestures,
    bindBackGestures: A.bindBackGestures,
    bindAutoPlayerGestures: A.bindAutoPlayerGestures,
    el: A.el,
  };

  A.loadAuto();
  A.loadPrepareConfig();
  A.loadExperimentalModes();
  A.bindBackGestures();
  A.bindAutoPlayerGestures();
})(window.MafiaApp);
