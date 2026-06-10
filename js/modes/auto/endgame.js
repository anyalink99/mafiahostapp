/**
 * Автономный режим — конец игры: проверка победы, угадывание Мерлина
 * последним повешенным чёрным (auto-merlin-guess-screen) и финальный
 * экран с раскрытием ролей (auto-end-screen).
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;
  var escapeHtml = A.escapeHtml;

  function endGame(team) {
    var s = app.autoState;
    s.phase = 'gameover';
    s.result = team;
    A.clearAllAutoTimers();
    A.saveAuto();
    app.navigateToScreen('auto-end-screen');
  }
  A.endGame = endGame;

  function endPeacefulOrMerlinGuess() {
    var s = app.autoState;
    if (
      A.getVariant().postGameMerlinGuess &&
      Array.isArray(s.hangedBlacks) &&
      s.hangedBlacks.length > 0 &&
      !s.merlinGuess
    ) {
      transitionToMerlinGuess();
      return;
    }
    endGame('peaceful');
  }
  A.endPeacefulOrMerlinGuess = endPeacefulOrMerlinGuess;

  A.checkWinAndContinue = function () {
    if (A.isPeacefulWin()) endPeacefulOrMerlinGuess();
    else if (A.isMafiaWin()) endGame('mafia');
  };

  function transitionToMerlinGuess() {
    var s = app.autoState;
    s.phase = 'merlin-guess';
    A.navAfter('auto-merlin-guess-screen');
  }

  app.renderAutoMerlinGuess = function () {
    var s = app.autoState;
    if (s.variant !== 'merlin' || !Array.isArray(s.hangedBlacks) || !s.hangedBlacks.length) {
      endGame('peaceful');
      return;
    }
    var guesserId = s.hangedBlacks[s.hangedBlacks.length - 1];
    var numEl = el('auto-merlin-guesser-num');
    if (numEl) numEl.textContent = '№' + guesserId;
    var grid = el('auto-merlin-guess-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var result = s.merlinGuess;
    for (var i = 0; i < s.seats.length; i++) {
      var seat = s.seats[i];
      if (seat.role === 'mafia' || seat.role === 'don') continue;
      var nick =
        seat.nick && seat.nick.trim()
          ? '<span class="auto-target-nick">' + escapeHtml(seat.nick.trim()) + '</span>'
          : '';
      var isPicked = result && result.target === seat.id;
      var revealRole = result ? A.ROLE_NAMES[seat.role] || seat.role : '';
      var btn = document.createElement('button');
      btn.type = 'button';
      if (!result) {
        btn.setAttribute('data-action', 'auto-merlin-guess-pick');
        btn.setAttribute('data-target-id', String(seat.id));
      }
      btn.disabled = !!result;
      btn.className = 'auto-target-tile' + (isPicked ? ' auto-target-selected' : '');
      btn.innerHTML =
        '№' +
        seat.id +
        nick +
        (revealRole
          ? '<span class="auto-target-nick text-mafia-gold/85">' + revealRole + '</span>'
          : '');
      grid.appendChild(btn);
    }
    if (result) {
      var done = document.createElement('button');
      done.type = 'button';
      done.setAttribute('data-action', 'auto-merlin-guess-finish');
      done.className =
        'mt-4 col-span-full w-full py-3 bg-mafia-blood hover:bg-mafia-bloodLight border-2 border-mafia-gold text-mafia-gold font-semibold uppercase tracking-wider rounded cursor-pointer';
      done.textContent = result.correct
        ? 'Чёрные забирают победу — продолжить'
        : 'Мимо — победа красных';
      grid.appendChild(done);
    }
  };

  app.handleMerlinGuessPick = function (targetId) {
    var s = app.autoState;
    if (s.phase !== 'merlin-guess') return;
    if (s.merlinGuess) return;
    var target = A.seatById(targetId);
    if (!target) return;
    if (target.role === 'mafia' || target.role === 'don') return;
    A.pushHistory();
    s.merlinGuess = {
      by: s.hangedBlacks[s.hangedBlacks.length - 1],
      target: targetId,
      correct: target.role === 'merlin',
    };
    A.saveAuto();
    app.renderAutoMerlinGuess();
  };

  app.handleMerlinGuessFinish = function () {
    var s = app.autoState;
    if (!s.merlinGuess) {
      endGame('peaceful');
      return;
    }
    A.pushHistory();
    endGame(s.merlinGuess.correct ? 'mafia' : 'peaceful');
  };

  app.handleMerlinGuessSkip = function () {
    var s = app.autoState;
    if (s.phase !== 'merlin-guess') return;
    A.pushHistory();
    s.merlinGuess = { by: null, target: null, correct: false, skipped: true };
    A.saveAuto();
    endGame('peaceful');
  };

  app.renderAutoEnd = function () {
    var s = app.autoState;
    var teamEl = el('auto-end-team');
    if (teamEl) teamEl.textContent = A.TEAM_NAMES[s.result] || '—';
    var subEl = el('auto-end-subtitle');
    if (subEl) {
      if (s.merlinGuess) {
        subEl.classList.remove('hidden');
        var guesser = s.merlinGuess.by;
        if (s.merlinGuess.skipped) {
          subEl.innerHTML =
            '№' + guesser + ' отказался называть Мерлина — победа красных подтверждена.';
        } else if (s.merlinGuess.correct) {
          subEl.innerHTML =
            '№' +
            guesser +
            ' угадал Мерлина (№' +
            s.merlinGuess.target +
            ') — победа уходит чёрным.';
        } else {
          subEl.innerHTML =
            '№' +
            guesser +
            ' назвал №' +
            s.merlinGuess.target +
            ' — мимо. Победа остаётся красным.';
        }
      } else {
        subEl.classList.add('hidden');
        subEl.textContent = '';
      }
    }
    var rolesEl = el('auto-end-roles');
    if (rolesEl) {
      rolesEl.innerHTML = '';
      s.seats.forEach(function (seat) {
        var nick = seat.nick && seat.nick.trim() ? ' — ' + escapeHtml(seat.nick.trim()) : '';
        var aliveLabel = seat.alive ? '' : ' <span class="text-mafia-cream/45">(выбыл)</span>';
        var wrap = document.createElement('div');
        wrap.className = 'flex items-center gap-2 text-sm';
        wrap.innerHTML =
          '<span class="text-mafia-gold flex-shrink-0">' +
          A.renderRoleIcon(seat.role, 'role-icon--small') +
          '</span>' +
          '<span class="font-display text-mafia-gold/90 font-bold tabular-nums">№' +
          seat.id +
          '</span>' +
          '<span class="text-mafia-cream/85 truncate">' +
          escapeHtml(A.ROLE_NAMES[seat.role] || seat.role) +
          nick +
          '</span>' +
          aliveLabel;
        rolesEl.appendChild(wrap);
      });
    }
  };

  app.registerScreenRenderer('auto-merlin-guess-screen', function () {
    app.renderAutoMerlinGuess();
  });
  app.registerScreenRenderer('auto-end-screen', function () {
    app.renderAutoEnd();
  });
})(window.MafiaApp);
