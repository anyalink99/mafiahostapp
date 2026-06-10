/**
 * Итоги — рендер экрана (summary-screen): имя ведущего, журнал партии,
 * сетка игроков с ролями/допами и выбор победившей команды.
 *
 * Журнал/раунды — в log.js, данные игроков — в player-data.js,
 * модалки — в modals.js; общие иконные хелперы — app._summary (S).
 */
(function (app) {
  'use strict';

  var S = (app._summary = app._summary || {});
  var escapeHtml = app.escapeHtml;
  var parseBonusFloat = app.parseBonusFloat;

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
      var selected = o.value === teamVal || (o.value === '' && teamVal === '');
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
        wrap.className = S.TEAM_UNKNOWN_WRAP;
        wrap.innerHTML =
          '<span class="font-display text-xl font-bold leading-none text-mafia-gold/95 sm:text-2xl">?</span>';
      } else if (o.mode === 'peaceful') {
        wrap.className = S.roleIconWrapClass('peaceful');
        wrap.innerHTML = S.teamIconHtml('icon-peaceful');
      } else {
        wrap.className = S.roleIconWrapClass('mafia');
        wrap.innerHTML = S.teamIconHtml('icon-mafia');
      }
      b.appendChild(wrap);
      b.setAttribute('data-action', 'summary-team-pick');
      row.appendChild(b);
    }
  }

  app.renderSummary = function () {
    if (!Array.isArray(app.gameLog)) app.gameLog = [];
    if (!app.bonusPointsByPlayerId || typeof app.bonusPointsByPlayerId !== 'object')
      app.bonusPointsByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object')
      app.bonusNoteByPlayerId = {};
    if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object')
      app.summaryRoleByPlayerId = {};
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object')
      app.bestMoveByPlayerId = {};
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
      var rows = app.buildSummaryHistoryRows();
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
        'grid flex-1 min-h-0 min-w-0 grid-flow-col grid-cols-2 gap-1.5 overflow-hidden';
      grid.style.gridTemplateRows = 'repeat(' + rowCount + ', minmax(0, 1fr))';

      var sumOrder = app.playerSeatIndicesForTwoColumnDisplay(n);
      for (var si = 0; si < sumOrder.length; si++) {
        var seatIndex = sumOrder[si];
        var sid = app.players[seatIndex].id;
        var pl = app.players[seatIndex];
        var nickTrim = pl.nick != null ? String(pl.nick).trim() : '';
        var bk = String(sid);
        var braw = app.bonusPointsByPlayerId[bk];
        var bnum = parseBonusFloat(braw);
        var bonusText = app.formatBonusForDisplay(braw);

        var slotBtn = document.createElement('button');
        slotBtn.type = 'button';
        slotBtn.setAttribute('data-action', 'summary-player-open');
        slotBtn.setAttribute('data-player-id', String(sid));
        slotBtn.className =
          'player-cell flex h-full min-h-0 min-w-0 w-full cursor-pointer flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-1.5 pt-1.5 pb-0.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45 sm:px-2 sm:pt-2 sm:pb-1';
        slotBtn.setAttribute(
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
          var code = app.getEffectiveSummaryRoleCode(sid, seatIndex);
          var iconId = S.roleCodeToIconId(code);
          iconWrap.className = S.roleGridIconWrapClass(code);
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
          'font-sans font-semibold leading-none tabular-nums text-sm sm:text-base text-mafia-cream/95';
        bonusInner.textContent = 'д: ' + bonusText;

        var pillWrap = document.createElement('div');
        pillWrap.className =
          'player-slot__foul-pill flex shrink-0 items-center justify-center rounded border px-2 py-1 ' +
          (bnum > 2
            ? 'border-mafia-blood/55 bg-mafia-blood'
            : 'border-mafia-border/35 bg-black/25');
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

        slotBtn.appendChild(topRow);
        slotBtn.appendChild(nickRow);
        grid.appendChild(slotBtn);
      }
    }

    var teamVal =
      app.winningTeam === 'mafia' || app.winningTeam === 'peaceful' ? app.winningTeam : '';
    renderSummaryWinningTeamRow(teamVal);

    var gs = document.getElementById('game-screen');
    if (gs && gs.classList.contains('active') && app.renderGameSidePanels) {
      app.renderGameSidePanels();
    }
  };

  app.registerScreenRenderer('summary-screen', function () {
    app.renderSummary();
  });
})(window.MafiaApp);
