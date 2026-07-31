/**
 * Локальная библиотека партий.
 *
 * Текущие host/auto состояния остаются в своих штатных localStorage-ключах.
 * Здесь хранятся независимые версионированные снимки, которые переживают сброс
 * игры и могут быть восстановлены для продолжения или открытия итогов.
 */
(function (app) {
  'use strict';

  var HISTORY_KEY = 'mafia_game_history_v1';
  var CURRENT_KEY = 'mafia_game_history_current_v1';
  var RESTORE_KEY = 'mafia_game_history_restore_v1';
  var AUTO_STATE_KEY = 'mafia_auto_state';
  var PREPARE_KEY = 'mafia_prepare_config';
  var EXPERIMENTS_KEY = 'mafia_experimental_modes';
  var MAX_ENTRIES = 30;
  var syncTimer = null;
  var pendingDeleteId = '';

  app.GAME_HISTORY_STORAGE_KEY = HISTORY_KEY;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function readEntries() {
    var parsed;
    try {
      parsed = app.storageApi.getJson(HISTORY_KEY, []);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(function (entry) {
        return (
          entry &&
          typeof entry === 'object' &&
          typeof entry.id === 'string' &&
          (entry.mode === 'host' || entry.mode === 'auto') &&
          entry.snapshot &&
          typeof entry.snapshot === 'object'
        );
      })
      .sort(function (a, b) {
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
  }

  function writeEntries(entries) {
    var next = entries.slice(0, MAX_ENTRIES);
    while (next.length) {
      try {
        if (app.storageApi.setJson(HISTORY_KEY, next)) return next;
      } catch (e) {}
      // localStorage обычно ограничен 5 МБ. Сохраняем свежие партии,
      // постепенно освобождая самые старые записи.
      if (next.length === 1) return null;
      next.pop();
    }
    try {
      return app.storageApi.setJson(HISTORY_KEY, []) ? [] : null;
    } catch (e) {
      return null;
    }
  }

  function currentLink() {
    try {
      var link = app.storageApi.getJson(CURRENT_KEY, null);
      if (!link || typeof link.id !== 'string') return null;
      return link;
    } catch (e) {
      return null;
    }
  }

  function setCurrentLink(id, mode) {
    try {
      app.storageApi.setJson(CURRENT_KEY, { id: id, mode: mode });
    } catch (e) {}
  }

  app.clearCurrentHistoryLink = function () {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    try {
      app.storageApi.remove(CURRENT_KEY);
    } catch (e) {}
    syncMenuCount();
  };

  function activeScreenId() {
    var active = document.querySelector('.screen.active');
    return active ? active.id : '';
  }

  function currentMode() {
    var screenId = activeScreenId();
    var autoActive = !!(
      app.autoState &&
      app.autoState.active &&
      Array.isArray(app.autoState.seats) &&
      app.autoState.seats.length
    );
    if (
      autoActive &&
      ((app.prepareConfig && app.prepareConfig.mode === 'auto') || screenId.indexOf('auto-') === 0)
    ) {
      return 'auto';
    }
    return 'host';
  }

  function hasCurrentGame(mode) {
    mode = mode || currentMode();
    if (mode === 'auto') {
      return !!(
        app.autoState &&
        app.autoState.active &&
        app.autoState.phase !== 'setup' &&
        Array.isArray(app.autoState.seats) &&
        app.autoState.seats.length
      );
    }
    return !!(app.hasResettableState && app.hasResettableState());
  }

  app.hasCurrentGameForHistory = function () {
    return hasCurrentGame(currentMode());
  };

  function safeVariantLabel(variant) {
    try {
      var cfg = app.variantConfig && app.variantConfig(variant);
      return (cfg && cfg.label) || variant || 'Стандарт';
    } catch (e) {
      return variant || 'Стандарт';
    }
  }

  function playerNames(players) {
    if (!Array.isArray(players)) return [];
    return players
      .map(function (player) {
        return player && typeof player.nick === 'string' ? player.nick.trim() : '';
      })
      .filter(Boolean)
      .slice(0, 10);
  }

  function hostDayNumber(log) {
    var day = 0;
    (Array.isArray(log) ? log : []).forEach(function (event) {
      if (!event || typeof event !== 'object') return;
      var value = parseInt(event.dayNum != null ? event.dayNum : event.day, 10);
      if (!isNaN(value)) day = Math.max(day, value);
    });
    return day;
  }

  function buildHostEntry(existing, now) {
    var raw;
    try {
      raw = app.gameRepository.read(app.STORAGE_KEY, null);
    } catch (e) {
      raw = null;
    }
    if (!raw) return null;
    var variant = (app.prepareConfig && app.prepareConfig.variant) || 'standard';
    var winner =
      app.winningTeam === 'mafia' || app.winningTeam === 'peaceful' ? app.winningTeam : null;
    var gameLog = Array.isArray(app.gameLog) ? app.gameLog : [];
    var exports = {};
    try {
      if (app.buildGameExportText) exports.text = app.buildGameExportText();
      if (app.buildGameExportCsv) exports.csv = app.buildGameExportCsv();
      if (app.buildGameExportMUJson) exports.mu = app.buildGameExportMUJson();
    } catch (e) {}
    return {
      version: 1,
      id: existing ? existing.id : makeId(now),
      mode: 'host',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      status: winner ? 'complete' : 'in-progress',
      meta: {
        variant: variant,
        variantLabel: safeVariantLabel(variant),
        playerCount: Array.isArray(app.players) ? app.players.length : 0,
        names: playerNames(app.players),
        winner: winner,
        eventCount: gameLog.length,
        dayNum: hostDayNumber(gameLog),
        hostName: typeof app.summaryHostName === 'string' ? app.summaryHostName.trim() : '',
      },
      snapshot: {
        hostState: raw,
        prepareConfig: clone(app.prepareConfig || { mode: 'host', variant: variant }),
        experimentalModesEnabled: !!app.experimentalModesEnabled,
      },
      exports: exports,
    };
  }

  function buildAutoEntry(existing, now) {
    var raw;
    try {
      raw = app.gameRepository.read(AUTO_STATE_KEY, null);
    } catch (e) {
      raw = null;
    }
    if (!raw) return null;
    // Внутренняя undo-лента автономной игры очень объёмная. Для продолжения
    // достаточно нескольких последних точек, архив не должен раздувать quota.
    if (Array.isArray(raw.history)) raw.history = raw.history.slice(-8);
    var state = app.autoState || {};
    var variant = state.variant || 'standard';
    var winner = state.result === 'mafia' || state.result === 'peaceful' ? state.result : null;
    return {
      version: 1,
      id: existing ? existing.id : makeId(now),
      mode: 'auto',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
      status: state.phase === 'gameover' || winner ? 'complete' : 'in-progress',
      meta: {
        variant: variant,
        variantLabel: safeVariantLabel(variant),
        playerCount: Array.isArray(state.seats) ? state.seats.length : 0,
        names: playerNames(state.seats),
        winner: winner,
        eventCount: Array.isArray(state.history) ? state.history.length : 0,
        dayNum: typeof state.dayNum === 'number' ? state.dayNum : 0,
        phase: typeof state.phase === 'string' ? state.phase : '',
        phaseLabel:
          app._auto && app._auto.phaseLabel ? app._auto.phaseLabel(state.phase) : state.phase || '',
      },
      snapshot: {
        autoState: raw,
        prepareConfig: clone(app.prepareConfig || { mode: 'auto', variant: variant }),
        experimentalModesEnabled: !!app.experimentalModesEnabled,
      },
      exports: {},
    };
  }

  function makeId(now) {
    var random = Math.random().toString(36).slice(2, 8);
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var values = new Uint32Array(1);
        window.crypto.getRandomValues(values);
        random = values[0].toString(36);
      }
    } catch (e) {}
    return 'game-' + now.toString(36) + '-' + random;
  }

  app.saveCurrentGameToHistory = function (opts) {
    opts = opts || {};
    var mode = currentMode();
    if (!hasCurrentGame(mode)) {
      if (!opts.silent && app.showToast) app.showToast('Сначала начни игру');
      return null;
    }

    var entries = readEntries();
    var link = currentLink();
    var existingIndex = -1;
    if (link && link.mode === mode) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === link.id) {
          existingIndex = i;
          break;
        }
      }
    }
    if (opts.requireExisting && existingIndex < 0) return null;

    if (!opts.assumePersisted) {
      if (mode === 'auto' && app._autoInternals && app._autoInternals.saveAuto) {
        app._autoInternals.saveAuto();
      } else if (mode === 'host' && app.saveState) {
        app.saveState();
      }
    }

    var existing = existingIndex >= 0 ? entries[existingIndex] : null;
    var now = Date.now();
    var entry = mode === 'auto' ? buildAutoEntry(existing, now) : buildHostEntry(existing, now);
    if (!entry) {
      if (!opts.silent && app.showToast) app.showToast('Не удалось сохранить игру');
      return null;
    }
    if (existingIndex >= 0) entries.splice(existingIndex, 1);
    entries.unshift(entry);
    var stored = writeEntries(entries);
    if (!stored) {
      if (app.showToast) app.showToast('На устройстве не хватило места для сохранения');
      return null;
    }
    setCurrentLink(entry.id, entry.mode);
    syncMenuCount(stored);
    if (activeScreenId() === 'history-screen') renderHistory();
    if (!opts.silent && app.showToast) {
      app.showToast(existing ? 'Сохранение обновлено' : 'Игра сохранена в историю');
    }
    return entry;
  };

  app.scheduleCurrentGameHistorySync = function () {
    if (!currentLink()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      syncTimer = null;
      app.saveCurrentGameToHistory({ silent: true, assumePersisted: true, requireExisting: true });
    }, 450);
  };

  function syncMenuCount(entries) {
    entries = entries || readEntries();
    var count = entries.length;
    var badge = document.getElementById('history-menu-count');
    if (!badge) return;
    badge.textContent = String(count);
    badge.setAttribute('aria-label', 'Сохранённых игр: ' + count);
    badge.classList.toggle('hidden', count === 0);
    badge.classList.toggle('flex', count > 0);
  }
  app.syncGameHistoryCount = syncMenuCount;

  function formatDate(ts) {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ts));
    } catch (e) {
      return new Date(ts).toLocaleString();
    }
  }

  function winnerLabel(winner) {
    if (winner === 'mafia') return 'Победа мафии';
    if (winner === 'peaceful') return 'Победа мирных';
    return '';
  }

  function actionButton(action, id, label, className, title) {
    return app.h(
      'button',
      {
        type: 'button',
        className: 'history-card__action ' + (className || ''),
        'data-action': action,
        'data-history-id': id,
        title: title || null,
      },
      label
    );
  }

  function renderCard(entry, index, total, link) {
    var meta = entry.meta || {};
    var isCurrent = !!(link && link.id === entry.id);
    var folio = String(Math.max(1, total - index)).padStart(2, '0');
    var details = [];
    details.push(meta.variantLabel || meta.variant || 'Стандарт');
    if (meta.playerCount) details.push(meta.playerCount + ' игроков');
    if (meta.dayNum) details.push('день ' + meta.dayNum);
    else if (entry.mode === 'auto' && meta.phaseLabel) details.push(meta.phaseLabel);
    else if (meta.eventCount) details.push(meta.eventCount + ' событий');

    var actions = [
      actionButton(
        'history-resume',
        entry.id,
        entry.status === 'complete' ? 'Открыть' : 'Продолжить',
        'history-card__action--primary'
      ),
    ];
    if (entry.mode === 'host') {
      actions.push(actionButton('history-open-summary', entry.id, 'Итоги'));
      if (entry.exports && entry.exports.text)
        actions.push(actionButton('history-copy-text', entry.id, 'Текст'));
      if (entry.exports && entry.exports.csv)
        actions.push(actionButton('history-export-csv', entry.id, 'CSV'));
    }
    actions.push(actionButton('history-export-json', entry.id, 'JSON', '', 'Скачать архив игры'));
    actions.push(
      actionButton('history-delete-open', entry.id, 'Удалить', 'history-card__action--danger')
    );

    var winner = winnerLabel(meta.winner);
    var names = Array.isArray(meta.names) && meta.names.length ? meta.names.join(' · ') : '';
    return app.h(
      'article',
      {
        className:
          'history-card history-card--' +
          (entry.status === 'complete' ? 'complete' : 'progress') +
          (isCurrent ? ' is-current' : ''),
        'data-history-entry': entry.id,
      },
      [
        app.h('div', { className: 'history-card__rail', 'aria-hidden': 'true' }),
        app.h('div', { className: 'history-card__body' }, [
          app.h('div', { className: 'history-card__topline' }, [
            app.h('span', { className: 'history-card__folio' }, 'Дело ' + folio),
            app.h(
              'span',
              { className: 'history-card__status' },
              entry.status === 'complete' ? 'Завершена' : 'В процессе'
            ),
          ]),
          app.h('div', { className: 'history-card__heading' }, [
            app.h(
              'h2',
              { className: 'history-card__title' },
              'Игра · ' + formatDate(entry.createdAt)
            ),
            isCurrent ? app.h('span', { className: 'history-card__current' }, 'Текущая') : null,
          ]),
          app.h('p', { className: 'history-card__meta' }, details.join(' · ')),
          winner ? app.h('p', { className: 'history-card__winner' }, winner) : null,
          names
            ? app.h('p', { className: 'history-card__names', title: names }, names)
            : app.h(
                'p',
                { className: 'history-card__names history-card__names--empty' },
                'Псевдонимы не указаны'
              ),
          app.h('div', { className: 'history-card__actions' }, actions),
        ]),
      ]
    );
  }

  function renderHistory() {
    var entries = readEntries();
    var list = document.getElementById('history-list');
    var empty = document.getElementById('history-empty');
    var count = document.getElementById('history-count');
    var save = document.getElementById('history-save-current');
    var saveLabel = document.getElementById('history-save-current-label');
    var link = currentLink();
    if (count) count.textContent = String(entries.length);
    if (save) save.classList.toggle('hidden', !hasCurrentGame(currentMode()));
    if (saveLabel) saveLabel.textContent = link ? 'Обновить текущую' : 'Сохранить текущую';
    if (empty) empty.classList.toggle('hidden', entries.length > 0);
    if (list) {
      list.innerHTML = '';
      entries.forEach(function (entry, index) {
        list.appendChild(renderCard(entry, index, entries.length, link));
      });
      list.classList.toggle('hidden', entries.length === 0);
    }
    syncMenuCount(entries);
  }
  app.renderGameHistory = renderHistory;

  function findEntry(id) {
    var entries = readEntries();
    for (var i = 0; i < entries.length; i++) if (entries[i].id === id) return entries[i];
    return null;
  }

  function download(content, type, filename) {
    var blob = new Blob([content], { type: type });
    var anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(anchor.href);
  }

  function fileStamp(entry) {
    var date = new Date(entry.createdAt || Date.now());
    function pad(value) {
      return value < 10 ? '0' + value : String(value);
    }
    return (
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      '-' +
      pad(date.getHours()) +
      pad(date.getMinutes())
    );
  }

  app.exportHistoryGameCsv = function (id) {
    var entry = findEntry(id);
    if (!entry || !entry.exports || !entry.exports.csv) return;
    download(
      entry.exports.csv,
      'text/csv;charset=utf-8',
      'mafia-game-' + fileStamp(entry) + '.csv'
    );
  };

  app.exportHistoryGameJson = function (id) {
    var entry = findEntry(id);
    if (!entry) return;
    var archive = {
      type: 'mafia-host-game',
      version: 1,
      exportedAt: Date.now(),
      game: entry,
    };
    download(
      JSON.stringify(archive, null, 2),
      'application/json;charset=utf-8',
      'mafia-game-' + fileStamp(entry) + '.json'
    );
  };

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyTextFallback(text);
      });
    }
    return copyTextFallback(text);
  }

  function copyTextFallback(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-3000px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(textarea);
    return Promise.resolve();
  }

  app.copyHistoryGameText = function (id) {
    var entry = findEntry(id);
    if (!entry || !entry.exports || !entry.exports.text) return;
    copyText(entry.exports.text).then(function () {
      if (app.showToast) app.showToast('Текст игры скопирован');
    });
  };

  app.restoreGameFromHistory = function (id, route) {
    var entry = findEntry(id);
    if (!entry) {
      if (app.showToast) app.showToast('Сохранённая игра не найдена');
      return false;
    }

    var link = currentLink();
    if (
      link &&
      link.id === id &&
      link.mode === entry.mode &&
      currentMode() === entry.mode &&
      hasCurrentGame(entry.mode)
    ) {
      app.saveCurrentGameToHistory({ silent: true });
      if (entry.mode === 'auto') {
        if (route === 'result') app.navigateToScreen('auto-end-screen');
        else if (app.resumeAutoGame) app.resumeAutoGame();
      } else if (route === 'summary') {
        app.navigateToScreen('summary-screen');
      } else {
        if (app.initGameFromMenu) app.initGameFromMenu();
        app.navigateToScreen('game-screen');
      }
      return true;
    }

    if (hasCurrentGame(currentMode())) {
      app.saveCurrentGameToHistory({ silent: true });
      entry = findEntry(id) || entry;
    }

    try {
      if (entry.mode === 'auto') {
        app.gameRepository.write(AUTO_STATE_KEY, entry.snapshot.autoState);
      } else {
        app.gameRepository.write(app.STORAGE_KEY, entry.snapshot.hostState);
      }
      var prepare = clone(entry.snapshot.prepareConfig || {});
      prepare.mode = entry.mode;
      if (!prepare.variant) prepare.variant = (entry.meta && entry.meta.variant) || 'standard';
      app.settingsRepository.setJson(PREPARE_KEY, prepare);
      app.settingsRepository.setBoolean(
        EXPERIMENTS_KEY,
        entry.snapshot.experimentalModesEnabled || prepare.variant !== 'standard'
      );
      setCurrentLink(entry.id, entry.mode);
      app.storageApi.setJson(RESTORE_KEY, {
        id: entry.id,
        mode: entry.mode,
        route: route || 'continue',
      });
      window.location.reload();
      return true;
    } catch (e) {
      if (app.showToast) app.showToast('Не удалось открыть сохранённую игру');
      return false;
    }
  };

  app.consumeGameHistoryRestore = function () {
    var intent;
    try {
      intent = app.storageApi.getJson(RESTORE_KEY, null);
      app.storageApi.remove(RESTORE_KEY);
    } catch (e) {
      return false;
    }
    if (!intent || (intent.mode !== 'host' && intent.mode !== 'auto')) return false;

    if (intent.mode === 'auto') {
      if (app._autoInternals) {
        app._autoInternals.loadAuto();
        app._autoInternals.loadPrepareConfig();
        app._autoInternals.loadExperimentalModes();
      }
      if (intent.route === 'result') app.navigateToScreen('auto-end-screen');
      else if (app.resumeAutoGame) app.resumeAutoGame();
    } else {
      if (app.loadState) app.loadState();
      if (intent.route === 'summary') {
        app.navigateToScreen('summary-screen');
      } else {
        if (app.initGameFromMenu) app.initGameFromMenu();
        app.navigateToScreen('game-screen');
      }
    }
    setTimeout(function () {
      if (app.showToast) app.showToast('Сохранённая игра открыта');
    }, 120);
    return true;
  };

  app.showHistoryDeleteConfirm = function (id) {
    var entry = findEntry(id);
    if (!entry) return;
    pendingDeleteId = id;
    var copy = document.getElementById('modal-history-delete-copy');
    if (copy)
      copy.textContent = 'Игра от ' + formatDate(entry.createdAt) + ' исчезнет с этого устройства.';
    var modal = document.getElementById('modal-history-delete-confirm');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, true);
  };

  app.hideHistoryDeleteConfirm = function () {
    pendingDeleteId = '';
    var modal = document.getElementById('modal-history-delete-confirm');
    if (modal && app.modalSetOpen) app.modalSetOpen(modal, false);
  };

  app.deletePendingHistoryGame = function () {
    if (!pendingDeleteId) return;
    var id = pendingDeleteId;
    var entries = readEntries().filter(function (entry) {
      return entry.id !== id;
    });
    var stored = writeEntries(entries);
    var link = currentLink();
    if (link && link.id === id) app.clearCurrentHistoryLink();
    app.hideHistoryDeleteConfirm();
    if (stored) {
      renderHistory();
      if (app.showToast) app.showToast('Игра удалена');
    }
  };

  app.registerScreenRenderer('history-screen', renderHistory);
  syncMenuCount();
})((window.MafiaApp = window.MafiaApp || {}));
