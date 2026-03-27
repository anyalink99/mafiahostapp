(function (app) {
  var SUMMARY_SYNTHETIC_FIRST_DAY_DEFAULT =
    '#1 - никто не был выставлен или был выставлен один игрок, голосование пропущено';

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  app.rolesFromDealForSeats = function () {
    if (!app.revealedIndices || app.revealedIndices.length !== app.players.length) return null;
    var n = app.players.length;
    var out = [];
    for (var j = 0; j < n; j++) {
      var ri = app.revealedIndices[j];
      if (ri === undefined || ri === null || !app.roles[ri]) return null;
      out[j] = app.roles[ri];
    }
    return out;
  };

  app.hasFullCardDeal = function () {
    return app.rolesFromDealForSeats() !== null;
  };

  app.getPlayerRoleOverrideKey = function (playerId) {
    return String(playerId);
  };

  app.setPlayerSpecialOverride = function (playerId, value) {
    var key = app.getPlayerRoleOverrideKey(playerId);
    if (!app.playerRoleOverrides || typeof app.playerRoleOverrides !== 'object') app.playerRoleOverrides = {};
    if (value === 'don' || value === 'sheriff') {
      for (var k in app.playerRoleOverrides) {
        if (Object.prototype.hasOwnProperty.call(app.playerRoleOverrides, k) && app.playerRoleOverrides[k] === value) {
          delete app.playerRoleOverrides[k];
        }
      }
      app.playerRoleOverrides[key] = value;
    } else {
      delete app.playerRoleOverrides[key];
    }
    app.saveState();
  };

  app.summaryWinnerChosen = function () {
    return app.winningTeam === 'mafia' || app.winningTeam === 'peaceful';
  };

  app.mapDealRoleToCode = function (r) {
    if (!r) return 'peaceful';
    if (r === 'Шериф') return 'sheriff';
    if (r === 'Дон') return 'don';
    if (r === 'Мафия') return 'mafia';
    return 'peaceful';
  };

  app.getEffectiveSummaryRoleCode = function (playerId, seatIndex) {
    var sid = String(playerId);
    if (app.summaryRoleByPlayerId && app.summaryRoleByPlayerId[sid]) {
      return app.summaryRoleByPlayerId[sid];
    }
    var deal = app.rolesFromDealForSeats();
    if (deal && deal[seatIndex] != null) {
      return app.mapDealRoleToCode(deal[seatIndex]);
    }
    return 'peaceful';
  };

  app.getFirstShotPlayerIdFromLog = function () {
    if (!Array.isArray(app.gameLog)) return null;
    var sorted = app.gameLog.slice().sort(function (a, b) {
      var ta = typeof a.ts === 'number' ? a.ts : 0;
      var tb = typeof b.ts === 'number' ? b.ts : 0;
      return ta - tb;
    });
    for (var i = 0; i < sorted.length; i++) {
      var ev = sorted[i];
      if (ev && ev.type === 'elimination' && ev.reason === 'shot' && typeof ev.playerId === 'number') {
        return ev.playerId;
      }
    }
    return null;
  };

  /** Колонка ПУ в экспорте: лучший ход — три номера, если тройка заполнена; иначе пусто. */
  app.formatBestMovePuForExport = function (stored) {
    if (!app.isBestMoveTripleComplete(stored)) return '';
    var tr = app.parseBestMoveTriple(stored);
    return tr[0] + ', ' + tr[1] + ', ' + tr[2];
  };

  function parseBonusFloat(raw) {
    if (raw === undefined || raw === null || raw === '') return 0;
    var v = parseFloat(String(raw).replace(',', '.'));
    if (isNaN(v)) return 0;
    return Math.round(v * 10) / 10;
  }

  app.formatBonusForDisplay = function (raw) {
    var v = parseBonusFloat(raw);
    if (v % 1 === 0) return String(Math.round(v));
    return String(v).replace('.', ',');
  };

  app.parseBestMoveTriple = function (stored) {
    if (stored === undefined || stored === null) return ['', '', ''];
    var s = String(stored).trim();
    if (!s) return ['', '', ''];
    var parts = s.split(/[\s,;]+/).filter(function (x) {
      return x !== '';
    });
    if (parts.length >= 3) {
      return [parts[0], parts[1], parts[2]];
    }
    if (/^\d{3}$/.test(s)) {
      return [s[0], s[1], s[2]];
    }
    return ['', '', ''];
  };

  app.isBestMoveTripleComplete = function (stored) {
    var p = app.parseBestMoveTriple(stored);
    for (var i = 0; i < 3; i++) {
      var n = parseInt(String(p[i]).trim(), 10);
      if (isNaN(n) || n < 1 || n > 10) return false;
    }
    return true;
  };

  app.countCompleteBestMoves = function () {
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object') return 0;
    var c = 0;
    for (var k in app.bestMoveByPlayerId) {
      if (!Object.prototype.hasOwnProperty.call(app.bestMoveByPlayerId, k)) continue;
      if (app.isBestMoveTripleComplete(app.bestMoveByPlayerId[k])) c++;
    }
    return c;
  };

  app.showSummaryBestMoveField = function (playerId) {
    var firstShot = app.getFirstShotPlayerIdFromLog();
    if (firstShot != null) {
      return playerId === firstShot;
    }
    if (app.countCompleteBestMoves() >= 1) {
      var key = String(playerId);
      return app.isBestMoveTripleComplete(app.bestMoveByPlayerId[key]);
    }
    return true;
  };

  app.serializeBestMoveTriple = function (a, b, c) {
    var x = String(a != null ? a : '').trim();
    var y = String(b != null ? b : '').trim();
    var z = String(c != null ? c : '').trim();
    if (!x && !y && !z) return '';
    return [x, y, z].join(',');
  };

  app.applySummaryBonusDelta = function (delta) {
    var inp = document.getElementById('modal-summary-bonus');
    if (!inp || inp.disabled) return;
    var v = parseBonusFloat(inp.value) + delta;
    v = Math.round(v * 10) / 10;
    inp.value = v % 1 === 0 ? String(Math.round(v)) : String(v).replace('.', ',');
  };

  app.formatHistoryItemAuto = function (e, roundNum) {
    function formatSeatNums(ids) {
      if (!ids || !ids.length) return '';
      var out = [];
      for (var si = 0; si < ids.length; si++) {
        out.push('№' + ids[si]);
      }
      return out.join(', ');
    }
    function raiseAllHeadFromTiedCount(n) {
      if (n === 2) return 'Поднятие обоих';
      return 'Поднятие всех';
    }
    function hangElimPhrase(ids) {
      var n = ids && ids.length ? ids.length : 0;
      if (n === 0) return '';
      if (n === 1) return 'казнён ' + formatSeatNums(ids);
      return 'казнены ' + formatSeatNums(ids);
    }
    function voteLine(candidateIds, votes) {
      if (!candidateIds || !candidateIds.length) return '';
      var parts = [];
      for (var i = 0; i < candidateIds.length; i++) {
        parts.push('№' + candidateIds[i] + ': ' + (votes && votes[i] != null ? votes[i] : '—'));
      }
      return 'Счёт: ' + parts.join('; ') + '.';
    }
    function voteRoundHead(isRevote) {
      var head = isRevote ? 'Переголосование' : 'Голосование';
      if (typeof roundNum === 'number' && roundNum > 0) head += ' #' + roundNum;
      return head;
    }
    if (e.type === 'vote_hang') {
      var elimIds = e.eliminatedIds || [];
      var raCount = (e.candidateIds || elimIds).length;
      var ra = '';
      if (e.viaRaiseAll) {
        ra = raCount === 2 ? ' (после поднятия обоих)' : ' (после поднятия всех)';
      }
      var vlh = voteLine(e.candidateIds, e.votes);
      if (
        e.viaRaiseAll &&
        typeof e.raiseAllVotes === 'number' &&
        typeof e.raiseAllPoolTotal === 'number'
      ) {
        var headRa = raiseAllHeadFromTiedCount((e.candidateIds || elimIds).length);
        if (typeof roundNum === 'number' && roundNum > 0) headRa += ' #' + roundNum;
        return (
          headRa +
          ' — ' +
          e.raiseAllVotes +
          '/' +
          e.raiseAllPoolTotal +
          ' голосов, большинство набрано, ' +
          hangElimPhrase(elimIds) +
          '.'
        );
      }
      var hangHead = voteRoundHead(e.tieRevote);
      return hangHead + ra + ' — ' + hangElimPhrase(elimIds) + (vlh ? '. ' + vlh : '');
    }
    if (e.type === 'vote_tie') {
      var td = (e.tiedIds || []).join(', №');
      var vlt = voteLine(e.candidateIds, e.votes);
      var tieLabel = voteRoundHead(e.isRevote);
      return tieLabel + ' — ничья между №' + td + (vlt ? '. ' + vlt : '');
    }
    if (e.type === 'vote_raise_all') {
      return '';
    }
    if (e.type === 'vote_no_elimination') {
      var tc = (e.tiedIds || []).length;
      var raHead = raiseAllHeadFromTiedCount(tc > 0 ? tc : 3);
      var pfx = '';
      if (typeof roundNum === 'number' && roundNum > 0) pfx = raHead + ' #' + roundNum + ' — ';
      else pfx = raHead + ' — ';
      if (typeof e.votesCast === 'number' && typeof e.poolTotal === 'number') {
        return (
          pfx +
          e.votesCast +
          '/' +
          e.poolTotal +
          ' голосов, большинство не набрано, игроки остаются за столом.'
        );
      }
      return pfx + 'большинство не набрано, выбывания нет.';
    }
    if (e.type === 'elimination') {
      if (e.reason === 'hang' && e.outsideVoteSingleNominee) {
        if (typeof roundNum === 'number' && roundNum > 0) {
          return (
            '#' +
            roundNum +
            ' — Игрок №' +
            e.playerId +
            ' — казнён (вне голосования: единственный выставленный)'
          );
        }
        return 'Игрок №' + e.playerId + ' — казнён (вне голосования: единственный выставленный)';
      }
      var lab = { hang: 'казнён (вне голосования)', shot: 'убит', disqual: 'удалён (фолы / дисквалификация)' };
      return 'Игрок №' + e.playerId + ' — ' + (lab[e.reason] || 'выбыл');
    }
    return typeof e === 'object' ? JSON.stringify(e) : String(e);
  };

  app.formatHistoryItem = function (e, roundNum) {
    if (e && typeof e.textOverride === 'string') {
      return e.textOverride;
    }
    return app.formatHistoryItemAuto(e, roundNum);
  };

  function summaryRoleCodeToIconId(code) {
    if (code === 'don') return 'icon-don';
    if (code === 'sheriff') return 'icon-sheriff';
    if (code === 'mafia') return 'icon-mafia';
    return 'icon-like';
  }

  function summaryRoleIconWrapClass(code) {
    var isMafiaSide = code === 'mafia' || code === 'don';
    if (isMafiaSide) {
      return 'flex h-9 w-9 shrink-0 items-center justify-center rounded border border-mafia-border bg-mafia-black text-mafia-gold sm:h-10 sm:w-10';
    }
    return 'flex h-9 w-9 shrink-0 items-center justify-center rounded border border-mafia-gold/40 bg-mafia-blood text-mafia-gold sm:h-10 sm:w-10';
  }

  /** Компактнее, чем summaryRoleIconWrapClass — для сетки «Подведение итогов». */
  function summaryRoleGridIconWrapClass(code) {
    var isMafiaSide = code === 'mafia' || code === 'don';
    if (isMafiaSide) {
      return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-border bg-mafia-black text-mafia-gold sm:h-9 sm:w-9';
    }
    return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-gold/40 bg-mafia-blood text-mafia-gold sm:h-9 sm:w-9';
  }

  var SUMMARY_TEAM_UNKNOWN_WRAP =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded border border-mafia-border/80 bg-black/25 text-mafia-gold/90 sm:h-10 sm:w-10';

  var SUMMARY_TEAM_SVG_CLASS = 'h-[1.35rem] w-[1.35rem] pointer-events-none sm:h-6 sm:w-6';

  function summaryWinningTeamIconWrapHtml(iconId) {
    return (
      '<svg class="' +
      SUMMARY_TEAM_SVG_CLASS +
      '" aria-hidden="true"><use href="#' +
      iconId +
      '"/></svg>'
    );
  }

  function renderSummaryWinningTeamRow(teamVal) {
    var row = document.getElementById('summary-winning-team-icons');
    if (!row) return;
    row.innerHTML = '';
    var opts = [
      { value: '', label: 'Не выбрано', mode: 'unknown' },
      { value: 'peaceful', label: 'Победили мирные', mode: 'peaceful' },
      { value: 'mafia', label: 'Победила мафия', mode: 'mafia' },
    ];
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var selected =
        o.value === teamVal || (o.value === '' && teamVal === '');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', selected ? 'true' : 'false');
      b.setAttribute('aria-label', o.label);
      b.dataset.summaryTeam = o.value;
      b.className =
        'flex shrink-0 cursor-pointer items-center justify-center rounded-lg border p-1 outline-none transition-[border-color,background-color,box-shadow,transform] hover:border-mafia-gold/40 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:p-1.5 ' +
        (selected
          ? 'border-mafia-gold/65 bg-black/20 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.35)]'
          : 'border-mafia-border bg-mafia-coal/80');
      var wrap = document.createElement('div');
      wrap.setAttribute('aria-hidden', 'true');
      if (o.mode === 'unknown') {
        wrap.className = SUMMARY_TEAM_UNKNOWN_WRAP;
        wrap.innerHTML =
          '<span class="font-display text-xl font-bold leading-none text-mafia-gold/95 sm:text-2xl">?</span>';
      } else if (o.mode === 'peaceful') {
        wrap.className = summaryRoleIconWrapClass('peaceful');
        wrap.innerHTML = summaryWinningTeamIconWrapHtml('icon-peaceful');
      } else {
        wrap.className = summaryRoleIconWrapClass('mafia');
        wrap.innerHTML = summaryWinningTeamIconWrapHtml('icon-mafia');
      }
      b.appendChild(wrap);
      b.onclick = (function (val) {
        return function () {
          app.winningTeam = val === 'mafia' || val === 'peaceful' ? val : null;
          app.saveState();
          app.renderSummary();
        };
      })(o.value);
      row.appendChild(b);
    }
  }

  function renderModalSummaryRoleRadios(selectedCode, enabled) {
    var row = document.getElementById('modal-summary-role-icons');
    if (!row) return;
    row.innerHTML = '';
    var opts = [
      { value: 'peaceful', label: 'Мирный житель' },
      { value: 'mafia', label: 'Мафия' },
      { value: 'don', label: 'Дон' },
      { value: 'sheriff', label: 'Шериф' },
    ];
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var selected = enabled && o.value === selectedCode;
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', selected ? 'true' : 'false');
      b.setAttribute('aria-label', o.label);
      b.dataset.summaryRole = o.value;
      b.disabled = !enabled;
      b.className =
        'flex shrink-0 cursor-pointer items-center justify-center rounded-lg border p-1 outline-none transition-[border-color,background-color,box-shadow,transform] hover:border-mafia-gold/40 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:p-1.5 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ' +
        (selected
          ? 'border-mafia-gold/65 bg-black/20 shadow-[inset_0_0_0_1px_rgba(212,175,55,0.35)]'
          : 'border-mafia-border bg-mafia-coal/80');
      var wrap = document.createElement('div');
      wrap.setAttribute('aria-hidden', 'true');
      wrap.className = summaryRoleIconWrapClass(o.value);
      wrap.innerHTML = summaryWinningTeamIconWrapHtml(summaryRoleCodeToIconId(o.value));
      b.appendChild(wrap);
      b.onclick = (function (val, en) {
        return function () {
          if (!en) return;
          renderModalSummaryRoleRadios(val, en);
        };
      })(o.value, enabled);
      row.appendChild(b);
    }
  }

  function getModalSummarySelectedRoleCode() {
    var row = document.getElementById('modal-summary-role-icons');
    if (!row) return null;
    var picked = row.querySelector('[role="radio"][aria-checked="true"]');
    return picked && picked.dataset.summaryRole ? picked.dataset.summaryRole : null;
  }

  function sortedLog() {
    if (!Array.isArray(app.gameLog)) return [];
    return app.gameLog
      .map(function (e, i) {
        return { e: e, i: i };
      })
      .sort(function (a, b) {
        var ta = typeof a.e.ts === 'number' ? a.e.ts : 0;
        var tb = typeof b.e.ts === 'number' ? b.e.ts : 0;
        if (ta !== tb) return ta - tb;
        return a.i - b.i;
      })
      .map(function (x) {
        return x.e;
      });
  }

  app.stableIndexedLog = function (log) {
    if (!Array.isArray(log)) return [];
    return log.map(function (e, i) {
      return { e: e, i: i };
    }).sort(function (a, b) {
      var ta = typeof a.e.ts === 'number' ? a.e.ts : 0;
      var tb = typeof b.e.ts === 'number' ? b.e.ts : 0;
      if (ta !== tb) return ta - tb;
      return a.i - b.i;
    });
  };

  app.parseExportRounds = function (log) {
    var indexed = app.stableIndexedLog(log);
    var rounds = [];
    var j = 0;
    while (j < indexed.length) {
      var e = indexed[j].e;
      var t = e.type;
      if (t === 'elimination' && e.outsideVoteSingleNominee) {
        rounds.push({ kind: 'single', events: [e] });
        j++;
        continue;
      }
      if (t === 'vote_tie' || t === 'vote_raise_all' || t === 'vote_hang' || t === 'vote_no_elimination') {
        var cluster = [];
        while (j < indexed.length) {
          var ee = indexed[j].e;
          var tt = ee.type;
          if (tt !== 'vote_tie' && tt !== 'vote_raise_all' && tt !== 'vote_hang' && tt !== 'vote_no_elimination') break;
          cluster.push(ee);
          j++;
          if (tt === 'vote_hang' || tt === 'vote_no_elimination') break;
        }
        rounds.push({ kind: 'vote', events: cluster });
        continue;
      }
      j++;
    }
    return rounds;
  };

  app.daytimeRoundContentExists = function (log) {
    if (!Array.isArray(log)) return false;
    for (var i = 0; i < log.length; i++) {
      var ev = log[i];
      if (!ev) continue;
      var tt = ev.type;
      if (
        tt === 'vote_tie' ||
        tt === 'vote_hang' ||
        tt === 'vote_no_elimination' ||
        tt === 'vote_raise_all'
      ) {
        return true;
      }
      if (tt === 'elimination' && ev.outsideVoteSingleNominee) return true;
    }
    return false;
  };

  function isDaytimeVoteEvent(e) {
    if (!e) return false;
    var tt = e.type;
    if (tt === 'vote_tie' || tt === 'vote_hang' || tt === 'vote_no_elimination' || tt === 'vote_raise_all') {
      return true;
    }
    return tt === 'elimination' && e.outsideVoteSingleNominee;
  }

  function isNightKill(e) {
    return e && e.type === 'elimination' && (e.reason === 'shot' || e.reason === 'disqual');
  }

  function exportRoundSortKey(round, indexed) {
    var min = Infinity;
    for (var i = 0; i < indexed.length; i++) {
      var evs = round.events;
      for (var k = 0; k < evs.length; k++) {
        if (indexed[i].e === evs[k]) min = Math.min(min, i);
      }
    }
    return min === Infinity ? 0 : min;
  }

  /**
   * Нужна ли строка «#1 — пропуск» перед дневными раундами: пустой/только ночь до первого дня,
   * либо только убийства/дисквалы до первого дневного события в хронологии.
   * Тогда #1 навсегда резервируется под пропуск, первое голосование — #2 и т.д.
   */
  app.shouldPrependFirstDaySkip = function (log) {
    if (!Array.isArray(log)) return false;
    if (!app.daytimeRoundContentExists(log)) return true;
    var indexed = app.stableIndexedLog(log);
    var firstDayIdx = -1;
    for (var i = 0; i < indexed.length; i++) {
      if (isDaytimeVoteEvent(indexed[i].e)) {
        firstDayIdx = i;
        break;
      }
    }
    if (firstDayIdx <= 0) return false;
    for (var j = 0; j < firstDayIdx; j++) {
      var ev = indexed[j].e;
      if (!ev) return false;
      if (ev.type === 'elimination' && (ev.reason === 'shot' || ev.reason === 'disqual')) continue;
      return false;
    }
    return true;
  };

  app.inferRoundsForExport = function (log) {
    var indexed = app.stableIndexedLog(log);
    var core = app.parseExportRounds(log);
    var pieces = [];
    for (var c = 0; c < core.length; c++) {
      pieces.push({
        kind: core[c].kind,
        events: core[c].events,
        sortKey: exportRoundSortKey(core[c], indexed),
      });
    }
    if (app.shouldPrependFirstDaySkip(log)) {
      pieces.push({
        kind: 'skip',
        synthetic: true,
        skipKey: 'lead',
        events: [],
        sortKey: -1,
      });
    }
    for (var j = 1; j < indexed.length; j++) {
      var prev = indexed[j - 1].e;
      var curr = indexed[j].e;
      if (isNightKill(prev) && isNightKill(curr)) {
        pieces.push({
          kind: 'skip',
          synthetic: true,
          skipKey: 'pair-' + j,
          events: [],
          sortKey: j - 0.5,
        });
      }
    }
    pieces.sort(function (a, b) {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      if (a.kind === 'skip' && b.kind !== 'skip') return -1;
      if (a.kind !== 'skip' && b.kind === 'skip') return 1;
      return 0;
    });
    var out = [];
    for (var p = 0; p < pieces.length; p++) {
      var item = pieces[p];
      var o = {
        kind: item.kind,
        events: item.events,
      };
      if (item.kind === 'skip') {
        o.synthetic = true;
        o.skipKey = item.skipKey;
      }
      out.push(o);
    }
    return out;
  };

  function gameLogEntryToRoundNumWeakMap() {
    var rounds = app.inferRoundsForExport(app.gameLog);
    var wm = new WeakMap();
    for (var r = 0; r < rounds.length; r++) {
      if (rounds[r].synthetic) continue;
      var evs = rounds[r].events;
      for (var k = 0; k < evs.length; k++) wm.set(evs[k], r + 1);
    }
    return wm;
  }

  app.getSummarySyntheticFirstDayDisplayText = function () {
    if (app.summarySyntheticFirstDayLine != null && String(app.summarySyntheticFirstDayLine).trim() !== '') {
      return String(app.summarySyntheticFirstDayLine);
    }
    return SUMMARY_SYNTHETIC_FIRST_DAY_DEFAULT;
  };

  function syntheticPairSkipDefaultText(roundNum) {
    return '#' + roundNum + ': никто не был выставлен, голосование пропущено';
  }

  function buildSyntheticSkipRowText(skipKey, roundNum) {
    if (skipKey === 'lead') return app.getSummarySyntheticFirstDayDisplayText();
    var o = app.summarySkipLineOverrides && app.summarySkipLineOverrides[skipKey];
    if (o != null && String(o).trim() !== '') return String(o);
    return syntheticPairSkipDefaultText(roundNum);
  }

  function buildSummaryHistoryRows() {
    var log = sortedLog();
    var wm = gameLogEntryToRoundNumWeakMap();
    var merged = app.inferRoundsForExport(app.gameLog);
    var skipKeyToRn = {};
    for (var r = 0; r < merged.length; r++) {
      if (merged[r].kind === 'skip' && merged[r].skipKey) {
        skipKeyToRn[merged[r].skipKey] = r + 1;
      }
    }
    var rows = [];
    if (app.shouldPrependFirstDaySkip(app.gameLog)) {
      rows.push({
        text: buildSyntheticSkipRowText('lead', skipKeyToRn['lead']),
        sortedIndex: -1,
        skipKey: 'lead',
      });
    }
    for (var lix = 0; lix < log.length; lix++) {
      var entry = log[lix];
      if (lix > 0 && isNightKill(log[lix - 1]) && isNightKill(entry)) {
        var pk = 'pair-' + lix;
        rows.push({
          text: buildSyntheticSkipRowText(pk, skipKeyToRn[pk]),
          sortedIndex: -1,
          skipKey: pk,
        });
      }
      if (!entry || entry.type === 'vote_round_skipped') continue;
      var rn = wm.get(entry);
      var txt = app.formatHistoryItem(entry, rn);
      if (!String(txt).trim()) continue;
      rows.push({ text: txt, sortedIndex: lix });
    }
    return rows;
  }

  app.hideSummaryPlayerModal = function () {
    var m = document.getElementById('modal-summary-player');
    if (m && app.modalSetOpen) app.modalSetOpen(m, false);
  };

  app._summaryLogSortedIndex = null;

  app.hideSummaryLogModal = function () {
    app._summaryLogSortedIndex = null;
    app._summaryLogSkipKey = null;
    var m = document.getElementById('modal-summary-log');
    if (m && app.modalSetOpen) app.modalSetOpen(m, false);
  };

  app.showSummaryLogModal = function (sortedIndex, skipKey) {
    if (!app.modalSetOpen) return;
    var m = document.getElementById('modal-summary-log');
    var ta = document.getElementById('modal-summary-log-text');
    if (skipKey) {
      app._summaryLogSortedIndex = -1;
      app._summaryLogSkipKey = skipKey;
      var rounds = app.inferRoundsForExport(app.gameLog);
      var rn = 1;
      for (var ri = 0; ri < rounds.length; ri++) {
        if (rounds[ri].kind === 'skip' && rounds[ri].skipKey === skipKey) {
          rn = ri + 1;
          break;
        }
      }
      if (skipKey === 'lead') {
        if (ta) ta.value = app.getSummarySyntheticFirstDayDisplayText();
      } else {
        var o = app.summarySkipLineOverrides && app.summarySkipLineOverrides[skipKey];
        var auto = syntheticPairSkipDefaultText(rn);
        if (ta) ta.value = o != null && String(o).trim() !== '' ? String(o) : auto;
      }
      app.modalSetOpen(m, true);
      return;
    }
    var log = sortedLog();
    var entry = log[sortedIndex];
    if (!entry) return;
    app._summaryLogSortedIndex = sortedIndex;
    app._summaryLogSkipKey = null;
    if (ta) {
      var wm = gameLogEntryToRoundNumWeakMap();
      var rn2 = wm.get(entry);
      var auto = app.formatHistoryItemAuto(entry, rn2);
      ta.value = typeof entry.textOverride === 'string' ? entry.textOverride : auto;
    }
    app.modalSetOpen(m, true);
  };

  app.applySummaryLogModal = function () {
    var sk = app._summaryLogSkipKey;
    if (sk) {
      var ta = document.getElementById('modal-summary-log-text');
      var val = ta ? ta.value : '';
      if (sk === 'lead') {
        var trimmed = val.trim();
        if (trimmed === '' || trimmed === SUMMARY_SYNTHETIC_FIRST_DAY_DEFAULT) {
          app.summarySyntheticFirstDayLine = null;
        } else {
          app.summarySyntheticFirstDayLine = val;
        }
      } else {
        if (!app.summarySkipLineOverrides || typeof app.summarySkipLineOverrides !== 'object') {
          app.summarySkipLineOverrides = {};
        }
        var rounds2 = app.inferRoundsForExport(app.gameLog);
        var rnum = 1;
        for (var rj = 0; rj < rounds2.length; rj++) {
          if (rounds2[rj].kind === 'skip' && rounds2[rj].skipKey === sk) {
            rnum = rj + 1;
            break;
          }
        }
        var autoPair = syntheticPairSkipDefaultText(rnum);
        var trimmedPair = val.trim();
        if (trimmedPair === '' || trimmedPair === autoPair) {
          delete app.summarySkipLineOverrides[sk];
        } else {
          app.summarySkipLineOverrides[sk] = val;
        }
      }
      app.saveState();
      app.hideSummaryLogModal();
      app.renderSummary();
      return;
    }
    var ix = app._summaryLogSortedIndex;
    if (ix === null || ix === undefined) return;
    var ta2 = document.getElementById('modal-summary-log-text');
    var val2 = ta2 ? ta2.value : '';
    var log = sortedLog();
    var entry = log[ix];
    if (!entry) {
      app.hideSummaryLogModal();
      return;
    }
    var wm = gameLogEntryToRoundNumWeakMap();
    var auto = app.formatHistoryItemAuto(entry, wm.get(entry));
    if (val2 === auto) {
      delete entry.textOverride;
    } else {
      entry.textOverride = val2;
    }
    app.saveState();
    app.hideSummaryLogModal();
    app.renderSummary();
  };

  app.showSummaryPlayerModal = function (playerId) {
    var m = document.getElementById('modal-summary-player');
    if (!m || !app.modalSetOpen) return;
    var p = app.players.find(function (x) {
      return x.id === playerId;
    });
    if (!p) return;
    var seatIndex = app.players.indexOf(p);
    var title = document.getElementById('modal-summary-player-title');
    var nickInp = document.getElementById('modal-summary-nick');
    var bonusInp = document.getElementById('modal-summary-bonus');
    var noteTa = document.getElementById('modal-summary-bonus-note');
    var hint = document.getElementById('modal-summary-locked-hint');
    var unlocked = app.summaryWinnerChosen();
    if (title) title.textContent = 'Игрок №' + playerId;
    if (nickInp) nickInp.value = p.nick != null ? String(p.nick) : '';
    m.dataset.playerId = String(playerId);
    var bk = String(playerId);
    if (!app.bonusPointsByPlayerId || typeof app.bonusPointsByPlayerId !== 'object') app.bonusPointsByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object') app.bonusNoteByPlayerId = {};
    if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object') app.summaryRoleByPlayerId = {};
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object') app.bestMoveByPlayerId = {};
    var bmWrap = document.getElementById('modal-summary-bestmove-wrap');
    var bm1 = document.getElementById('modal-summary-bestmove-1');
    var bm2 = document.getElementById('modal-summary-bestmove-2');
    var bm3 = document.getElementById('modal-summary-bestmove-3');
    var showBm = app.showSummaryBestMoveField(playerId);
    if (bmWrap) bmWrap.style.display = showBm ? 'flex' : 'none';
    var triple = app.parseBestMoveTriple(app.bestMoveByPlayerId[bk]);
    if (bm1) bm1.value = triple[0];
    if (bm2) bm2.value = triple[1];
    if (bm3) bm3.value = triple[2];
    if (bm1) bm1.disabled = !showBm;
    if (bm2) bm2.disabled = !showBm;
    if (bm3) bm3.disabled = !showBm;
    var braw = app.bonusPointsByPlayerId[bk];
    var bnum = parseBonusFloat(braw);
    if (bonusInp) {
      bonusInp.value = bnum % 1 === 0 ? String(Math.round(bnum)) : String(bnum).replace('.', ',');
    }
    var deltaBtns = m.querySelectorAll('[data-action="summary-bonus-delta"]');
    for (var db = 0; db < deltaBtns.length; db++) {
      deltaBtns[db].disabled = !unlocked;
    }
    if (noteTa) noteTa.value = app.bonusNoteByPlayerId[bk] != null ? String(app.bonusNoteByPlayerId[bk]) : '';
    var bonusSection = document.getElementById('modal-summary-bonus-section');
    var noteSection = document.getElementById('modal-summary-bonus-note-section');
    if (bonusSection) bonusSection.style.display = unlocked ? '' : 'none';
    if (noteSection) noteSection.style.display = unlocked ? '' : 'none';
    var roleSection = document.getElementById('modal-summary-role-section');
    if (roleSection) roleSection.style.display = unlocked ? '' : 'none';
    if (unlocked) {
      renderModalSummaryRoleRadios(app.getEffectiveSummaryRoleCode(playerId, seatIndex), true);
    } else {
      var roleRow = document.getElementById('modal-summary-role-icons');
      if (roleRow) roleRow.innerHTML = '';
    }
    if (bonusInp) bonusInp.disabled = !unlocked;
    if (noteTa) noteTa.disabled = !unlocked;
    if (hint) hint.style.display = unlocked ? 'none' : '';
    app.modalSetOpen(m, true);
  };

  app.applySummaryPlayerModal = function () {
    var m = document.getElementById('modal-summary-player');
    if (!m) return;
    var pid = parseInt(m.dataset.playerId, 10);
    if (isNaN(pid)) return;
    var pl = app.players.find(function (x) {
      return x.id === pid;
    });
    if (!pl) return;
    var nickInp = document.getElementById('modal-summary-nick');
    if (nickInp) pl.nick = nickInp.value.slice(0, 32);
    var unlocked = app.summaryWinnerChosen();
    var showBm = app.showSummaryBestMoveField(pid);
    var bm1 = document.getElementById('modal-summary-bestmove-1');
    var bm2 = document.getElementById('modal-summary-bestmove-2');
    var bm3 = document.getElementById('modal-summary-bestmove-3');
    var tripleStr =
      showBm && bm1 && bm2 && bm3 ? app.serializeBestMoveTriple(bm1.value, bm2.value, bm3.value) : '';
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object') app.bestMoveByPlayerId = {};
    if (!unlocked) {
      if (!showBm) {
        app.saveState();
        app.hideSummaryPlayerModal();
        app.renderSummary();
        return;
      }
      if (bm1 && bm2 && bm3) {
        app.bestMoveByPlayerId[String(pid)] = tripleStr;
      }
      app.saveState();
      app.hideSummaryPlayerModal();
      app.renderSummary();
      return;
    }
    if (showBm && bm1 && bm2 && bm3) {
      app.bestMoveByPlayerId[String(pid)] = tripleStr;
    }
    var bonusInp = document.getElementById('modal-summary-bonus');
    var noteTa = document.getElementById('modal-summary-bonus-note');
    var v = bonusInp ? parseBonusFloat(bonusInp.value) : 0;
    if (!app.bonusPointsByPlayerId || typeof app.bonusPointsByPlayerId !== 'object') app.bonusPointsByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object') app.bonusNoteByPlayerId = {};
    if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object') app.summaryRoleByPlayerId = {};
    app.bonusPointsByPlayerId[String(pid)] = v;
    app.bonusNoteByPlayerId[String(pid)] = noteTa ? noteTa.value : '';
    var roleCode = getModalSummarySelectedRoleCode();
    if (roleCode) {
      app.summaryRoleByPlayerId[String(pid)] = roleCode;
    }
    app.saveState();
    app.hideSummaryPlayerModal();
    app.renderSummary();
  };

  app.renderSummary = function () {
    if (!Array.isArray(app.gameLog)) app.gameLog = [];
    if (!app.bonusPointsByPlayerId || typeof app.bonusPointsByPlayerId !== 'object') app.bonusPointsByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object') app.bonusNoteByPlayerId = {};
    if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object') app.summaryRoleByPlayerId = {};
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object') app.bestMoveByPlayerId = {};
    if (app.summaryHostName === undefined || app.summaryHostName === null) app.summaryHostName = '';
    if (app.summarySyntheticFirstDayLine === undefined) app.summarySyntheticFirstDayLine = null;
    if (!app.summarySkipLineOverrides || typeof app.summarySkipLineOverrides !== 'object') {
      app.summarySkipLineOverrides = {};
    }

    var unlocked = app.summaryWinnerChosen();

    var hostInp = document.getElementById('summary-host-name');
    if (hostInp) {
      var hostStr = String(app.summaryHostName);
      if (document.activeElement !== hostInp) hostInp.value = hostStr;
      hostInp.oninput = function () {
        app.summaryHostName = this.value;
        app.saveState();
      };
    }

    var hist = document.getElementById('summary-history');
    var histEmpty = document.getElementById('summary-history-empty');
    if (hist && histEmpty) {
      hist.innerHTML = '';
      var rows = buildSummaryHistoryRows();
      if (!rows.length) {
        histEmpty.style.display = '';
        hist.style.display = 'none';
      } else {
        histEmpty.style.display = 'none';
        hist.style.display = '';
        for (var vi = 0; vi < rows.length; vi++) {
          var row = rows[vi];
          var li = document.createElement('li');
          li.className = 'pl-0.5';
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.setAttribute('data-action', 'summary-log-open');
          btn.setAttribute('data-summary-log-index', String(row.sortedIndex));
          if (row.skipKey) btn.setAttribute('data-summary-skip-key', row.skipKey);
          btn.textContent = row.text;
          btn.title = row.text;
          btn.className =
            'line-clamp-2 w-full max-w-full cursor-pointer rounded border border-transparent bg-transparent py-0.5 text-left text-sm leading-snug text-mafia-cream/85 transition-colors hover:border-mafia-border/40 hover:bg-black/15 hover:text-mafia-cream';
          li.appendChild(btn);
          hist.appendChild(li);
        }
      }
    }

    var grid = document.getElementById('summary-roles-grid');
    if (grid) {
      grid.innerHTML = '';
      var n = app.players.length;
      var rowCount = Math.max(1, Math.ceil(n / 2));
      grid.className =
        'grid h-full min-h-0 min-w-0 grid-flow-col grid-cols-2 gap-1.5 overflow-hidden';
      grid.style.gridTemplateRows = 'repeat(' + rowCount + ', minmax(0, 1fr))';

      for (var p = 0; p < n; p++) {
        var sid = app.players[p].id;
        var pl = app.players[p];
        var nickTrim = pl.nick != null ? String(pl.nick).trim() : '';
        var bk = String(sid);
        var braw = app.bonusPointsByPlayerId[bk];
        var bonusText = app.formatBonusForDisplay(braw);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-action', 'summary-player-open');
        btn.setAttribute('data-player-id', String(sid));
        btn.className =
          'player-cell flex h-full min-h-0 min-w-0 w-full cursor-pointer flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-1.5 pt-1.5 pb-0.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2 sm:pt-2 sm:pb-1';
        btn.setAttribute(
          'aria-label',
          nickTrim ? 'Игрок №' + sid + ', псевдоним ' + nickTrim : 'Игрок №' + sid
        );

        var topRow = document.createElement('div');
        topRow.className =
          'player-slot__row grid w-full min-h-0 shrink-0 grid-cols-3 items-center gap-x-1';

        var iconWrap = document.createElement('div');
        iconWrap.setAttribute('aria-hidden', 'true');
        if (!unlocked) {
          iconWrap.className =
            'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-border/80 bg-black/25 text-mafia-gold/90 sm:h-9 sm:w-9';
          iconWrap.innerHTML =
            '<span class="font-display text-lg font-bold leading-none text-mafia-gold/95 sm:text-xl">?</span>';
        } else {
          var code = app.getEffectiveSummaryRoleCode(sid, p);
          var iconId = summaryRoleCodeToIconId(code);
          iconWrap.className = summaryRoleGridIconWrapClass(code);
          iconWrap.innerHTML =
            '<svg class="h-5 w-5 pointer-events-none sm:h-[1.35rem] sm:w-[1.35rem]" aria-hidden="true"><use href="#' +
            iconId +
            '"/></svg>';
        }

        var leftCol = document.createElement('div');
        leftCol.className = 'flex min-w-0 justify-start';
        leftCol.appendChild(iconWrap);

        var numSpan = document.createElement('span');
        numSpan.className =
          'font-display text-2xl font-bold leading-none tracking-wide text-mafia-gold tabular-nums text-center sm:text-3xl';
        numSpan.textContent = '№' + sid;

        var bonusInner = document.createElement('span');
        bonusInner.className =
          'font-display text-xs font-semibold leading-none tabular-nums sm:text-sm text-mafia-cream/95';
        bonusInner.textContent = 'Д: ' + bonusText;

        var pillWrap = document.createElement('div');
        pillWrap.className =
          'player-slot__foul-pill flex shrink-0 items-center justify-center rounded border border-mafia-border/35 bg-black/25 px-1.5 py-0.5 sm:px-2 sm:py-1';
        pillWrap.appendChild(bonusInner);

        var rightCol = document.createElement('div');
        rightCol.className = 'flex min-w-0 justify-end';
        rightCol.appendChild(pillWrap);

        topRow.appendChild(leftCol);
        topRow.appendChild(numSpan);
        topRow.appendChild(rightCol);

        var nickRowClass =
          'player-slot-nick mt-0.5 mb-1 min-h-[1.375rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-1.5 py-0.5 text-center font-sans text-xs leading-snug sm:min-h-[1.5rem] sm:px-2 sm:py-1 sm:text-sm ' +
          (nickTrim ? 'text-mafia-cream/95' : 'text-mafia-cream/30');
        var nickRow = document.createElement('div');
        nickRow.className = nickRowClass;
        nickRow.setAttribute('role', 'presentation');
        nickRow.innerHTML = nickTrim ? escapeHtml(nickTrim) : 'Псевдоним';

        btn.appendChild(topRow);
        btn.appendChild(nickRow);
        grid.appendChild(btn);
      }
    }

    var teamVal = app.winningTeam === 'mafia' || app.winningTeam === 'peaceful' ? app.winningTeam : '';
    renderSummaryWinningTeamRow(teamVal);
  };
})(window.MafiaApp);
