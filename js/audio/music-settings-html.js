/**
 * Музыка — HTML-строители списка настроек: строка трека, строка плейлиста
 * (с потрековым режимом «Редактировать») и список слота в режиме выбора
 * для объединения. Интеракции и анимации — в music-settings.js.
 */
(function (app) {
  'use strict';

  var escapeHtml = app.escapeHtml;

  // Один потрековый блок (режим «Редактировать»): сворачиваемый, открыт только один за раз.
  // Шапка (имя + превью) всегда видна; настройки (участие, старт, громкость) — у раскрытого.
  function buildPlaylistTrackEditRow(slot, it, tr) {
    var off = tr.enabled === false;
    var isOpen = app.musicPlaylistTrackOpenId === tr.id;
    var vol = typeof tr.volumeMul === 'number' ? tr.volumeMul : 1;
    var offset = typeof tr.offsetSec === 'number' ? tr.offsetSec : 0;
    // Тело трека рендерим всегда (для всех треков) в сворачиваемой обёртке — чтобы
    // разворот/сворачивание анимировались (по аналогии с обычным разворотом песни).
    var bodyInner =
      '<div class="music-track-settings-panel px-2 pb-2 border-t border-mafia-border/40">' +
      '<label class="flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-2 select-none">' +
      '<input type="checkbox" data-music-field="enabled" class="mafia-checkbox" ' +
      (off ? '' : 'checked') +
      '>' +
      '<span>Участвует в случайном выборе</span>' +
      '</label>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">' +
      '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider">Секунда дропа' +
      '<input type="number" min="0" step="0.1" data-music-field="offset" value="' +
      offset +
      '" class="mt-1 w-full px-2 py-1.5 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm">' +
      '</label>' +
      '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider">Громкость × <span class="text-mafia-gold/85 tabular-nums" data-music-vol-label>' +
      vol.toFixed(2) +
      '</span>' +
      '<input type="range" min="0.25" max="4" step="0.05" data-music-field="volume" value="' +
      vol +
      '" class="mt-2 w-full accent-mafia-gold">' +
      '</label>' +
      '</div>' +
      '</div>';
    return (
      '<div class="rounded border border-mafia-border/50 bg-mafia-black/30' +
      (off ? ' opacity-55' : '') +
      (isOpen ? ' is-open' : '') +
      '" data-music-track-id="' +
      escapeHtml(tr.id) +
      '">' +
      '<div class="flex items-center gap-2 p-2">' +
      '<button type="button" data-action="music-playlist-track-toggle" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" data-track-id="' +
      escapeHtml(tr.id) +
      '" class="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer">' +
      '<span class="music-track-chevron" aria-hidden="true">▶</span>' +
      '<span class="text-mafia-cream/85 text-xs font-medium truncate min-w-0" title="' +
      escapeHtml(tr.name || '') +
      '">' +
      escapeHtml(tr.name || '') +
      '</span>' +
      '</button>' +
      '<button type="button" data-action="music-preview" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" data-track-id="' +
      escapeHtml(tr.id) +
      '" class="music-preview-btn flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-border/50 bg-mafia-black/30 text-mafia-gold/90 text-sm transition-colors hover:border-mafia-gold/40 hover:bg-mafia-card/40" title="Прослушать" aria-label="Прослушать">▶</button>' +
      '</div>' +
      '<div class="music-track-settings-wrap"' +
      (isOpen ? ' style="max-height:none"' : '') +
      '>' +
      bodyInner +
      '</div>' +
      '</div>'
    );
  }

  // Содержимое блока «Треки» внутри плейлиста: компактный список или потрековые настройки.
  app.buildMusicPlaylistTracksHtml = function (slot, it, editing) {
    var tracks = Array.isArray(it.tracks) ? it.tracks : [];
    if (!tracks.length) {
      return '<p class="mt-1 text-mafia-cream/50 text-xs">Плейлист пуст.</p>';
    }
    if (editing) {
      var rows = '<div class="mt-2 space-y-2">';
      for (var e = 0; e < tracks.length; e++) {
        if (!tracks[e]) continue;
        rows += buildPlaylistTrackEditRow(slot, it, tracks[e]);
      }
      rows += '</div>';
      return rows;
    }
    var ol =
      '<ol class="mt-1 space-y-1 text-mafia-cream/80 text-xs list-decimal list-inside marker:text-mafia-gold/55">';
    for (var t = 0; t < tracks.length; t++) {
      var tr = tracks[t];
      if (!tr) continue;
      var muted = tr.enabled === false;
      ol +=
        '<li class="truncate' +
        (muted ? ' opacity-50' : '') +
        '" title="' +
        escapeHtml(tr.name || '') +
        '">' +
        escapeHtml(tr.name || '') +
        (muted
          ? ' <span class="uppercase tracking-wider text-mafia-cream/40">· выкл.</span>'
          : '') +
        '</li>';
    }
    ol += '</ol>';
    return ol;
  };

  app.buildMusicPlaylistRowHtml = function (slot, it, isOpen) {
    var offPool = it.enabled === false;
    var trackCount = Array.isArray(it.tracks) ? it.tracks.length : 0;
    var editing = app.musicPlaylistEditId === it.id;
    var plVol = typeof it.volumeMul === 'number' ? it.volumeMul : 1;
    var tracksHtml = app.buildMusicPlaylistTracksHtml(slot, it, editing);
    return (
      '<li class="bg-mafia-black/40 border border-mafia-border rounded overflow-hidden text-left' +
      (offPool ? ' opacity-60' : '') +
      (isOpen ? ' music-item-pending-expand' : '') +
      '" data-music-item-id="' +
      escapeHtml(it.id) +
      '" data-music-slot="' +
      escapeHtml(slot) +
      '" data-music-kind="playlist">' +
      '<div class="flex items-stretch gap-0.5 pl-2 pr-1 sm:pl-3 sm:pr-2">' +
      '<button type="button" data-action="music-toggle-item-panel" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" class="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-mafia-card/50 transition-colors duration-200 cursor-pointer rounded-sm">' +
      '<span class="music-item-chevron" aria-hidden="true">▶</span>' +
      '<span data-music-title class="text-mafia-gold/90 text-sm font-medium truncate flex-1 min-w-0" title="' +
      escapeHtml(it.name) +
      '">' +
      escapeHtml(it.name) +
      '</span>' +
      (offPool
        ? '<span data-music-off-badge class="text-mafia-cream/45 text-xs flex-shrink-0 uppercase tracking-wider">выкл.</span>'
        : '') +
      '<span class="text-mafia-cream/40 text-xs flex-shrink-0">плейлист · ' +
      trackCount +
      '</span>' +
      '</button>' +
      '</div>' +
      '<div class="music-item-settings-wrap">' +
      '<div class="music-item-settings-inner">' +
      '<div class="music-item-settings-panel px-3 pb-3 pt-0 border-t border-mafia-border/40">' +
      '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider pt-3">Название' +
      '<input type="text" data-music-field="name" value="' +
      escapeHtml(it.name) +
      '" maxlength="120" class="mt-1 w-full px-2 py-1.5 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm">' +
      '</label>' +
      '<label class="flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-3 select-none">' +
      '<input type="checkbox" data-music-field="enabled" class="mafia-checkbox" ' +
      (offPool ? '' : 'checked') +
      '>' +
      '<span>Участвует в случайном выборе</span>' +
      '</label>' +
      '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider pt-3">Громкость плейлиста × <span class="text-mafia-gold/85 tabular-nums" data-music-vol-label>' +
      plVol.toFixed(2) +
      '</span>' +
      '<input type="range" min="0.25" max="4" step="0.05" data-music-field="volume" value="' +
      plVol +
      '" class="mt-2 w-full accent-mafia-gold">' +
      '</label>' +
      '<div class="flex items-center justify-between gap-2 pt-3">' +
      '<div class="text-xs text-mafia-cream/60 uppercase tracking-wider">Треки</div>' +
      (trackCount
        ? '<button type="button" data-action="music-playlist-edit-toggle" data-slot="' +
          escapeHtml(slot) +
          '" data-item-id="' +
          escapeHtml(it.id) +
          '" data-music-edit-btn class="text-xs uppercase tracking-wider cursor-pointer ' +
          (editing ? 'text-mafia-gold' : 'text-mafia-cream/70 hover:text-mafia-cream') +
          '">' +
          (editing ? 'Готово' : 'Редактировать') +
          '</button>'
        : '') +
      '</div>' +
      '<div data-music-tracks>' +
      tracksHtml +
      '</div>' +
      '<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-3">' +
      '<div class="flex flex-wrap items-center gap-x-3 gap-y-2">' +
      '<button type="button" data-action="music-export-playlist" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" class="text-mafia-cream/70 hover:text-mafia-cream text-xs uppercase tracking-wider cursor-pointer">Скачать ZIP</button>' +
      '<button type="button" data-action="music-disband-playlist" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" class="text-mafia-cream/70 hover:text-mafia-cream text-xs uppercase tracking-wider cursor-pointer">Расформировать</button>' +
      '</div>' +
      '<button type="button" data-action="music-remove-item" data-slot="' +
      escapeHtml(slot) +
      '" data-item-id="' +
      escapeHtml(it.id) +
      '" class="text-red-400/90 hover:text-red-300 text-xs uppercase tracking-wider cursor-pointer">Удалить</button>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</li>'
    );
  };

  // Кол-во выбранных в режиме объединения для слота.
  function musicSelectedCount(slot) {
    var k = String(slot) === '2' ? '2' : '1';
    var sel = app.musicSelectedIdsBySlot[k] || {};
    var n = 0;
    for (var id in sel) {
      if (Object.prototype.hasOwnProperty.call(sel, id) && sel[id]) n++;
    }
    return n;
  }

  // Список слота в режиме выбора: чекбоксы у одиночных idb-треков + панель действий.
  function buildMusicSlotSelectHtml(slot) {
    var k = String(slot) === '2' ? '2' : '1';
    var items = app.getMusicSlotItems(slot);
    var sel = app.musicSelectedIdsBySlot[k] || {};
    var n = musicSelectedCount(slot);
    var bar =
      '<div class="flex items-center justify-between gap-2 mb-3 p-2 rounded border border-mafia-gold/40 bg-mafia-black/40">' +
      '<span class="text-xs text-mafia-cream/70 uppercase tracking-wider">Выбрано: <span class="text-mafia-gold tabular-nums" data-music-select-count>' +
      n +
      '</span></span>' +
      '<div class="flex items-center gap-2">' +
      '<button type="button" data-action="music-select-cancel" data-slot="' +
      escapeHtml(slot) +
      '" class="px-3 py-1.5 text-xs uppercase tracking-wider text-mafia-cream/70 hover:text-mafia-cream cursor-pointer">Отмена</button>' +
      '<button type="button" data-action="music-create-playlist-confirm" data-slot="' +
      escapeHtml(slot) +
      '"' +
      (n < 2 ? ' disabled' : '') +
      ' class="px-3 py-1.5 text-xs uppercase tracking-wider rounded border ' +
      (n < 2
        ? 'border-mafia-border text-mafia-cream/35 cursor-not-allowed'
        : 'border-mafia-gold/60 bg-mafia-blood/40 text-mafia-gold cursor-pointer') +
      '">Объединить (' +
      n +
      ')</button>' +
      '</div>' +
      '</div>';

    var rows = '<ul class="space-y-2">';
    var eligibleCount = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      var eligible = it.type !== 'playlist' && it.source && it.source.type === 'idb';
      if (eligible) {
        eligibleCount++;
        var checked = !!sel[it.id];
        rows +=
          '<li class="bg-mafia-black/40 border rounded text-left ' +
          (checked ? 'border-mafia-gold/60' : 'border-mafia-border') +
          '">' +
          '<label class="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none">' +
          '<input type="checkbox" class="mafia-checkbox" data-music-select data-slot="' +
          escapeHtml(slot) +
          '" data-item-id="' +
          escapeHtml(it.id) +
          '"' +
          (checked ? ' checked' : '') +
          '>' +
          '<span class="text-mafia-cream/90 text-sm truncate min-w-0" title="' +
          escapeHtml(it.name) +
          '">' +
          escapeHtml(it.name) +
          '</span>' +
          '</label>' +
          '</li>';
      } else {
        var why = it.type === 'playlist' ? 'плейлист' : 'встроенный';
        rows +=
          '<li class="bg-mafia-black/20 border border-mafia-border/50 rounded text-left opacity-50">' +
          '<div class="flex items-center justify-between gap-2 px-3 py-2.5">' +
          '<span class="text-mafia-cream/70 text-sm truncate min-w-0" title="' +
          escapeHtml(it.name) +
          '">' +
          escapeHtml(it.name) +
          '</span>' +
          '<span class="text-mafia-cream/40 text-xs flex-shrink-0 uppercase tracking-wider">' +
          why +
          '</span>' +
          '</div>' +
          '</li>';
      }
    }
    rows += '</ul>';
    if (!eligibleCount) {
      rows =
        '<p class="text-mafia-cream/50 text-sm py-2">Нет одиночных треков для объединения. Добавьте треки кнопкой «Добавить треки».</p>';
    }
    return bar + rows;
  }

  app.buildMusicSlotListHtml = function (slot) {
    var sk = String(slot) === '2' ? '2' : '1';
    if (app.musicSelectModeBySlot[sk]) {
      return buildMusicSlotSelectHtml(slot);
    }
    var items = app.getMusicSlotItems(slot);
    if (!items.length) {
      return '<p class="text-mafia-cream/50 text-sm py-2">Нет треков — добавьте файлы.</p>';
    }
    var expandedId = app.getMusicExpandedItemId(slot);
    var html = '<ul class="space-y-2">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var isOpen = expandedId === it.id;
      var offPool = it.enabled === false;
      if (it.type === 'playlist') {
        html += app.buildMusicPlaylistRowHtml(slot, it, isOpen);
        continue;
      }
      var srcLabel = it.source && it.source.type === 'idb' ? 'с устройства' : '';
      html +=
        '<li class="bg-mafia-black/40 border border-mafia-border rounded overflow-hidden text-left' +
        (offPool ? ' opacity-60' : '') +
        (isOpen ? ' music-item-pending-expand' : '') +
        '" data-music-item-id="' +
        escapeHtml(it.id) +
        '" data-music-slot="' +
        escapeHtml(slot) +
        '">' +
        '<div class="flex items-stretch gap-0.5 pl-2 pr-1 sm:pl-3 sm:pr-2">' +
        '<button type="button" data-action="music-toggle-item-panel" data-slot="' +
        escapeHtml(slot) +
        '" data-item-id="' +
        escapeHtml(it.id) +
        '" class="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-mafia-card/50 transition-colors duration-200 cursor-pointer rounded-sm">' +
        '<span class="music-item-chevron" aria-hidden="true">▶</span>' +
        '<span class="text-mafia-gold/90 text-sm font-medium truncate flex-1 min-w-0" title="' +
        escapeHtml(it.name) +
        '">' +
        escapeHtml(it.name) +
        '</span>' +
        (offPool
          ? '<span data-music-off-badge class="text-mafia-cream/45 text-xs flex-shrink-0 uppercase tracking-wider">выкл.</span>'
          : '') +
        (srcLabel
          ? '<span class="text-mafia-cream/40 text-xs flex-shrink-0">' +
            escapeHtml(srcLabel) +
            '</span>'
          : '') +
        '</button>' +
        '<button type="button" data-action="music-preview" data-slot="' +
        escapeHtml(slot) +
        '" data-item-id="' +
        escapeHtml(it.id) +
        '" class="music-preview-btn flex h-9 w-9 shrink-0 items-center justify-center self-center rounded border border-mafia-border/50 bg-mafia-black/30 text-mafia-gold/90 text-sm transition-colors hover:border-mafia-gold/40 hover:bg-mafia-card/40" title="Прослушать" aria-label="Прослушать">▶</button>' +
        '</div>' +
        '<div class="music-item-settings-wrap">' +
        '<div class="music-item-settings-inner">' +
        '<div class="music-item-settings-panel px-3 pb-3 pt-0 border-t border-mafia-border/40">' +
        '<label class="flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-3 select-none">' +
        '<input type="checkbox" data-music-field="enabled" class="mafia-checkbox" ' +
        (offPool ? '' : 'checked') +
        '>' +
        '<span>Участвует в случайном выборе</span>' +
        '</label>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">' +
        '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider">Секунда дропа' +
        '<input type="number" min="0" step="0.1" data-music-field="offset" value="' +
        (typeof it.offsetSec === 'number' ? it.offsetSec : 0) +
        '" class="mt-1 w-full px-2 py-1.5 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm">' +
        '</label>' +
        '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider">Громкость × <span class="text-mafia-gold/85 tabular-nums" data-music-vol-label>' +
        (typeof it.volumeMul === 'number' ? it.volumeMul : 1).toFixed(2) +
        '</span>' +
        '<input type="range" min="0.25" max="4" step="0.05" data-music-field="volume" value="' +
        (typeof it.volumeMul === 'number' ? it.volumeMul : 1) +
        '" class="mt-2 w-full accent-mafia-gold">' +
        '</label>' +
        '</div>' +
        (it.source && it.source.type === 'bundled'
          ? ''
          : '<div class="flex justify-end mt-2"><button type="button" data-action="music-remove-item" data-slot="' +
            escapeHtml(slot) +
            '" data-item-id="' +
            escapeHtml(it.id) +
            '" class="text-red-400/90 hover:text-red-300 text-xs uppercase tracking-wider cursor-pointer">Удалить</button></div>') +
        '</div>' +
        '</div>' +
        '</div>' +
        '</li>';
    }
    html += '</ul>';
    return html;
  };
})(window.MafiaApp);
