/**
 * Автономный режим — экран запуска (auto-setup-screen):
 * резюме незаконченной игры, описание состава, старт/продолжение/перезапуск.
 */
(function (app) {
  'use strict';

  var A = app._auto;
  var el = A.el;

  app.renderAutoSetup = function () {
    var s = app.autoState;
    var hasInProgress = s.active && s.phase !== 'setup' && s.phase !== 'gameover';
    var resumeBlock = el('auto-resume-block');
    var freshBlock = el('auto-fresh-block');
    if (resumeBlock) resumeBlock.classList.toggle('hidden', !hasInProgress);
    if (freshBlock) freshBlock.classList.toggle('hidden', hasInProgress);
    if (hasInProgress) {
      var phEl = el('auto-resume-phase');
      if (phEl) phEl.textContent = A.phaseLabel(s.phase);
    } else {
      var summ = el('auto-fresh-summary');
      if (summ) {
        var v = app.experimentalModesEnabled ? app.prepareConfig.variant : 'standard';
        if (v === 'kasper') {
          summ.innerHTML =
            '<strong class="text-mafia-gold">Каспер (9 игроков):</strong> 5 мирных, шериф, 2 мафии, дон. 10-й — фантом-Каспер, своей раздачи и хода не имеет; его «голос» учитывается только в голосовании первого дня, ночью 1 он автоматически считается убитым.';
        } else if (v === 'merlin') {
          summ.innerHTML =
            '<strong class="text-mafia-gold">Мерлин (10 игроков):</strong> 5 мирных, шериф, Мерлин, 2 мафии, дон. В первую активную ночь Мерлин узнаёт тройку чёрных и шерифа.';
        } else {
          summ.innerHTML =
            '<strong class="text-mafia-gold">Стандарт (10 игроков):</strong> 6 мирных, шериф, 2 мафии, дон.';
        }
      }
    }
  };

  app.startFreshAutoGame = function () {
    if (app.clearCurrentHistoryLink) app.clearCurrentHistoryLink();
    A.loadPrepareConfig();
    var variant =
      app.experimentalModesEnabled && A.isAutoSupportedVariant(app.prepareConfig.variant)
        ? app.prepareConfig.variant
        : 'standard';
    var dealt = A.dealRolesForVariant(variant);
    var fresh = A.makeFreshState();
    fresh.active = true;
    fresh.phase = 'setup';
    var realRoleCount = variant === 'kasper' ? dealt.length - 1 : dealt.length;
    fresh.reveal = {
      version: 2,
      cursor: 1,
      stage: 'pick',
      remainingRoles: dealt.slice(0, realRoleCount),
      selectedRole: null,
      showUntil: 0,
    };
    fresh.dayNum = 0;
    fresh.nightNum = 0;
    fresh.playerCount = A.DEFAULT_PLAYER_COUNT;
    fresh.variant = variant;
    for (var i = 0; i < A.DEFAULT_PLAYER_COUNT; i++) {
      fresh.seats.push({
        id: i + 1,
        role: variant === 'kasper' && i === 9 ? dealt[i] : null,
        alive: true,
        fouls: 0,
        nick: '',
      });
    }
    // Каспер: 10-й — фантом до его автоубийства в первую активную ночь.
    // alive=true (его «голос» учитывается в пуле дневного голосования),
    // но phantom=true → исключаем из раздачи, ночных ходов, выставлений, фолов, модалок.
    if (variant === 'kasper' && fresh.seats[9]) fresh.seats[9].phantom = true;
    app.autoState = fresh;
    A.setPhase('reveal');
    A.saveAuto();
    app.navigateToScreen('auto-reveal-screen');
  };

  app.resumeAutoGame = function () {
    var s = app.autoState;
    if (!s.active) return;
    app.navigateToScreen(A.resolvePendingPhase(s.phase));
  };

  app.restartAutoGame = function () {
    if (
      app.autoState &&
      app.autoState.active &&
      app.autoState.phase !== 'setup' &&
      app.saveCurrentGameToHistory
    ) {
      app.saveCurrentGameToHistory({ silent: true });
    }
    if (app.clearCurrentHistoryLink) app.clearCurrentHistoryLink();
    A.clearAllAutoTimers();
    app.autoState = A.makeFreshState();
    A.saveAuto();
    app.renderAutoSetup();
  };

  app.registerScreenRenderer('auto-setup-screen', function () {
    app.renderAutoSetup();
  });
})(window.MafiaApp);
