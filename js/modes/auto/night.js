/**
 * Автономный режим — активные ночи (auto-night-pass / -action / -result).
 * Очередь ходов по живым местам, выстрел мафии (единогласие), проверки дона
 * и шерифа, разрешение убийства и утренняя озвучка.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;
  var h = app.h;

  function buildNightTurnOrder(nightNum) {
    var s = app.autoState;
    var aliveSet = {};
    for (var i = 0; i < s.seats.length; i++) {
      if (s.seats[i].alive && !A.isPhantomSeat(s.seats[i])) aliveSet[s.seats[i].id] = true;
    }
    var startCandidate = ((nightNum - 1) % A.playerCount()) + 1;
    var order = [];
    for (var k = 0; k < A.playerCount(); k++) {
      var seatId = ((startCandidate - 1 + k) % A.playerCount()) + 1;
      if (aliveSet[seatId]) order.push(seatId);
    }
    return order;
  }

  A.transitionToNight = function (nightNum) {
    var s = app.autoState;
    var order = buildNightTurnOrder(nightNum);
    if (!order.length) {
      A.checkWinAndContinue();
      return;
    }
    s.phase = 'night-pass';
    s.nightNum = nightNum;
    var cfg = A.variantConfig(s.variant);
    var kasperNight = !!cfg.firstNightKillsKasper && nightNum === 1;
    s.night = {
      nightNum: nightNum,
      turnOrder: order,
      cursor: 0,
      mafiaVotes: {},
      sheriffCheck: null,
      donCheck: null,
      // В ночь Каспера мафия не стреляет, но дон всё равно должен мочь
      // проверить шерифа — поэтому фиксируем donKillPicked=true сразу.
      donKillPicked: kasperNight,
      victimId: null,
      sheriffPredetermined: null,
    };
    if (A.isSheriffRandomCheckNight(s)) {
      var sheriffSeat = null;
      for (var si = 0; si < s.seats.length; si++) {
        if (s.seats[si].alive && s.seats[si].role === 'sheriff') {
          sheriffSeat = s.seats[si];
          break;
        }
      }
      if (sheriffSeat) {
        var others = [];
        for (var oi = 0; oi < s.seats.length; oi++) {
          if (
            s.seats[oi].alive &&
            !A.isPhantomSeat(s.seats[oi]) &&
            s.seats[oi].id !== sheriffSeat.id
          )
            others.push(s.seats[oi]);
        }
        if (others.length) {
          var pick = others[Math.floor(Math.random() * others.length)];
          s.night.sheriffPredetermined = { target: pick.id, isMafia: A.isMafiaSide(pick.role) };
        }
      }
    }
    A.navAfter('auto-night-pass-screen');
  };

  app.renderAutoNightPass = function () {
    var s = app.autoState;
    if (!s.night) {
      A.transitionToNight(s.nightNum && s.nightNum >= 1 ? s.nightNum : 1);
      return;
    }
    var idx = s.night.cursor;
    if (idx >= s.night.turnOrder.length) {
      transitionToNightResult();
      return;
    }
    var seatId = s.night.turnOrder[idx];
    var numEl = el('auto-night-pass-num');
    if (numEl) numEl.textContent = '№' + seatId;
    var labelEl = el('auto-night-pass-label');
    if (labelEl) labelEl.textContent = 'Ночь ' + s.night.nightNum;
  };

  app.startNightTurn = function () {
    A.pushHistory();
    var s = app.autoState;
    if (!s.night) return;
    s.phase = 'night-action';
    A.saveAuto();
    app.navigateToScreen('auto-night-action-screen');
  };

  app.renderAutoNightAction = function () {
    var s = app.autoState;
    if (!s.night) return;
    var idx = s.night.cursor;
    if (idx >= s.night.turnOrder.length) {
      transitionToNightResult();
      return;
    }
    var seatId = s.night.turnOrder[idx];
    var seat = A.seatById(seatId);
    if (!seat) return;
    var seatNumEl = el('auto-night-action-seat');
    if (seatNumEl) seatNumEl.textContent = String(seatId);
    var labelEl = el('auto-night-action-label');
    if (labelEl) labelEl.textContent = 'Ночь ' + s.night.nightNum;
    var body = el('auto-night-action-body');
    if (body) {
      body.innerHTML = '';
      renderNightActionSections(seat).forEach(function (node) {
        body.appendChild(node);
      });
    }
  };

  function renderNightActionSections(seat) {
    var role = seat.role;
    if (role === 'mafia') return [renderMafiaSection(seat, false)];
    if (role === 'don') return [renderMafiaSection(seat, true), renderDonCheckSection(seat)];
    if (role === 'sheriff') return [renderSheriffSection(seat)];
    if (role === 'merlin') return [renderMerlinSection(seat)];
    return [renderPeacefulSection()];
  }

  function sectionEl(extraClass, children) {
    return h('div', { className: 'auto-night-section' + (extraClass || '') }, children);
  }

  function sectionTitle(text, mb) {
    return h(
      'h2',
      { className: 'font-display text-mafia-gold text-lg tracking-widest ' + (mb || 'mb-1') },
      text
    );
  }

  // «№N (ник)» — № золотым, ник обычным текстом.
  function seatRefNodes(id) {
    var t = A.seatById(id);
    var nick = t && t.nick && t.nick.trim() ? ' (' + t.nick.trim() + ')' : '';
    return [h('span', { className: 'text-mafia-gold font-semibold' }, '№' + id), nick];
  }

  // Баннер результата проверки: «№N (ник) — мафия/шериф/не …».
  function checkResultBanner(targetId, positive, positiveLabel, negativeLabel) {
    var t = A.seatById(targetId);
    var nick = t && t.nick && t.nick.trim() ? ' (' + t.nick.trim() + ')' : '';
    return h('div', { className: 'auto-night-result-banner' }, [
      '№' + targetId + nick + ' — ',
      positive
        ? h('span', { className: 'text-mafia-gold font-semibold' }, positiveLabel)
        : negativeLabel,
    ]);
  }

  function renderMerlinSection(seat) {
    var s = app.autoState;
    if (s.night.nightNum !== 1) return renderPeacefulSection();
    var blacks = [];
    var sheriffNum = null;
    for (var i = 0; i < s.seats.length; i++) {
      var x = s.seats[i];
      if (x.role === 'mafia' || x.role === 'don') blacks.push(x.id);
      else if (x.role === 'sheriff') sheriffNum = x.id;
    }
    blacks.sort(function (a, b) {
      return a - b;
    });
    var blacksLine = ['Чёрные: '];
    for (var bi = 0; bi < blacks.length; bi++) {
      if (bi > 0) blacksLine.push(', ');
      blacksLine.push(seatRefNodes(blacks[bi]));
    }
    return sectionEl('', [
      sectionTitle('Ход Мерлина'),
      h(
        'p',
        { className: 'text-mafia-cream/65 text-xs mb-3' },
        'В первую активную ночь Мерлин узнаёт тройку чёрных и шерифа. Запомни и не выдавай себя.'
      ),
      h('div', { className: 'auto-night-result-banner text-left' }, [
        h('div', null, blacksLine),
        sheriffNum !== null
          ? h('div', { className: 'mt-2' }, ['Шериф: ', seatRefNodes(sheriffNum)])
          : null,
      ]),
    ]);
  }

  function renderTargetGrid(candidates, selectedId, action) {
    if (!candidates.length) {
      return h('p', { className: 'text-mafia-cream/60 text-sm text-center py-4' }, 'Целей нет.');
    }
    return h(
      'div',
      { className: 'auto-target-grid' },
      candidates.map(function (c) {
        var nickTrim = c.nick && c.nick.trim() ? c.nick.trim() : '';
        return h(
          'button',
          {
            type: 'button',
            className: 'auto-target-tile' + (selectedId === c.id ? ' auto-target-selected' : ''),
            'data-action': action,
            'data-target-id': String(c.id),
          },
          ['№' + c.id, nickTrim ? h('span', { className: 'auto-target-nick' }, nickTrim) : null]
        );
      })
    );
  }

  function renderMafiaSection(seat, isDon) {
    var s = app.autoState;
    var heading = isDon ? 'Выстрел мафии (ты — Дон)' : 'Выстрел мафии';
    if (A.isKasperKillNight(s)) {
      return sectionEl('', [
        sectionTitle(heading),
        h(
          'p',
          { className: 'text-mafia-cream/85 text-sm' },
          'В первую активную ночь мафия не стреляет — 10-й считается убитым. Просто передавай дальше.'
        ),
      ]);
    }
    var candidates = A.aliveActiveSeats();
    var sel = s.night.mafiaVotes[seat.id] || null;
    return sectionEl('', [
      sectionTitle(heading),
      h(
        'p',
        { className: 'text-mafia-cream/65 text-xs mb-3' },
        'Тапни № жертвы (можно любого живого, включая себя). Выстрелы других мафов скрыты — нужно единогласие, иначе промах.'
      ),
      renderTargetGrid(candidates, sel, 'auto-mafia-pick'),
    ]);
  }

  function renderDonCheckSection(seat) {
    var s = app.autoState;
    var locked = !s.night.donKillPicked;
    var candidates = A.aliveActiveSeats().filter(function (x) {
      return x.id !== seat.id;
    });
    var donCheck = s.night.donCheck;
    var mine = donCheck && donCheck.by === seat.id;
    return sectionEl(locked ? ' auto-section-locked' : '', [
      sectionTitle('Проверка на шерифа'),
      h(
        'p',
        { className: 'text-mafia-cream/65 text-xs mb-3' },
        'Тапни №, чтобы проверить, шериф ли он.'
      ),
      renderTargetGrid(candidates, mine ? donCheck.target : null, 'auto-don-check'),
      mine ? checkResultBanner(donCheck.target, donCheck.isSheriff, 'шериф', 'не шериф') : null,
    ]);
  }

  function renderSheriffSection(seat) {
    var s = app.autoState;
    if (A.isSheriffRandomCheckNight(s) && s.night.sheriffPredetermined) {
      var pre = s.night.sheriffPredetermined;
      return sectionEl('', [
        sectionTitle('Случайная проверка шерифа'),
        h(
          'p',
          { className: 'text-mafia-cream/85 text-sm mb-3' },
          'В первую активную ночь шериф не выбирает цель — проверка случайна.'
        ),
        checkResultBanner(pre.target, pre.isMafia, 'мафия', 'не мафия'),
      ]);
    }
    var candidates = A.aliveActiveSeats().filter(function (x) {
      return x.id !== seat.id;
    });
    var check = s.night.sheriffCheck;
    var mine = check && check.by === seat.id;
    return sectionEl('', [
      sectionTitle('Проверка шерифа'),
      h(
        'p',
        { className: 'text-mafia-cream/65 text-xs mb-3' },
        'Тапни №, чтобы проверить, мафия ли он.'
      ),
      renderTargetGrid(candidates, mine ? check.target : null, 'auto-sheriff-check'),
      mine ? checkResultBanner(check.target, check.isMafia, 'мафия', 'не мафия') : null,
    ]);
  }

  function renderPeacefulSection() {
    return sectionEl('', [
      sectionTitle('Твой ход', 'mb-2'),
      h(
        'p',
        { className: 'text-mafia-cream/85 text-sm leading-relaxed' },
        'Сделай вид, что обдумываешь действие. Не показывай экран соседям. Жми «Готово», когда таймер истечёт.'
      ),
      h('div', { className: 'mt-4 text-center text-mafia-gold/60 font-display text-7xl' }, '♠'),
    ]);
  }

  app.handleNightTurnDone = function () {
    var s = app.autoState;
    if (!s.night) return;
    A.pushHistory();
    s.night.cursor++;
    if (s.night.cursor >= s.night.turnOrder.length) {
      transitionToNightResult();
    } else {
      s.phase = 'night-pass';
      A.saveAuto();
      app.navigateToScreen('auto-night-pass-screen');
    }
  };

  app.handleMafiaPick = function (seatId, targetId) {
    var s = app.autoState;
    if (!s.night) return;
    var seat = A.seatById(seatId);
    if (!seat || !A.isMafiaSide(seat.role)) return;
    A.pushHistory();
    if (s.night.mafiaVotes[seatId] === targetId) {
      delete s.night.mafiaVotes[seatId];
      if (seat.role === 'don') {
        s.night.donKillPicked = false;
        if (s.night.donCheck && s.night.donCheck.by === seatId) s.night.donCheck = null;
      }
    } else {
      s.night.mafiaVotes[seatId] = targetId;
      if (seat.role === 'don') s.night.donKillPicked = true;
    }
    A.saveAuto();
    app.renderAutoNightAction();
  };

  app.handleDonCheck = function (seatId, targetId) {
    var s = app.autoState;
    if (!s.night) return;
    var seat = A.seatById(seatId);
    if (!seat || seat.role !== 'don') return;
    if (!s.night.donKillPicked) return;
    if (s.night.donCheck && s.night.donCheck.by === seatId) return;
    var target = A.seatById(targetId);
    if (!target) return;
    A.mutate(function (st) {
      st.night.donCheck = { by: seatId, target: targetId, isSheriff: target.role === 'sheriff' };
    });
    app.renderAutoNightAction();
  };

  app.handleSheriffCheck = function (seatId, targetId) {
    var s = app.autoState;
    if (!s.night) return;
    var seat = A.seatById(seatId);
    if (!seat || seat.role !== 'sheriff') return;
    if (s.night.sheriffCheck && s.night.sheriffCheck.by === seatId) return;
    var target = A.seatById(targetId);
    if (!target) return;
    A.mutate(function (st) {
      st.night.sheriffCheck = { by: seatId, target: targetId, isMafia: A.isMafiaSide(target.role) };
    });
    app.renderAutoNightAction();
  };

  function pickMafiaVictimUnanimous() {
    var s = app.autoState;
    if (!s.night) return null;
    var aliveM = A.aliveMafiaIds();
    if (!aliveM.length) return null;
    var first = s.night.mafiaVotes[aliveM[0]];
    if (!first) return null;
    for (var i = 1; i < aliveM.length; i++) {
      if (s.night.mafiaVotes[aliveM[i]] !== first) return null;
    }
    return first;
  }

  function transitionToNightResult() {
    var s = app.autoState;
    var isKasperAutoKill = A.isKasperKillNight(s);
    var victimId;
    if (isKasperAutoKill) {
      victimId = 10;
    } else {
      victimId = pickMafiaVictimUnanimous();
    }
    if (s.night) s.night.victimId = victimId;
    if (victimId) {
      var v = A.seatById(victimId);
      if (v) {
        v.alive = false;
        v.eliminationReason = 'shot';
        // Каспер «материализуется» после автоубийства — дальше он просто обычный убитый.
        if (v.phantom) v.phantom = false;
      }
    }
    s.phase = 'night-result';
    A.navAfter('auto-night-result-screen');
    setTimeout(playNightResultAudio, 50);
  }

  function playNightResultAudio() {
    var s = app.autoState;
    if (!s.night) return;
    var isKasperAutoKill = A.isKasperKillNight(s);
    var victimId = s.night.victimId;
    var nightNum = s.night.nightNum;
    var realKill = victimId !== null && victimId !== undefined;
    if (isKasperAutoKill) {
      var nextDay = (s.dayNum || 0) + 1;
      var opener = A.dayOpenerSeatId(nextDay);
      var seq = ['morning.mp3'];
      if (opener) seq.push(opener + '.mp3');
      A.playSfxSequence(seq);
      return;
    }
    if (!realKill) {
      A.playSfxSequence(['morning-miss.mp3']);
      return;
    }
    if (nightNum === 1) {
      A.playSfxSequence(['first-killed-best-predicition.mp3', victimId + '.mp3']).then(function () {
        startBestMoveCountdown(function () {
          A.playSfxSequence(['morning-last-speech.mp3', victimId + '.mp3']);
        });
      });
    } else {
      A.playSfxSequence(['morning-last-speech.mp3', victimId + '.mp3']);
    }
  }

  function startBestMoveCountdown(onDone) {
    var bm = el('auto-night-result-bestmove');
    if (bm) bm.classList.remove('hidden');
    var n = 10;
    var cd = el('auto-night-result-bestmove-countdown');
    if (cd) cd.textContent = String(n);
    if (app._autoEphemeral.bestMoveTimer) {
      clearInterval(app._autoEphemeral.bestMoveTimer);
      app._autoEphemeral.bestMoveTimer = null;
    }
    app._autoEphemeral.bestMoveTimer = setInterval(function () {
      n--;
      var c = el('auto-night-result-bestmove-countdown');
      if (c) c.textContent = String(Math.max(0, n));
      if (n <= 0) {
        clearInterval(app._autoEphemeral.bestMoveTimer);
        app._autoEphemeral.bestMoveTimer = null;
        var bm2 = el('auto-night-result-bestmove');
        if (bm2) bm2.classList.add('hidden');
        if (typeof onDone === 'function') onDone();
      }
    }, 1000);
  }

  app.renderAutoNightResult = function () {
    var s = app.autoState;
    var body = el('auto-night-result-body');
    var labelEl = el('auto-night-result-label');
    if (labelEl) labelEl.textContent = s.night ? 'Ночь ' + s.night.nightNum : 'Ночь';
    var bm = el('auto-night-result-bestmove');
    if (bm) bm.classList.add('hidden');
    if (!body) return;
    body.innerHTML = '';
    function killedNodes(victimId, nick, fallback) {
      return [
        h(
          'p',
          { className: 'font-display text-mafia-gold/80 text-sm tracking-widest uppercase mb-1' },
          'Ночью убит'
        ),
        h(
          'h1',
          {
            className:
              'font-display font-bold text-6xl text-mafia-blood drop-shadow-[0_0_10px_rgba(127,29,29,0.4)] mb-2',
          },
          '№' + victimId
        ),
        nick || fallback
          ? h('p', { className: 'text-mafia-cream/85 text-base' }, nick || fallback)
          : null,
      ];
    }
    var nodes;
    if (A.isKasperKillNight(s)) {
      var seat10 = A.seatById(10);
      var nick10 = seat10 && seat10.nick && seat10.nick.trim() ? seat10.nick.trim() : '';
      nodes = killedNodes(10, nick10, 'мирный житель');
    } else if (s.night && s.night.victimId) {
      var v = A.seatById(s.night.victimId);
      nodes = killedNodes(s.night.victimId, v && v.nick && v.nick.trim() ? v.nick.trim() : '', '');
    } else {
      nodes = [
        h('h1', { className: 'font-display font-bold text-4xl text-mafia-gold mb-2' }, 'Промах'),
        h(
          'p',
          { className: 'text-mafia-cream/75 text-sm' },
          'Этой ночью никто не погиб — мафия не договорилась.'
        ),
      ];
    }
    nodes.forEach(function (n) {
      if (n) body.appendChild(n);
    });
  };

  app.continueAfterNightResult = function () {
    A.pushHistory();
    if (A.isPeacefulWin()) {
      A.endPeacefulOrMerlinGuess();
      return;
    }
    if (A.isMafiaWin()) {
      A.endGame('mafia');
      return;
    }
    var s = app.autoState;
    s.dayNum = (s.dayNum || 0) + 1;
    A.transitionToDay(s.dayNum);
  };

  app.registerScreenRenderer('auto-night-pass-screen', function () {
    app.renderAutoNightPass();
  });
  app.registerScreenRenderer('auto-night-action-screen', function () {
    app.renderAutoNightAction();
  });
  app.registerScreenRenderer('auto-night-result-screen', function () {
    app.renderAutoNightResult();
  });
})(window.MafiaApp);
