(function (app) {
  var escapeHtml = app.escapeHtml;
  var SIDE_ROLE_ICON_BY_CODE = {
    don: 'icon-don',
    sheriff: 'icon-sheriff',
    mafia: 'icon-mafia',
    peaceful: 'icon-like',
    merlin: 'icon-merlin',
  };

  function roleIconId(code) {
    return SIDE_ROLE_ICON_BY_CODE[code] || SIDE_ROLE_ICON_BY_CODE.peaceful;
  }

  function roleIconWrapClass(code) {
    var isMafiaSide = code === 'mafia' || code === 'don';
    if (isMafiaSide) {
      return 'flex h-12 w-12 shrink-0 items-center justify-center rounded border border-mafia-border bg-mafia-black text-mafia-gold';
    }
    return 'flex h-12 w-12 shrink-0 items-center justify-center rounded border border-mafia-gold/40 bg-mafia-blood text-mafia-gold';
  }

  function parseBonus(raw) {
    return typeof app.parseBonusFloat === 'function' ? app.parseBonusFloat(raw) : (parseFloat(raw) || 0);
  }

  app.syncGameSideRolesToggle = function () {
    var btn = document.getElementById('game-side-roles-toggle');
    if (!btn) return;
    var show = !!app.gameSideShowRoles;
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.textContent = show ? 'Скрыть роли' : 'Показать роли';
    if (show) {
      btn.className =
        'px-2.5 py-1 rounded border-2 border-mafia-gold/55 bg-mafia-blood/30 text-mafia-gold text-[11px] uppercase tracking-wider cursor-pointer transition-colors';
    } else {
      btn.className =
        'px-2.5 py-1 rounded border border-mafia-border bg-mafia-card hover:border-mafia-gold/45 text-mafia-cream/85 text-[11px] uppercase tracking-wider cursor-pointer transition-colors';
    }
  };

  app.toggleGameSideRoles = function () {
    app.gameSideShowRoles = !app.gameSideShowRoles;
    app.saveState();
    app.syncGameSideRolesToggle();
    app.renderGameSideRoles();
  };

  app.renderGameSideRoles = function () {
    var grid = document.getElementById('game-side-roles-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var n = app.players.length;
    var rowCount = Math.max(1, Math.ceil(n / 2));
    grid.className =
      'grid h-full min-h-0 min-w-0 grid-flow-col grid-cols-2 gap-1.5 overflow-hidden';
    grid.style.gridTemplateRows = 'repeat(' + rowCount + ', minmax(0, 1fr))';

    var order = app.playerSeatIndicesForTwoColumnDisplay(n);
    var show = !!app.gameSideShowRoles;
    for (var si = 0; si < order.length; si++) {
      var seatIndex = order[si];
      var pl = app.players[seatIndex];
      var sid = pl.id;
      var nickTrim = pl.nick != null ? String(pl.nick).trim() : '';
      var out = !!pl.eliminationReason;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-action', 'summary-player-open-from-game');
      btn.setAttribute('data-player-id', String(sid));
      btn.className =
        'player-cell flex h-full min-h-0 min-w-0 w-full cursor-pointer flex-col justify-center rounded-lg border border-mafia-border bg-mafia-coal px-1.5 pt-1.5 pb-0.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors transition-transform hover:border-mafia-gold/35 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mafia-gold/45' +
        (out ? ' opacity-[0.55]' : '');
      btn.setAttribute(
        'aria-label',
        nickTrim ? 'Игрок №' + sid + ', псевдоним ' + nickTrim : 'Игрок №' + sid
      );

      var topRow = document.createElement('div');
      topRow.className =
        'player-slot__row flex w-full min-h-0 shrink-0 items-center justify-center gap-2';

      var iconWrap = document.createElement('div');
      iconWrap.setAttribute('aria-hidden', 'true');
      if (!show) {
        iconWrap.className =
          'flex h-12 w-12 shrink-0 items-center justify-center rounded border border-mafia-border/80 bg-black/25 text-mafia-gold/90';
        iconWrap.innerHTML =
          '<span class="font-display text-[1.7rem] font-bold leading-none text-mafia-gold/95">?</span>';
      } else {
        var code = app.getEffectiveSummaryRoleCode
          ? app.getEffectiveSummaryRoleCode(sid, seatIndex)
          : 'peaceful';
        iconWrap.className = roleIconWrapClass(code);
        iconWrap.innerHTML =
          '<svg class="h-[1.8rem] w-[1.8rem] pointer-events-none" aria-hidden="true"><use href="#' +
          roleIconId(code) +
          '"/></svg>';
      }

      var numSpan = document.createElement('span');
      numSpan.className =
        'font-display text-[2.1rem] font-bold leading-none tracking-wide text-mafia-gold tabular-nums text-center';
      numSpan.textContent = '№' + sid;

      topRow.appendChild(iconWrap);
      topRow.appendChild(numSpan);

      var nickRow = document.createElement('div');
      nickRow.className =
        'player-slot-nick mt-0.5 mb-0.5 min-h-[1.25rem] w-full min-w-0 shrink-0 truncate rounded border border-mafia-border/50 bg-black/30 px-1.5 py-0.5 text-center font-sans text-[11px] leading-snug ' +
        (nickTrim ? 'text-mafia-cream/95' : 'text-mafia-cream/30');
      nickRow.setAttribute('role', 'presentation');
      nickRow.innerHTML = nickTrim ? escapeHtml(nickTrim) : 'Псевдоним';

      btn.appendChild(topRow);
      btn.appendChild(nickRow);
      grid.appendChild(btn);
    }
  };

  app.renderGameSideHistory = function () {
    var hist = document.getElementById('game-side-history');
    var empty = document.getElementById('game-side-history-empty');
    if (!hist || !empty) return;
    hist.innerHTML = '';
    var rows = typeof app.buildSummaryHistoryRows === 'function' ? app.buildSummaryHistoryRows() : [];
    if (!rows.length) {
      hist.style.display = 'none';
      empty.style.display = '';
      return;
    }
    for (var i = 0; i < rows.length; i++) {
      var li = document.createElement('li');
      li.className = 'pl-0.5 leading-snug';
      li.textContent = rows[i].text;
      hist.appendChild(li);
    }
    hist.style.display = '';
    empty.style.display = 'none';
  };

  app.syncGameSideNotesUi = function () {
    var ta = document.getElementById('game-side-notes');
    var body = document.getElementById('game-side-notes-body');
    var toggle = document.getElementById('game-side-notes-toggle');
    var chev = document.getElementById('game-side-notes-chevron');
    if (ta) {
      if (document.activeElement !== ta) ta.value = typeof app.gameSideNotes === 'string' ? app.gameSideNotes : '';
    }
    var collapsed = !!app.gameSideNotesCollapsed;
    if (body) body.style.display = collapsed ? 'none' : '';
    if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (chev) chev.style.transform = collapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  };

  app.toggleGameSideNotes = function () {
    app.gameSideNotesCollapsed = !app.gameSideNotesCollapsed;
    app.saveState();
    app.syncGameSideNotesUi();
  };

  app.applyGameSideNotesInput = function (value) {
    app.gameSideNotes = typeof value === 'string' ? value : '';
    app.saveState();
  };

  app.renderGameSidePanels = function () {
    var gs = document.getElementById('game-screen');
    if (!gs || !gs.classList.contains('active')) return;
    if (app.syncGameSideRolesToggle) app.syncGameSideRolesToggle();
    if (app.renderGameSideRoles) app.renderGameSideRoles();
    if (app.renderGameSideHistory) app.renderGameSideHistory();
    if (app.syncGameSideNotesUi) app.syncGameSideNotesUi();
  };
})(window.MafiaApp);
