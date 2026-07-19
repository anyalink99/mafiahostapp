/**
 * Рендереры обычных экспортов: читаемый текст и табличный CSV.
 * MU-экспорт живёт отдельно в mu-export.js и здесь не меняется.
 */
(function (app) {
  'use strict';

  var DASH = '—';

  function display(value) {
    return value === null || value === undefined || value === '' ? DASH : String(value);
  }

  function formatPoints(value) {
    if (app.formatBonusForDisplay) return app.formatBonusForDisplay(value);
    return String(value).replace('.', ',');
  }

  function signedPoints(value) {
    if (!value) return '0';
    return value > 0 ? '+' + formatPoints(value) : formatPoints(value);
  }

  function formatNumGroup(group) {
    if (!group) return '';
    var parts = [];
    if (group.sheriff) parts.push('шериф: ' + group.sheriff);
    if (group.mafia) parts.push('мафия: ' + group.mafia);
    if (group.peaceful) parts.push('мирный: ' + group.peaceful);
    return parts.join('; ');
  }

  function buildPlayerText(player) {
    var lines = [];
    var heading = '№' + player.id + ' ' + (player.nick || 'без ника') + ' — ' + player.role;
    lines.push(heading);

    var facts = ['статус: ' + player.status, 'фолы: ' + player.fouls];
    if (player.won !== null) facts.push(player.won ? 'победа' : 'поражение');
    if (player.basePoints !== null) {
      if (player.bonus) {
        facts.push(
          'очки: ' +
            formatPoints(player.basePoints) +
            ' ' +
            signedPoints(player.bonus) +
            ' = ' +
            formatPoints(player.totalPoints)
        );
      } else {
        facts.push('очки: ' + formatPoints(player.basePoints));
      }
    } else if (player.bonus) {
      facts.push('бонус: ' + signedPoints(player.bonus));
    }
    lines.push('  ' + facts.join('; '));

    if (player.bestMove) lines.push('  Лучший ход: ' + player.bestMove);
    var protocol = formatNumGroup(player.protocol);
    if (protocol) lines.push('  Протокол: ' + protocol);
    var opinion = formatNumGroup(player.opinion);
    if (opinion) lines.push('  Мнение: ' + opinion);
    if (player.note) lines.push('  Заметка: ' + player.note.replace(/\r?\n/g, '\n  '));
    return lines;
  }

  function buildRoleCompositionText(model) {
    var lines = [];
    Object.keys(model.composition).forEach(function (code) {
      var group = model.composition[code];
      lines.push(
        group.role +
          ': ' +
          group.playerIds
            .map(function (id) {
              return '№' + id;
            })
            .join(', ')
      );
    });
    return lines;
  }

  function renderText(model) {
    var lines = [
      'МАФИЯ — ПРОТОКОЛ ИГРЫ',
      'Вариант: ' + display(model.variant.label),
      'Ведущий: ' + display(model.host),
      'Победа: ' + display(model.winnerLabel),
      'Игроков: ' + model.playerCount,
    ];
    if (model.notes) lines.push('Общие заметки: ' + model.notes.replace(/\r?\n/g, '\n  '));

    lines.push('', 'РОЛИ');
    var roleLines = buildRoleCompositionText(model);
    Array.prototype.push.apply(lines, roleLines.length ? roleLines : [DASH]);

    lines.push('', 'СОСТАВ');
    model.players.forEach(function (player) {
      Array.prototype.push.apply(lines, buildPlayerText(player));
    });

    lines.push('', 'ХОД ИГРЫ');
    if (!model.events.length) {
      lines.push('Событий пока нет.');
    } else {
      model.events.forEach(function (event) {
        lines.push(event.number + '. ' + event.description);
      });
    }
    return lines.join('\n');
  }

  function csvEscape(value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (/[;"\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function csvRow(values) {
    return values.map(csvEscape).join(';');
  }

  function isoTime(timestamp) {
    if (typeof timestamp !== 'number') return '';
    try {
      return new Date(timestamp).toISOString();
    } catch (e) {
      return '';
    }
  }

  function renderCsv(model) {
    var rows = [
      ['ПАРТИЯ'],
      ['Поле', 'Значение'],
      ['Вариант', model.variant.label],
      ['Код варианта', model.variant.key],
      ['Ведущий', model.host],
      ['Победа', model.winnerLabel],
      ['Количество игроков', model.playerCount],
      ['Общие заметки', model.notes],
      [],
      ['СОСТАВ'],
      [
        '№',
        'Игрок',
        'Код роли',
        'Роль',
        'Команда',
        'Статус',
        'Причина выбытия',
        'Фолы',
        'Победа игрока',
        'Базовые очки',
        'Бонус',
        'Итого',
        'Лучший ход',
        'Протокол',
        'Мнение',
        'Заметка',
      ],
    ];

    model.players.forEach(function (player) {
      rows.push([
        player.id,
        player.nick,
        player.roleCode,
        player.role,
        player.teamLabel,
        player.status,
        player.eliminationReason,
        player.fouls,
        player.won === null ? '' : player.won ? 'да' : 'нет',
        player.basePoints === null ? '' : formatPoints(player.basePoints),
        player.bonus ? formatPoints(player.bonus) : '0',
        player.basePoints === null && !player.bonus ? '' : formatPoints(player.totalPoints),
        player.bestMove,
        formatNumGroup(player.protocol),
        formatNumGroup(player.opinion),
        player.note,
      ]);
    });

    rows.push(
      [],
      ['ХОД ИГРЫ'],
      [
        '№',
        'Дата и время',
        'Тип',
        'Описание',
        'Игрок',
        'Причина',
        'Кандидаты',
        'Голоса',
        'Кандидаты и голоса',
        'Ничья',
        'Выбыли',
        'Ночь',
        'Источник',
        'Действия',
        'Результат',
        'Исходные данные JSON',
      ]
    );
    model.events.forEach(function (event) {
      rows.push([
        event.number,
        isoTime(event.timestamp),
        event.type,
        event.description,
        event.playerId === null ? '' : event.playerId,
        event.reasonLabel,
        event.candidateIds.join(', '),
        event.votes.join(', '),
        event.votePairs.join('; '),
        event.tiedIds.join(', '),
        event.eliminatedIds.join(', '),
        event.nightNumber === null ? '' : event.nightNumber,
        event.source,
        event.actions,
        event.result,
        event.rawJson,
      ]);
    });
    return rows.map(csvRow).join('\r\n');
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

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyTextFallback(text);
      });
    }
    return copyTextFallback(text);
  }

  function timestampForFilename() {
    var now = new Date();
    function pad(value) {
      return value < 10 ? '0' + value : String(value);
    }
    return (
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '-' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds())
    );
  }

  app.buildGameExportText = function () {
    return renderText(app.buildGameExportModel());
  };

  app.buildGameExportCsv = function () {
    return '\ufeff' + renderCsv(app.buildGameExportModel());
  };

  app.copyGameExportToClipboard = function () {
    return copyText(app.buildGameExportText()).then(function () {
      if (app.showToast) app.showToast('Протокол игры скопирован');
    });
  };

  app.downloadGameExportCsv = function () {
    var blob = new Blob([app.buildGameExportCsv()], { type: 'text/csv;charset=utf-8' });
    var anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = 'mafia-game-' + timestampForFilename() + '.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(anchor.href);
  };
})(window.MafiaApp);
