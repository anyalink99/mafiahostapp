/**
 * Итоги — журнал партии: стабильная сортировка gameLog, разбор на раунды
 * (для нумерации и экспорта), синтетические «пропущенные» дни и текстовое
 * представление событий (formatHistoryItem).
 *
 * Файлы итогов общаются через app._summary (S); снаружи — только app.*.
 */
(function (app) {
  'use strict';

  var S = (app._summary = app._summary || {});

  var SUMMARY_SYNTHETIC_FIRST_DAY_DEFAULT =
    '#1 - никто не был выставлен или был выставлен один игрок, голосование пропущено';
  S.SYNTHETIC_FIRST_DAY_DEFAULT = SUMMARY_SYNTHETIC_FIRST_DAY_DEFAULT;

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
      var pfx;
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
    if (e.type === 'urban_night') {
      var a = e.actions || {};
      var res = e.result || {};
      function target(id) {
        return typeof id === 'number' ? '№' + id : 'пропуск';
      }
      var donResult =
        typeof a.donCheck === 'number' ? (res.donFoundSheriff ? ' — шериф' : ' — не шериф') : '';
      var sheriffResult =
        typeof a.sheriffCheck === 'number'
          ? res.sheriffFoundManiac
            ? ' — маньяк'
            : res.sheriffFoundMafia
            ? ' — мафия'
            : ' — не мафия'
          : '';
      var nightResult =
        res.deaths && res.deaths.length
          ? 'Погибли: ' + formatSeatNums(res.deaths) + '.'
          : 'Никто не погиб.';
      return (
        'Ночь ' +
        (e.nightNumber || '—') +
        ' — мафия: ' +
        target(a.mafiaShot) +
        '; дон: ' +
        target(a.donCheck) +
        donResult +
        '; шериф: ' +
        target(a.sheriffCheck) +
        sheriffResult +
        '; маньяк: ' +
        target(a.maniacShot) +
        '; красотка: ' +
        target(a.beautyVisit) +
        '; врач: ' +
        target(a.doctorHeal) +
        '. ' +
        nightResult
      );
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
      var lab = {
        hang: 'казнён (вне голосования)',
        shot: 'убит',
        disqual: 'удалён (фолы / дисквалификация)',
      };
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
  S.sortedLog = sortedLog;

  app.stableIndexedLog = function (log) {
    if (!Array.isArray(log)) return [];
    return log
      .map(function (e, i) {
        return { e: e, i: i };
      })
      .sort(function (a, b) {
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
      if (
        t === 'vote_tie' ||
        t === 'vote_raise_all' ||
        t === 'vote_hang' ||
        t === 'vote_no_elimination'
      ) {
        var cluster = [];
        while (j < indexed.length) {
          var ee = indexed[j].e;
          var tt = ee.type;
          if (
            tt !== 'vote_tie' &&
            tt !== 'vote_raise_all' &&
            tt !== 'vote_hang' &&
            tt !== 'vote_no_elimination'
          )
            break;
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
    return (
      tt === 'vote_tie' ||
      tt === 'vote_hang' ||
      tt === 'vote_no_elimination' ||
      tt === 'vote_raise_all' ||
      (tt === 'elimination' && e.outsideVoteSingleNominee)
    );
  }

  function isNightKill(e) {
    return e && e.type === 'elimination' && (e.reason === 'shot' || e.reason === 'disqual');
  }

  function isSameUrbanNightKillPair(a, b) {
    return !!(
      a &&
      b &&
      a.source === 'urban_night' &&
      b.source === 'urban_night' &&
      typeof a.nightNumber === 'number' &&
      a.nightNumber === b.nightNumber
    );
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
      if (isNightKill(prev) && isNightKill(curr) && !isSameUrbanNightKillPair(prev, curr)) {
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
  S.entryRoundNumWeakMap = gameLogEntryToRoundNumWeakMap;

  app.getSummarySyntheticFirstDayDisplayText = function () {
    if (
      app.summarySyntheticFirstDayLine != null &&
      String(app.summarySyntheticFirstDayLine).trim() !== ''
    ) {
      return String(app.summarySyntheticFirstDayLine);
    }
    return SUMMARY_SYNTHETIC_FIRST_DAY_DEFAULT;
  };

  function syntheticPairSkipDefaultText(roundNum) {
    return '#' + roundNum + ': никто не был выставлен, голосование пропущено';
  }
  S.syntheticPairSkipDefaultText = syntheticPairSkipDefaultText;

  function buildSyntheticSkipRowText(skipKey, roundNum) {
    if (skipKey === 'lead') return app.getSummarySyntheticFirstDayDisplayText();
    var o = app.summarySkipLineOverrides && app.summarySkipLineOverrides[skipKey];
    if (o != null && String(o).trim() !== '') return String(o);
    return syntheticPairSkipDefaultText(roundNum);
  }

  app.buildSummaryHistoryRows = function () {
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
      if (
        lix > 0 &&
        isNightKill(log[lix - 1]) &&
        isNightKill(entry) &&
        !isSameUrbanNightKillPair(log[lix - 1], entry)
      ) {
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
  };
})(window.MafiaApp);
