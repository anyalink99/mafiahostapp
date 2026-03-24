(function (app) {
  function parseBonusFloat(raw) {
    if (raw === undefined || raw === null || raw === '') return 0;
    var v = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(v)) return 0;
    return Math.round(v * 10) / 10;
  }

  function roleLabelRu(code) {
    if (code === 'don') return 'Дон';
    if (code === 'sheriff') return 'Шериф';
    if (code === 'mafia') return 'Мафия';
    return 'Мирный';
  }

  function formatCompactVotes(candidateIds, votes) {
    if (!candidateIds || !candidateIds.length) return '';
    var parts = [];
    for (var i = 0; i < candidateIds.length; i++) {
      parts.push('№' + candidateIds[i] + '-' + (votes && votes[i] != null ? votes[i] : '—'));
    }
    return parts.join(', ');
  }

  function voteClusterSegments(cluster) {
    var segs = [];
    for (var i = 0; i < cluster.length; i++) {
      var ev = cluster[i];
      if (ev.type === 'vote_tie') {
        var st = formatCompactVotes(ev.candidateIds, ev.votes);
        if (st) segs.push(st);
        continue;
      }
      if (ev.type === 'vote_hang' && !ev.viaRaiseAll) {
        var sh = formatCompactVotes(ev.candidateIds, ev.votes);
        if (sh) segs.push(sh);
      }
    }
    return segs;
  }

  function voteClusterOutcome(cluster) {
    var last = cluster[cluster.length - 1];
    if (!last) return 'оставили';
    if (last.type === 'vote_no_elimination') return 'оставили';
    if (last.type === 'vote_hang') {
      var ids = last.eliminatedIds || [];
      if (ids.length === 1) return 'казнен №' + ids[0];
      if (ids.length > 1)
        return (
          'казнены ' +
          ids
            .map(function (id) {
              return '№' + id;
            })
            .join(', ')
        );
    }
    return 'оставили';
  }

  function buildVoteBlockLine(round, roundNum) {
    if (round.kind === 'skip') {
      if (round.skipKey === 'lead' && app.getSummarySyntheticFirstDayDisplayText) {
        return app.getSummarySyntheticFirstDayDisplayText();
      }
      if (round.skipKey && round.skipKey !== 'lead' && app.summarySkipLineOverrides) {
        var ovr = app.summarySkipLineOverrides[round.skipKey];
        if (ovr != null && String(ovr).trim() !== '') return String(ovr);
      }
      if (roundNum === 1) {
        return (
          '#1 - никто не был выставлен или был выставлен один игрок, голосование пропущено'
        );
      }
      return '#' + roundNum + ': никто не был выставлен, голосование пропущено';
    }
    if (round.kind === 'single') {
      var ev = round.events[0];
      var pid = ev.playerId;
      var pool = typeof ev.votePoolTotal === 'number' ? ev.votePoolTotal : '';
      return '#' + roundNum + ': №' + pid + '-' + pool + '; казнен №' + pid;
    }
    var cluster = round.events;
    var segs = voteClusterSegments(cluster);
    var out = voteClusterOutcome(cluster);
    var body = segs.length ? segs.join('; ') + '; ' + out : out;
    return '#' + roundNum + ': ' + body;
  }

  function didPlayerWin(playerId, seatIndex) {
    var wt = app.winningTeam;
    if (wt !== 'mafia' && wt !== 'peaceful') return false;
    var code = app.getEffectiveSummaryRoleCode(playerId, seatIndex);
    if (wt === 'mafia') return code === 'mafia' || code === 'don';
    return code === 'peaceful' || code === 'sheriff';
  }

  function formatBonusSigned(raw) {
    var v = parseBonusFloat(raw);
    if (v === 0) return '';
    var s = app.formatBonusForDisplay ? app.formatBonusForDisplay(raw) : String(v);
    if (v > 0) return '+' + s;
    return s;
  }

  function buildHeaderText() {
    var lines = [];
    var host = app.summaryHostName != null ? String(app.summaryHostName).trim() : '';
    lines.push('Ведущий: ' + (host || '—'));

    var n = app.players.length;
    for (var p = 0; p < n; p++) {
      var pl = app.players[p];
      var sid = pl.id;
      var seatIndex = p;
      var nick = pl.nick != null ? String(pl.nick).trim() : '';
      var parts = [];
      if (nick) parts.push(nick);
      var bk = String(sid);
      var bm = app.bestMoveByPlayerId && app.bestMoveByPlayerId[bk];
      var puLine = app.formatBestMovePuForExport ? app.formatBestMovePuForExport(bm) : '';
      if (puLine) parts.push('ПУ: ' + puLine);
      var bonusRaw = app.bonusPointsByPlayerId && app.bonusPointsByPlayerId[bk];
      var bnum = parseBonusFloat(bonusRaw);
      if (bnum !== 0) {
        parts.push(formatBonusSigned(bonusRaw));
      }
      var note = app.bonusNoteByPlayerId && app.bonusNoteByPlayerId[bk];
      if (note != null && String(note).trim()) {
        parts.push(String(note).trim());
      }
      var rest = parts.length ? parts.join(', ') : '—';
      lines.push('Игрок ' + sid + ': ' + rest);
    }

    var mafiaNums = [];
    var donNum = '';
    var sheriffNum = '';
    for (var q = 0; q < n; q++) {
      var pid = app.players[q].id;
      var code = app.getEffectiveSummaryRoleCode(pid, q);
      if (code === 'mafia') mafiaNums.push(String(pid));
      else if (code === 'don') donNum = String(pid);
      else if (code === 'sheriff') sheriffNum = String(pid);
    }
    lines.push('Мафия: ' + (mafiaNums.length ? mafiaNums.join(', ') : '—'));
    lines.push('Дон: ' + (donNum || '—'));
    lines.push('Шериф: ' + (sheriffNum || '—'));

    var winLine = '—';
    if (app.winningTeam === 'mafia') winLine = 'мафия';
    else if (app.winningTeam === 'peaceful') winLine = 'мирные';
    lines.push('Победа: ' + winLine);

    return lines.join('\n');
  }

  function buildFullExportText() {
    var header = buildHeaderText();
    var rounds = app.inferRoundsForExport(app.gameLog);
    var voteLines = [];
    for (var r = 0; r < rounds.length; r++) {
      voteLines.push(buildVoteBlockLine(rounds[r], r + 1));
    }
    if (!voteLines.length) return header;
    return header + '\n\n' + voteLines.join('\n');
  }

  function csvEscape(cell) {
    var s = cell === undefined || cell === null ? '' : String(cell);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function splitBonusForCsv(raw) {
    var v = parseBonusFloat(raw);
    if (v === 0) return { plus: '', minus: '' };
    if (v > 0) return { plus: app.formatBonusForDisplay(raw), minus: '' };
    return { plus: '', minus: app.formatBonusForDisplay(Math.abs(v)) };
  }

  /** A–G: таблица игроков; H: подписи голосования; I–R: до 10 ячеек данных. */
  var STAT_COLS = 7;
  var VOTE_SLOT_COLS = 10;
  var CSV_ROW_COLS = STAT_COLS + 1 + VOTE_SLOT_COLS;

  function padStatRow(cells7) {
    var row = cells7.slice();
    while (row.length < CSV_ROW_COLS) row.push('');
    return row.map(csvEscape);
  }

  /** A–G пусто; H — подпись; I–R — числа голосования. */
  function makeVoteRow(labelH, slotValues) {
    var row = [];
    while (row.length < STAT_COLS) row.push('');
    row.push(labelH);
    var slots = slotValues || [];
    for (var i = 0; i < VOTE_SLOT_COLS; i++) {
      var v = i < slots.length ? slots[i] : '';
      row.push(v !== undefined && v !== null && v !== '' ? String(v) : '');
    }
    return row.map(csvEscape);
  }

  /** Только номера казнённых через запятую; если никого — «—». В CSV — колонка K. */
  function clusterExecutedIdsComma(cluster) {
    var last = cluster[cluster.length - 1];
    if (!last) return '—';
    if (last.type === 'vote_no_elimination') return '—';
    if (last.type === 'vote_hang') {
      var ids = last.eliminatedIds || [];
      if (!ids.length) return '—';
      return ids.join(', ');
    }
    return '—';
  }

  /** Технический тег (колонка L) для кластера голосования. */
  function clusterEliminationTag(cluster) {
    var last = cluster[cluster.length - 1];
    if (!last) return 'no_elimination';
    if (last.type === 'vote_no_elimination') return 'no_elimination';
    if (last.type === 'vote_hang') {
      var ids = last.eliminatedIds || [];
      if (!ids.length) return 'no_elimination';
      if (ids.length === 1) return 'vote_hanged';
      return 'vote_hanged_multiple';
    }
    return 'no_elimination';
  }

  /** A–G пусто; H «Казнены»; I–J пусто; K — номера; L — tag (snake_case). */
  function makeKaznenyRow(idsCommaOrDash, tagEn) {
    var row = [];
    while (row.length < STAT_COLS) row.push('');
    row.push('Казнены');
    row.push('');
    row.push('');
    var val =
      idsCommaOrDash != null && String(idsCommaOrDash).trim() !== ''
        ? String(idsCommaOrDash).trim()
        : '—';
    row.push(val);
    row.push(tagEn != null && String(tagEn).trim() !== '' ? String(tagEn).trim() : '');
    while (row.length < CSV_ROW_COLS) row.push('');
    return row.map(csvEscape);
  }

  function emptyPaddedRow() {
    return padStatRow(['', '', '', '', '', '', '']);
  }

  function slotsFromIds(ids) {
    var out = [];
    if (!ids || !ids.length) return out;
    for (var i = 0; i < Math.min(ids.length, VOTE_SLOT_COLS); i++) out.push(ids[i]);
    return out;
  }

  function slotsFromVotes(candidateIds, votes) {
    var out = [];
    if (!candidateIds || !candidateIds.length) return out;
    for (var i = 0; i < Math.min(candidateIds.length, VOTE_SLOT_COLS); i++) {
      out.push(votes && votes[i] != null ? votes[i] : '');
    }
    return out;
  }

  function bonusRawForPlayer(bk) {
    var m = app.bonusPointsByPlayerId;
    if (!m || typeof m !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(m, bk)) return m[bk];
    if (Object.prototype.hasOwnProperty.call(m, Number(bk))) return m[Number(bk)];
    return undefined;
  }

  function buildCsv() {
    var rows = [];
    var host = app.summaryHostName != null ? String(app.summaryHostName).trim() : '';
    rows.push(padStatRow(['Ведущий', host || '—', '', '', '', '', '']));
    var winCell = '—';
    if (app.winningTeam === 'mafia') winCell = 'Мафия';
    else if (app.winningTeam === 'peaceful') winCell = 'Мирные';
    rows.push(padStatRow(['Победа', winCell, '', '', '', '', '']));
    rows.push(emptyPaddedRow());
    rows.push(padStatRow(['#', 'Игрок', 'Роль', 'ПУ', 'Доп +', 'Доп −', '∑']));

    var n = app.players.length;
    for (var p = 0; p < n; p++) {
      var pl = app.players[p];
      var sid = pl.id;
      var bk = String(sid);
      var nick = pl.nick != null ? String(pl.nick).trim() : '';
      var code = app.getEffectiveSummaryRoleCode(sid, p);
      var roleRu = roleLabelRu(code);
      var bm = app.bestMoveByPlayerId && app.bestMoveByPlayerId[bk];
      var pu = app.formatBestMovePuForExport ? app.formatBestMovePuForExport(bm) : '';
      var braw = bonusRawForPlayer(bk);
      var split = splitBonusForCsv(braw);
      var bonusVal = parseBonusFloat(braw);
      var sum = (didPlayerWin(sid, p) ? 1 : 0) + bonusVal;
      sum = Math.round(sum * 10) / 10;
      var sumStr = app.formatBonusForDisplay(String(sum));
      rows.push(
        padStatRow([
          String(sid),
          nick || '—',
          roleRu,
          pu,
          split.plus,
          split.minus,
          sumStr,
        ])
      );
    }

    var rounds = app.inferRoundsForExport(app.gameLog);
    var firstVoteTargetLine = 15;
    var linesBeforeVoteBlock = 4 + n;
    var padBeforeVotes = Math.max(0, firstVoteTargetLine - linesBeforeVoteBlock - 1);
    for (var pe = 0; pe < padBeforeVotes; pe++) {
      rows.push(emptyPaddedRow());
    }

    for (var r = 0; r < rounds.length; r++) {
      var rn = r + 1;
      var round = rounds[r];
      if (round.kind === 'skip') {
        rows.push(makeVoteRow('Голосование #' + rn, []));
        rows.push(makeVoteRow('Выставленные игроки', ['—']));
        rows.push(makeVoteRow('Голоса за игроков', ['—']));
        rows.push(makeVoteRow('Голоса за игроков на переголосовании', ['—']));
        rows.push(makeKaznenyRow('—', 'vote_skipped'));
        continue;
      }
      if (round.kind === 'single') {
        var sev = round.events[0];
        var spid = sev.playerId;
        var pool = typeof sev.votePoolTotal === 'number' ? sev.votePoolTotal : '';
        rows.push(makeVoteRow('Голосование #' + rn, []));
        rows.push(makeVoteRow('Выставленные игроки', [spid]));
        rows.push(makeVoteRow('Голоса за игроков', [pool]));
        rows.push(makeVoteRow('Голоса за игроков на переголосовании', ['—']));
        rows.push(makeKaznenyRow(String(spid), 'sole_nominee_hanged'));
        continue;
      }
      var cluster = round.events;
      if (cluster.length === 1 && cluster[0].type === 'vote_no_elimination') {
        var neOnly = cluster[0];
        rows.push(makeVoteRow('Голосование #' + rn, []));
        rows.push(makeVoteRow('Выставленные игроки', ['—']));
        if (
          typeof neOnly.votesCast === 'number' &&
          typeof neOnly.poolTotal === 'number'
        ) {
          rows.push(makeVoteRow('Голоса за игроков', [neOnly.votesCast, neOnly.poolTotal]));
        } else {
          rows.push(makeVoteRow('Голоса за игроков', ['—']));
        }
        rows.push(makeVoteRow('Голоса за игроков на переголосовании', ['—']));
        rows.push(makeKaznenyRow('—', 'no_elimination'));
        continue;
      }
      var firstTie = null;
      var secondTie = null;
      var lastHang = null;
      for (var i = 0; i < cluster.length; i++) {
        if (cluster[i].type === 'vote_tie') {
          if (!firstTie) firstTie = cluster[i];
          else if (!secondTie) secondTie = cluster[i];
        }
        if (cluster[i].type === 'vote_hang') lastHang = cluster[i];
      }
      var nomIds = firstTie
        ? firstTie.candidateIds || []
        : lastHang
          ? lastHang.candidateIds || []
          : [];

      var v1Source = firstTie || lastHang;
      var slots1 = v1Source
        ? slotsFromVotes(v1Source.candidateIds, v1Source.votes)
        : [];

      var slots4 = [];
      if (secondTie) {
        slots4 = slotsFromVotes(secondTie.candidateIds, secondTie.votes);
      } else if (firstTie && lastHang && firstTie !== lastHang && !lastHang.viaRaiseAll) {
        slots4 = slotsFromVotes(lastHang.candidateIds, lastHang.votes);
      } else if (cluster.length && cluster[cluster.length - 1].type === 'vote_no_elimination') {
        var ne = cluster[cluster.length - 1];
        if (firstTie && !lastHang) {
          if (typeof ne.votesCast === 'number' && typeof ne.poolTotal === 'number') {
            slots4 = [ne.votesCast, ne.poolTotal];
          }
        }
      }
      if (!slots4.length) slots4 = ['—'];

      rows.push(makeVoteRow('Голосование #' + rn, []));
      var nomSlots = slotsFromIds(nomIds);
      rows.push(makeVoteRow('Выставленные игроки', nomSlots.length ? nomSlots : ['—']));
      rows.push(makeVoteRow('Голоса за игроков', slots1.length ? slots1 : ['—']));
      rows.push(makeVoteRow('Голоса за игроков на переголосовании', slots4));
      rows.push(
        makeKaznenyRow(clusterExecutedIdsComma(cluster), clusterEliminationTag(cluster))
      );
    }

    return rows.map(function (row) {
      return row.join(',');
    }).join('\r\n');
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        copyTextFallback(text);
      });
    }
    copyTextFallback(text);
    return Promise.resolve();
  }

  function copyTextFallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-2000px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(ta);
  }

  app.buildGameExportText = function () {
    return buildFullExportText();
  };

  app.buildGameExportCsv = function () {
    return '\ufeff' + buildCsv();
  };

  app.copyGameExportToClipboard = function () {
    return copyTextToClipboard(buildFullExportText()).then(function () {
      if (app.showToast) app.showToast('Скопировано в буфер обмена');
    });
  };

  app.downloadGameExportCsv = function () {
    var csv = app.buildGameExportCsv();
    var now = new Date();
    var pad = function (x) {
      return x < 10 ? '0' + x : String(x);
    };
    var fname =
      'mafia-export-' +
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '-' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      pad(now.getSeconds()) +
      '.csv';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };
})(window.MafiaApp);
