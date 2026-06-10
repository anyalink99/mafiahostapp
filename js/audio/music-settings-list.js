/**
 * Музыка — построение списка настроек (DOM-билдер app.h, без
 * innerHTML-конкатенации): строка трека, строка плейлиста (с потрековым
 * режимом «Редактировать») и список слота в режиме выбора для объединения.
 * Интеракции и анимации — в music-settings.js.
 */
(function (app) {
  'use strict';

  var h = app.h;

  // Один потрековый блок (режим «Редактировать»): сворачиваемый, открыт только один за раз.
  // Шапка (имя + превью) всегда видна; настройки (участие, старт, громкость) — у раскрытого.
  function buildPlaylistTrackEditRow(slot, it, tr) {
    var off = tr.enabled === false;
    var isOpen = app.musicPlaylistTrackOpenId === tr.id;
    var vol = typeof tr.volumeMul === 'number' ? tr.volumeMul : 1;
    var offset = typeof tr.offsetSec === 'number' ? tr.offsetSec : 0;
    // Тело трека рендерим всегда (для всех треков) в сворачиваемой обёртке — чтобы
    // разворот/сворачивание анимировались (по аналогии с обычным разворотом песни).
    var panel = h(
      'div',
      { className: 'music-track-settings-panel px-2 pb-2 border-t border-mafia-border/40' },
      [
        h(
          'label',
          {
            className:
              'flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-2 select-none',
          },
          [
            h('input', {
              type: 'checkbox',
              'data-music-field': 'enabled',
              className: 'mafia-checkbox',
              checked: !off,
            }),
            h('span', null, 'Участвует в случайном выборе'),
          ]
        ),
        h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2' }, [
          h('label', { className: 'block text-xs text-mafia-cream/60 uppercase tracking-wider' }, [
            'Секунда дропа',
            h('input', {
              type: 'number',
              min: '0',
              step: '0.1',
              'data-music-field': 'offset',
              value: String(offset),
              className:
                'mt-1 w-full px-2 py-1.5 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm',
            }),
          ]),
          h('label', { className: 'block text-xs text-mafia-cream/60 uppercase tracking-wider' }, [
            'Громкость × ',
            h(
              'span',
              {
                className: 'text-mafia-gold/85 tabular-nums',
                'data-music-vol-label': true,
              },
              vol.toFixed(2)
            ),
            h('input', {
              type: 'range',
              min: '0.25',
              max: '4',
              step: '0.05',
              'data-music-field': 'volume',
              value: String(vol),
              className: 'mt-2 w-full accent-mafia-gold',
            }),
          ]),
        ]),
      ]
    );

    return h(
      'div',
      {
        className:
          'rounded border border-mafia-border/50 bg-mafia-black/30' +
          (off ? ' opacity-55' : '') +
          (isOpen ? ' is-open' : ''),
        'data-music-track-id': tr.id,
      },
      [
        h('div', { className: 'flex items-center gap-2 p-2' }, [
          h(
            'button',
            {
              type: 'button',
              'data-action': 'music-playlist-track-toggle',
              'data-slot': slot,
              'data-item-id': it.id,
              'data-track-id': tr.id,
              className: 'flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer',
            },
            [
              h('span', { className: 'music-track-chevron', 'aria-hidden': 'true' }, '▶'),
              h(
                'span',
                {
                  className: 'text-mafia-cream/85 text-xs font-medium truncate min-w-0',
                  title: tr.name || '',
                },
                tr.name || ''
              ),
            ]
          ),
          h(
            'button',
            {
              type: 'button',
              'data-action': 'music-preview',
              'data-slot': slot,
              'data-item-id': it.id,
              'data-track-id': tr.id,
              className:
                'music-preview-btn flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-border/50 bg-mafia-black/30 text-mafia-gold/90 text-sm transition-colors hover:border-mafia-gold/40 hover:bg-mafia-card/40',
              title: 'Прослушать',
              'aria-label': 'Прослушать',
            },
            '▶'
          ),
        ]),
        h(
          'div',
          isOpen
            ? { className: 'music-track-settings-wrap', style: 'max-height:none' }
            : { className: 'music-track-settings-wrap' },
          panel
        ),
      ]
    );
  }

  // Содержимое блока «Треки» внутри плейлиста: компактный список или потрековые настройки.
  app.buildMusicPlaylistTracks = function (slot, it, editing) {
    var tracks = Array.isArray(it.tracks) ? it.tracks : [];
    if (!tracks.length) {
      return h('p', { className: 'mt-1 text-mafia-cream/50 text-xs' }, 'Плейлист пуст.');
    }
    if (editing) {
      return h(
        'div',
        { className: 'mt-2 space-y-2' },
        tracks.map(function (tr) {
          return tr ? buildPlaylistTrackEditRow(slot, it, tr) : null;
        })
      );
    }
    return h(
      'ol',
      {
        className:
          'mt-1 space-y-1 text-mafia-cream/80 text-xs list-decimal list-inside marker:text-mafia-gold/55',
      },
      tracks.map(function (tr) {
        if (!tr) return null;
        var muted = tr.enabled === false;
        return h(
          'li',
          { className: 'truncate' + (muted ? ' opacity-50' : ''), title: tr.name || '' },
          [
            tr.name || '',
            muted
              ? h('span', { className: 'uppercase tracking-wider text-mafia-cream/40' }, ' · выкл.')
              : null,
          ]
        );
      })
    );
  };

  app.buildMusicPlaylistRow = function (slot, it, isOpen) {
    var offPool = it.enabled === false;
    var trackCount = Array.isArray(it.tracks) ? it.tracks.length : 0;
    var editing = app.musicPlaylistEditId === it.id;
    var plVol = typeof it.volumeMul === 'number' ? it.volumeMul : 1;

    var panel = h(
      'div',
      {
        className: 'music-item-settings-panel px-3 pb-3 pt-0 border-t border-mafia-border/40',
      },
      [
        h(
          'label',
          { className: 'block text-xs text-mafia-cream/60 uppercase tracking-wider pt-3' },
          [
            'Название',
            h('input', {
              type: 'text',
              'data-music-field': 'name',
              value: it.name,
              maxlength: '120',
              className:
                'mt-1 w-full px-2 py-1.5 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm',
            }),
          ]
        ),
        h(
          'label',
          {
            className:
              'flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-3 select-none',
          },
          [
            h('input', {
              type: 'checkbox',
              'data-music-field': 'enabled',
              className: 'mafia-checkbox',
              checked: !offPool,
            }),
            h('span', null, 'Участвует в случайном выборе'),
          ]
        ),
        h(
          'label',
          { className: 'block text-xs text-mafia-cream/60 uppercase tracking-wider pt-3' },
          [
            'Громкость плейлиста × ',
            h(
              'span',
              { className: 'text-mafia-gold/85 tabular-nums', 'data-music-vol-label': true },
              plVol.toFixed(2)
            ),
            h('input', {
              type: 'range',
              min: '0.25',
              max: '4',
              step: '0.05',
              'data-music-field': 'volume',
              value: String(plVol),
              className: 'mt-2 w-full accent-mafia-gold',
            }),
          ]
        ),
        h('div', { className: 'flex items-center justify-between gap-2 pt-3' }, [
          h('div', { className: 'text-xs text-mafia-cream/60 uppercase tracking-wider' }, 'Треки'),
          trackCount
            ? h(
                'button',
                {
                  type: 'button',
                  'data-action': 'music-playlist-edit-toggle',
                  'data-slot': slot,
                  'data-item-id': it.id,
                  'data-music-edit-btn': true,
                  className:
                    'text-xs uppercase tracking-wider cursor-pointer ' +
                    (editing ? 'text-mafia-gold' : 'text-mafia-cream/70 hover:text-mafia-cream'),
                },
                editing ? 'Готово' : 'Редактировать'
              )
            : null,
        ]),
        h('div', { 'data-music-tracks': true }, app.buildMusicPlaylistTracks(slot, it, editing)),
        h(
          'div',
          { className: 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-3' },
          [
            h('div', { className: 'flex flex-wrap items-center gap-x-3 gap-y-2' }, [
              h(
                'button',
                {
                  type: 'button',
                  'data-action': 'music-export-playlist',
                  'data-slot': slot,
                  'data-item-id': it.id,
                  className:
                    'text-mafia-cream/70 hover:text-mafia-cream text-xs uppercase tracking-wider cursor-pointer',
                },
                'Скачать ZIP'
              ),
              h(
                'button',
                {
                  type: 'button',
                  'data-action': 'music-disband-playlist',
                  'data-slot': slot,
                  'data-item-id': it.id,
                  className:
                    'text-mafia-cream/70 hover:text-mafia-cream text-xs uppercase tracking-wider cursor-pointer',
                },
                'Расформировать'
              ),
            ]),
            h(
              'button',
              {
                type: 'button',
                'data-action': 'music-remove-item',
                'data-slot': slot,
                'data-item-id': it.id,
                className:
                  'text-red-400/90 hover:text-red-300 text-xs uppercase tracking-wider cursor-pointer',
              },
              'Удалить'
            ),
          ]
        ),
      ]
    );

    return h(
      'li',
      {
        className:
          'bg-mafia-black/40 border border-mafia-border rounded overflow-hidden text-left' +
          (offPool ? ' opacity-60' : '') +
          (isOpen ? ' music-item-pending-expand' : ''),
        'data-music-item-id': it.id,
        'data-music-slot': slot,
        'data-music-kind': 'playlist',
      },
      [
        h('div', { className: 'flex items-stretch gap-0.5 pl-2 pr-1 sm:pl-3 sm:pr-2' }, [
          h(
            'button',
            {
              type: 'button',
              'data-action': 'music-toggle-item-panel',
              'data-slot': slot,
              'data-item-id': it.id,
              className:
                'flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-mafia-card/50 transition-colors duration-200 cursor-pointer rounded-sm',
            },
            [
              h('span', { className: 'music-item-chevron', 'aria-hidden': 'true' }, '▶'),
              h(
                'span',
                {
                  'data-music-title': true,
                  className: 'text-mafia-gold/90 text-sm font-medium truncate flex-1 min-w-0',
                  title: it.name,
                },
                it.name
              ),
              offPool
                ? h(
                    'span',
                    {
                      'data-music-off-badge': true,
                      className:
                        'text-mafia-cream/45 text-xs flex-shrink-0 uppercase tracking-wider',
                    },
                    'выкл.'
                  )
                : null,
              h(
                'span',
                { className: 'text-mafia-cream/40 text-xs flex-shrink-0' },
                'плейлист · ' + trackCount
              ),
            ]
          ),
        ]),
        h(
          'div',
          { className: 'music-item-settings-wrap' },
          h('div', { className: 'music-item-settings-inner' }, panel)
        ),
      ]
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
  function buildMusicSlotSelect(slot) {
    var k = String(slot) === '2' ? '2' : '1';
    var items = app.getMusicSlotItems(slot);
    var sel = app.musicSelectedIdsBySlot[k] || {};
    var n = musicSelectedCount(slot);

    var bar = h(
      'div',
      {
        className:
          'flex items-center justify-between gap-2 mb-3 p-2 rounded border border-mafia-gold/40 bg-mafia-black/40',
      },
      [
        h('span', { className: 'text-xs text-mafia-cream/70 uppercase tracking-wider' }, [
          'Выбрано: ',
          h(
            'span',
            { className: 'text-mafia-gold tabular-nums', 'data-music-select-count': true },
            String(n)
          ),
        ]),
        h('div', { className: 'flex items-center gap-2' }, [
          h(
            'button',
            {
              type: 'button',
              'data-action': 'music-select-cancel',
              'data-slot': slot,
              className:
                'px-3 py-1.5 text-xs uppercase tracking-wider text-mafia-cream/70 hover:text-mafia-cream cursor-pointer',
            },
            'Отмена'
          ),
          h(
            'button',
            {
              type: 'button',
              'data-action': 'music-create-playlist-confirm',
              'data-slot': slot,
              disabled: n < 2,
              className:
                'px-3 py-1.5 text-xs uppercase tracking-wider rounded border ' +
                (n < 2
                  ? 'border-mafia-border text-mafia-cream/35 cursor-not-allowed'
                  : 'border-mafia-gold/60 bg-mafia-blood/40 text-mafia-gold cursor-pointer'),
            },
            'Объединить (' + n + ')'
          ),
        ]),
      ]
    );

    var rows = [];
    var eligibleCount = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      var eligible = it.type !== 'playlist' && it.source && it.source.type === 'idb';
      if (eligible) {
        eligibleCount++;
        var checked = !!sel[it.id];
        rows.push(
          h(
            'li',
            {
              className:
                'bg-mafia-black/40 border rounded text-left ' +
                (checked ? 'border-mafia-gold/60' : 'border-mafia-border'),
            },
            h(
              'label',
              { className: 'flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none' },
              [
                h('input', {
                  type: 'checkbox',
                  className: 'mafia-checkbox',
                  'data-music-select': true,
                  'data-slot': slot,
                  'data-item-id': it.id,
                  checked: checked,
                }),
                h(
                  'span',
                  {
                    className: 'text-mafia-cream/90 text-sm truncate min-w-0',
                    title: it.name,
                  },
                  it.name
                ),
              ]
            )
          )
        );
      } else {
        rows.push(
          h(
            'li',
            {
              className:
                'bg-mafia-black/20 border border-mafia-border/50 rounded text-left opacity-50',
            },
            h('div', { className: 'flex items-center justify-between gap-2 px-3 py-2.5' }, [
              h(
                'span',
                {
                  className: 'text-mafia-cream/70 text-sm truncate min-w-0',
                  title: it.name,
                },
                it.name
              ),
              h(
                'span',
                {
                  className: 'text-mafia-cream/40 text-xs flex-shrink-0 uppercase tracking-wider',
                },
                it.type === 'playlist' ? 'плейлист' : 'встроенный'
              ),
            ])
          )
        );
      }
    }

    var listNode = eligibleCount
      ? h('ul', { className: 'space-y-2' }, rows)
      : h(
          'p',
          { className: 'text-mafia-cream/50 text-sm py-2' },
          'Нет одиночных треков для объединения. Добавьте треки кнопкой «Добавить треки».'
        );

    var frag = document.createDocumentFragment();
    frag.appendChild(bar);
    frag.appendChild(listNode);
    return frag;
  }

  function buildMusicSingleRow(slot, it, isOpen) {
    var offPool = it.enabled === false;
    var srcLabel = it.source && it.source.type === 'idb' ? 'с устройства' : '';
    var bundled = it.source && it.source.type === 'bundled';

    var panel = h(
      'div',
      {
        className: 'music-item-settings-panel px-3 pb-3 pt-0 border-t border-mafia-border/40',
      },
      [
        h(
          'label',
          {
            className:
              'flex items-center gap-2 cursor-pointer text-xs text-mafia-cream/70 pt-3 select-none',
          },
          [
            h('input', {
              type: 'checkbox',
              'data-music-field': 'enabled',
              className: 'mafia-checkbox',
              checked: !offPool,
            }),
            h('span', null, 'Участвует в случайном выборе'),
          ]
        ),
        h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3' }, [
          h('label', { className: 'block text-xs text-mafia-cream/60 uppercase tracking-wider' }, [
            'Секунда дропа',
            h('input', {
              type: 'number',
              min: '0',
              step: '0.1',
              'data-music-field': 'offset',
              value: String(typeof it.offsetSec === 'number' ? it.offsetSec : 0),
              className:
                'mt-1 w-full px-2 py-1.5 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm',
            }),
          ]),
          h('label', { className: 'block text-xs text-mafia-cream/60 uppercase tracking-wider' }, [
            'Громкость × ',
            h(
              'span',
              { className: 'text-mafia-gold/85 tabular-nums', 'data-music-vol-label': true },
              (typeof it.volumeMul === 'number' ? it.volumeMul : 1).toFixed(2)
            ),
            h('input', {
              type: 'range',
              min: '0.25',
              max: '4',
              step: '0.05',
              'data-music-field': 'volume',
              value: String(typeof it.volumeMul === 'number' ? it.volumeMul : 1),
              className: 'mt-2 w-full accent-mafia-gold',
            }),
          ]),
        ]),
        bundled
          ? null
          : h(
              'div',
              { className: 'flex justify-end mt-2' },
              h(
                'button',
                {
                  type: 'button',
                  'data-action': 'music-remove-item',
                  'data-slot': slot,
                  'data-item-id': it.id,
                  className:
                    'text-red-400/90 hover:text-red-300 text-xs uppercase tracking-wider cursor-pointer',
                },
                'Удалить'
              )
            ),
      ]
    );

    return h(
      'li',
      {
        className:
          'bg-mafia-black/40 border border-mafia-border rounded overflow-hidden text-left' +
          (offPool ? ' opacity-60' : '') +
          (isOpen ? ' music-item-pending-expand' : ''),
        'data-music-item-id': it.id,
        'data-music-slot': slot,
      },
      [
        h('div', { className: 'flex items-stretch gap-0.5 pl-2 pr-1 sm:pl-3 sm:pr-2' }, [
          h(
            'button',
            {
              type: 'button',
              'data-action': 'music-toggle-item-panel',
              'data-slot': slot,
              'data-item-id': it.id,
              className:
                'flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left hover:bg-mafia-card/50 transition-colors duration-200 cursor-pointer rounded-sm',
            },
            [
              h('span', { className: 'music-item-chevron', 'aria-hidden': 'true' }, '▶'),
              h(
                'span',
                {
                  className: 'text-mafia-gold/90 text-sm font-medium truncate flex-1 min-w-0',
                  title: it.name,
                },
                it.name
              ),
              offPool
                ? h(
                    'span',
                    {
                      'data-music-off-badge': true,
                      className:
                        'text-mafia-cream/45 text-xs flex-shrink-0 uppercase tracking-wider',
                    },
                    'выкл.'
                  )
                : null,
              srcLabel
                ? h('span', { className: 'text-mafia-cream/40 text-xs flex-shrink-0' }, srcLabel)
                : null,
            ]
          ),
          h(
            'button',
            {
              type: 'button',
              'data-action': 'music-preview',
              'data-slot': slot,
              'data-item-id': it.id,
              className:
                'music-preview-btn flex h-9 w-9 shrink-0 items-center justify-center self-center rounded border border-mafia-border/50 bg-mafia-black/30 text-mafia-gold/90 text-sm transition-colors hover:border-mafia-gold/40 hover:bg-mafia-card/40',
              title: 'Прослушать',
              'aria-label': 'Прослушать',
            },
            '▶'
          ),
        ]),
        h(
          'div',
          { className: 'music-item-settings-wrap' },
          h('div', { className: 'music-item-settings-inner' }, panel)
        ),
      ]
    );
  }

  // Содержимое списка слота: Node (фрагмент/элемент) для container.replaceChildren-
  // стиля вставки (см. renderMusicSettings).
  app.buildMusicSlotList = function (slot) {
    var sk = String(slot) === '2' ? '2' : '1';
    if (app.musicSelectModeBySlot[sk]) {
      return buildMusicSlotSelect(slot);
    }
    var items = app.getMusicSlotItems(slot);
    if (!items.length) {
      return h(
        'p',
        { className: 'text-mafia-cream/50 text-sm py-2' },
        'Нет треков — добавьте файлы.'
      );
    }
    var expandedId = app.getMusicExpandedItemId(slot);
    return h(
      'ul',
      { className: 'space-y-2' },
      items.map(function (it) {
        var isOpen = expandedId === it.id;
        return it.type === 'playlist'
          ? app.buildMusicPlaylistRow(slot, it, isOpen)
          : buildMusicSingleRow(slot, it, isOpen);
      })
    );
  };
})(window.MafiaApp);
