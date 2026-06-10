/**
 * Итоги — модалки: правка записи журнала (включая синтетические «пропущенные»
 * дни), карточка игрока (роль/допы/лучший ход/протокол) и радио-пикеры ролей.
 * Иконные хелперы (S.roleIconWrapClass и т.д.) разделяются с рендером итогов.
 */
(function (app) {
  'use strict';

  var S = (app._summary = app._summary || {});
  var parseBonusFloat = app.parseBonusFloat;
  var SUMMARY_ROLE_ICON_BY_CODE = app.UI_ROLE_ICONS;

  S.roleCodeToIconId = function (code) {
    return SUMMARY_ROLE_ICON_BY_CODE[code] || SUMMARY_ROLE_ICON_BY_CODE.peaceful;
  };

  S.roleIconWrapClass = function (code) {
    var isMafiaSide = code === 'mafia' || code === 'don';
    if (isMafiaSide) {
      return 'flex h-9 w-9 shrink-0 items-center justify-center rounded border border-mafia-border bg-mafia-black text-mafia-gold sm:h-10 sm:w-10';
    }
    return 'flex h-9 w-9 shrink-0 items-center justify-center rounded border border-mafia-gold/40 bg-mafia-blood text-mafia-gold sm:h-10 sm:w-10';
  };

  S.roleGridIconWrapClass = function (code) {
    var isMafiaSide = code === 'mafia' || code === 'don';
    if (isMafiaSide) {
      return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-border bg-mafia-black text-mafia-gold sm:h-9 sm:w-9';
    }
    return 'flex h-8 w-8 shrink-0 items-center justify-center rounded border border-mafia-gold/40 bg-mafia-blood text-mafia-gold sm:h-9 sm:w-9';
  };

  S.TEAM_UNKNOWN_WRAP =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded border border-mafia-border/80 bg-black/25 text-mafia-gold/90 sm:h-10 sm:w-10';

  var SUMMARY_TEAM_SVG_CLASS = 'h-[1.35rem] w-[1.35rem] pointer-events-none sm:h-6 sm:w-6';

  S.teamIconHtml = function (iconId) {
    return (
      '<svg class="' +
      SUMMARY_TEAM_SVG_CLASS +
      '" aria-hidden="true"><use href="#' +
      iconId +
      '"/></svg>'
    );
  };

  var SUMMARY_ROLE_LABELS = app.ROLE_LABELS_FULL;

  function summaryAllowedRoles() {
    var roles =
      app.variantConfig && app.prepareConfig
        ? app.variantConfig(app.prepareConfig.variant).manualRoles.slice()
        : ['peaceful', 'mafia', 'don', 'sheriff'];
    // Show Merlin in summary too if any seat already has it (e.g. migrated game).
    if (roles.indexOf('merlin') === -1 && app.summaryRoleByPlayerId) {
      for (var k in app.summaryRoleByPlayerId) {
        if (
          Object.prototype.hasOwnProperty.call(app.summaryRoleByPlayerId, k) &&
          app.summaryRoleByPlayerId[k] === 'merlin'
        ) {
          roles.push('merlin');
          break;
        }
      }
    }
    return roles;
  }

  function renderModalSummaryRoleRadios(selectedCode, enabled) {
    var row = document.getElementById('modal-summary-role-icons');
    if (!row) return;
    row.innerHTML = '';
    var opts = summaryAllowedRoles().map(function (code) {
      return { value: code, label: SUMMARY_ROLE_LABELS[code] || code };
    });
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
      wrap.className = S.roleIconWrapClass(o.value);
      wrap.innerHTML = S.teamIconHtml(S.roleCodeToIconId(o.value));
      b.appendChild(wrap);
      b.setAttribute('data-action', 'summary-role-pick');
      row.appendChild(b);
    }
  }

  app.renderModalSummaryRoleRadios = renderModalSummaryRoleRadios;

  function getModalSummarySelectedRoleCode() {
    var row = document.getElementById('modal-summary-role-icons');
    if (!row) return null;
    var picked = row.querySelector('[role="radio"][aria-checked="true"]');
    return picked && picked.dataset.summaryRole ? picked.dataset.summaryRole : null;
  }

  app.hideSummaryPlayerModal = function () {
    var m = document.getElementById('modal-summary-player');
    if (m && app.modalSetOpen) app.modalSetOpen(m, false);
    var gs = document.getElementById('game-screen');
    if (gs && gs.classList.contains('active') && app.renderPlayers) app.renderPlayers();
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
        var auto = S.syntheticPairSkipDefaultText(rn);
        if (ta) ta.value = o != null && String(o).trim() !== '' ? String(o) : auto;
      }
      app.modalSetOpen(m, true);
      return;
    }
    var log = S.sortedLog();
    var entry = log[sortedIndex];
    if (!entry) return;
    app._summaryLogSortedIndex = sortedIndex;
    app._summaryLogSkipKey = null;
    if (ta) {
      var wm = S.entryRoundNumWeakMap();
      var rn2 = wm.get(entry);
      var autoText = app.formatHistoryItemAuto(entry, rn2);
      ta.value = typeof entry.textOverride === 'string' ? entry.textOverride : autoText;
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
        if (trimmed === '' || trimmed === S.SYNTHETIC_FIRST_DAY_DEFAULT) {
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
        var autoPair = S.syntheticPairSkipDefaultText(rnum);
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
    var log = S.sortedLog();
    var entry = log[ix];
    if (!entry) {
      app.hideSummaryLogModal();
      return;
    }
    var wm = S.entryRoundNumWeakMap();
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
    var noteTa = document.getElementById('modal-summary-note');
    var hint = document.getElementById('modal-summary-locked-hint');
    var unlocked = app.summaryWinnerChosen();
    if (title) title.textContent = 'Игрок №' + playerId;
    if (nickInp) nickInp.value = p.nick != null ? String(p.nick) : '';
    m.dataset.playerId = String(playerId);
    var bk = String(playerId);
    if (!app.bonusPointsByPlayerId || typeof app.bonusPointsByPlayerId !== 'object')
      app.bonusPointsByPlayerId = {};
    if (!app.bonusNoteByPlayerId || typeof app.bonusNoteByPlayerId !== 'object')
      app.bonusNoteByPlayerId = {};
    if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object')
      app.summaryRoleByPlayerId = {};
    if (!app.bestMoveByPlayerId || typeof app.bestMoveByPlayerId !== 'object')
      app.bestMoveByPlayerId = {};
    if (!app.protocolByPlayerId || typeof app.protocolByPlayerId !== 'object')
      app.protocolByPlayerId = {};
    if (!app.opinionByPlayerId || typeof app.opinionByPlayerId !== 'object')
      app.opinionByPlayerId = {};
    var bmWrap = document.getElementById('modal-summary-bestmove-wrap');
    var bm = document.getElementById('modal-summary-bestmove');
    var showBm = app.showSummaryBestMoveField(playerId);
    if (bmWrap) bmWrap.style.display = showBm ? 'flex' : 'none';
    if (bm) {
      bm.value = app.normalizeNumberListText(app.bestMoveByPlayerId[bk]);
      bm.disabled = !showBm;
    }
    app.fillNumGroupFields(
      'modal-summary-protocol-',
      app.getPlayerNumGroup(app.protocolByPlayerId, playerId)
    );
    app.fillNumGroupFields(
      'modal-summary-opinion-',
      app.getPlayerNumGroup(app.opinionByPlayerId, playerId)
    );
    var braw = app.bonusPointsByPlayerId[bk];
    var bnum = parseBonusFloat(braw);
    if (bonusInp) {
      bonusInp.value = bnum % 1 === 0 ? String(Math.round(bnum)) : String(bnum).replace('.', ',');
    }
    var deltaBtns = m.querySelectorAll('[data-action="summary-bonus-delta"]');
    for (var db = 0; db < deltaBtns.length; db++) {
      deltaBtns[db].disabled = !unlocked;
    }
    if (noteTa)
      noteTa.value = app.bonusNoteByPlayerId[bk] != null ? String(app.bonusNoteByPlayerId[bk]) : '';
    var bonusSection = document.getElementById('modal-summary-bonus-section');
    if (bonusSection) bonusSection.style.display = unlocked ? '' : 'none';
    // Примечание, лучший ход, протокол и мнение доступны всегда (в т.ч. во время игры).
    // За победителем заперты только допы и роль.
    var roleSection = document.getElementById('modal-summary-role-section');
    if (roleSection) roleSection.style.display = unlocked ? '' : 'none';
    if (unlocked) {
      renderModalSummaryRoleRadios(app.getEffectiveSummaryRoleCode(playerId, seatIndex), true);
    } else {
      var roleRow = document.getElementById('modal-summary-role-icons');
      if (roleRow) roleRow.innerHTML = '';
    }
    if (bonusInp) bonusInp.disabled = !unlocked;
    if (noteTa) noteTa.disabled = false;
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
    app.savePlayerGameExtras('modal-summary-', pid);
    // Допы и роль — только после выбора победителя.
    if (unlocked) {
      var bonusInp = document.getElementById('modal-summary-bonus');
      var v = bonusInp ? parseBonusFloat(bonusInp.value) : 0;
      if (!app.bonusPointsByPlayerId || typeof app.bonusPointsByPlayerId !== 'object')
        app.bonusPointsByPlayerId = {};
      if (!app.summaryRoleByPlayerId || typeof app.summaryRoleByPlayerId !== 'object')
        app.summaryRoleByPlayerId = {};
      app.bonusPointsByPlayerId[String(pid)] = v;
      var roleCode = getModalSummarySelectedRoleCode();
      if (roleCode) {
        app.summaryRoleByPlayerId[String(pid)] = roleCode;
      }
    }
    app.saveState();
    app.hideSummaryPlayerModal();
    app.renderSummary();
    if (app.renderGameSidePanels) app.renderGameSidePanels();
  };
})(window.MafiaApp);
