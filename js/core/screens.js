(function (app) {
  var MODAL_MS = 118;

  function blurFocusInside(el) {
    var ae = document.activeElement;
    if (ae && el.contains(ae) && typeof ae.blur === 'function') ae.blur();
  }

  app.modalSetOpen = function (el, open) {
    if (!el) return;
    // Десктоп-режимы могут перехватить модалку (показ inline-панелью вместо
    // оверлея) — см. app.registerModalInterceptor ниже.
    var icept = el.id ? app._modalInterceptors[el.id] : null;
    if (icept && icept(el, open) === true) return;
    if (open) {
      el._modalGen = (el._modalGen || 0) + 1;
      if (el._modalTransEnd) {
        el.removeEventListener('transitionend', el._modalTransEnd);
        el._modalTransEnd = null;
      }
      if (el._modalCloseTimer) {
        clearTimeout(el._modalCloseTimer);
        el._modalCloseTimer = null;
      }
      el.classList.remove('hidden');
      el.setAttribute('aria-hidden', 'false');
      void el.offsetWidth;
      el.setAttribute('data-open', '');
    } else {
      if (!el.hasAttribute('data-open') && el.classList.contains('hidden')) return;
      blurFocusInside(el);
      if (!el.hasAttribute('data-open')) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
        return;
      }
      el._modalGen = (el._modalGen || 0) + 1;
      var closeGen = el._modalGen;
      el.removeAttribute('data-open');
      var done = function (ev) {
        if (el._modalGen !== closeGen) return;
        if (ev.target !== el || ev.propertyName !== 'opacity') return;
        if (el.hasAttribute('data-open')) return;
        el.removeEventListener('transitionend', done);
        if (el._modalTransEnd === done) el._modalTransEnd = null;
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
      };
      el._modalTransEnd = done;
      el.addEventListener('transitionend', done);
      if (el._modalCloseTimer) clearTimeout(el._modalCloseTimer);
      el._modalCloseTimer = setTimeout(function () {
        el._modalCloseTimer = null;
        if (el._modalGen !== closeGen) return;
        if (el.hasAttribute('data-open')) return;
        el.removeEventListener('transitionend', done);
        if (el._modalTransEnd === done) el._modalTransEnd = null;
        if (!el.classList.contains('hidden')) {
          el.classList.add('hidden');
          el.setAttribute('aria-hidden', 'true');
        }
      }, MODAL_MS + 40);
    }
  };

  app.hideAuthorLinksModal = function () {
    var m = document.getElementById('modal-author-links');
    if (m) app.modalSetOpen(m, false);
  };

  app.showAuthorLinksModal = function () {
    var m = document.getElementById('modal-author-links');
    if (m) app.modalSetOpen(m, true);
  };

  app.hideResetGameConfirmModal = function () {
    var m = document.getElementById('modal-reset-game-confirm');
    if (m) app.modalSetOpen(m, false);
  };

  app.showResetGameConfirmModal = function () {
    var m = document.getElementById('modal-reset-game-confirm');
    if (m) app.modalSetOpen(m, true);
  };

  // Реестр рендереров экранов: модуль-владелец экрана регистрирует функцию,
  // которая вызывается при каждом переходе на экран. Контракт явный — если
  // экран не отрисовался, значит никто не зарегистрировал рендерер.
  app.screenRenderers = {};
  app.registerScreenRenderer = function (screenId, fn) {
    app.screenRenderers[screenId] = fn;
  };

  // Перехватчики модалок (десктоп-режимы превращают модалки в inline-панели).
  // fn(el, open) возвращает true, если открытие/закрытие полностью обработано —
  // тогда стандартная механика modalSetOpen не выполняется.
  app._modalInterceptors = {};
  app.registerModalInterceptor = function (modalId, fn) {
    app._modalInterceptors[modalId] = fn;
  };

  // Навигационные гварды: выполняются ДО перехода, в порядке, обратном
  // регистрации (семантика вложенных обёрток: последний зарегистрированный —
  // «снаружи»). Возврат false отменяет переход (гвард может выполнить свой —
  // например, открыть inline-слот вместо экрана).
  app._navGuards = [];
  app.registerNavigationGuard = function (fn) {
    app._navGuards.push(fn);
  };

  // Слушатели «после перехода» (например, подсветка активного пункта навбара).
  app._navListeners = [];
  app.onNavigated = function (fn) {
    app._navListeners.push(fn);
  };

  app.navigateToScreen = function (screenId) {
    for (var gi = app._navGuards.length - 1; gi >= 0; gi--) {
      if (app._navGuards[gi](screenId) === false) return;
    }
    // Любой переход выходит из встроенного режима голосования (ПК) — раскладка стола
    // восстанавливается, vote-body возвращается на vote-screen.
    if (app.exitPcVoting) app.exitPcVoting();
    if (app.exitPcUrbanNightActions) app.exitPcUrbanNightActions();
    if (screenId !== 'settings-screen' && app.stopMusicPreview) app.stopMusicPreview();
    if (screenId !== 'vote-screen' && app.hideVoteCountModal) app.hideVoteCountModal();
    if (screenId !== 'urban-night-screen' && app.hideUrbanNightTargetModal) {
      app.hideUrbanNightTargetModal();
    }
    if (screenId !== 'game-screen' && screenId !== 'prepare-screen' && app.hidePlayerActionsModal) {
      app.hidePlayerActionsModal();
    }
    if (screenId !== 'summary-screen' && app.hideSummaryPlayerModal) app.hideSummaryPlayerModal();
    if (screenId !== 'summary-screen' && app.hideSummaryLogModal) app.hideSummaryLogModal();
    if (screenId !== 'menu-screen') {
      if (app.hideAuthorLinksModal) app.hideAuthorLinksModal();
      if (app.hideResetGameConfirmModal) app.hideResetGameConfirmModal();
    }
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById(screenId);
    if (el) el.classList.add('active');
    if (screenId === 'vote-screen') {
      var gs = document.getElementById('game-screen');
      var ae = document.activeElement;
      if (ae && gs && gs.contains(ae) && typeof ae.blur === 'function') ae.blur();
    }
    var render = app.screenRenderers[screenId];
    if (render) render();
    for (var li = 0; li < app._navListeners.length; li++) {
      try {
        app._navListeners[li](screenId);
      } catch (e) {}
    }
  };

  app.registerScreenRenderer('menu-screen', function () {
    if (app.updateResetButtonVisibility) app.updateResetButtonVisibility();
  });

  // Настройки размазаны по модулям (музыка, spotify, озвучка, таймер) — пока
  // у экрана нет единого владельца, композитный рендерер живёт здесь.
  app.registerScreenRenderer('settings-screen', function () {
    if (app.setSettingsTab) app.setSettingsTab(app.settingsActiveTab);
    if (app.renderSpotifyGlobalSettings) app.renderSpotifyGlobalSettings();
    if (app.renderMusicSettings) app.renderMusicSettings();
    if (app.syncTimerVoiceCheckbox) app.syncTimerVoiceCheckbox();
    if (app.syncTimerVoiceExtraControls) app.syncTimerVoiceExtraControls();
    if (app.syncMusicIntroControls) app.syncMusicIntroControls();
    if (app.syncTimerDurationInputs) app.syncTimerDurationInputs();
    if (app.syncExperimentalModesCheckbox) app.syncExperimentalModesCheckbox();
    if (app.syncMuLookupCheckbox) app.syncMuLookupCheckbox();
  });

  app.initGameFromMenu = function () {
    app.renderPlayers();
    app.resetTimer(app.timeLeft);
    app.refreshNomineeQueueUi();
  };

  app.getAvailableCount = function () {
    return app.roles.length;
  };

  app.settingsActiveTab = 'general';
  app.setSettingsTab = function (tab) {
    if (tab !== 'music' && tab !== 'general') tab = 'general';
    app.settingsActiveTab = tab;
    var mp = document.getElementById('settings-tab-music');
    var gp = document.getElementById('settings-tab-general');
    // Прячем через inline display, а не класс `hidden`: на десктопе `lg:grid`
    // перебивает `hidden` (media-query важнее), и скрытая вкладка всё равно
    // показывалась бы. Inline-стиль имеет приоритет над любыми классами.
    if (mp) {
      mp.style.display = tab === 'music' ? '' : 'none';
      mp.classList.remove('hidden');
    }
    if (gp) {
      gp.style.display = tab === 'general' ? '' : 'none';
      gp.classList.remove('hidden');
    }
    var btns = document.querySelectorAll('[data-action="settings-tab"]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var on = b.getAttribute('data-tab') === tab;
      b.classList.toggle('bg-mafia-blood/40', on);
      b.classList.toggle('border-mafia-gold/60', on);
      b.classList.toggle('text-mafia-gold', on);
      b.classList.toggle('bg-mafia-card', !on);
      b.classList.toggle('border-mafia-border', !on);
      b.classList.toggle('text-mafia-cream/80', !on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  app.showToast = function (message) {
    var el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className =
        'fixed bottom-6 left-1/2 z-[100] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-lg border border-mafia-gold/45 bg-mafia-coal/95 px-4 py-2.5 text-center text-sm text-mafia-cream/95 shadow-lg transition-opacity duration-200 ease-out pointer-events-none opacity-0';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    void el.offsetWidth;
    el.classList.remove('opacity-0');
    el.classList.add('opacity-100');
    clearTimeout(el._toastHide);
    el._toastHide = setTimeout(function () {
      el.classList.remove('opacity-100');
      el.classList.add('opacity-0');
    }, 2400);
  };

  // Тост с действием «Отменить» (для undo операций с плейлистами). Висит дольше
  // обычного; клик по «Отменить» вызывает onUndo и сразу прячет тост.
  app.showUndoToast = function (message, onUndo, holdMs) {
    var el = document.getElementById('app-undo-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-undo-toast';
      el.className =
        'fixed bottom-6 left-1/2 z-[100] flex max-w-[min(92vw,24rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-mafia-gold/45 bg-mafia-coal/95 px-4 py-2.5 text-sm text-mafia-cream/95 shadow-lg transition-opacity duration-200 ease-out opacity-0';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      var msgEl = document.createElement('span');
      msgEl.setAttribute('data-undo-msg', '');
      msgEl.className = 'flex-1 min-w-0';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-undo-btn', '');
      btn.className =
        'flex-shrink-0 uppercase tracking-wider text-mafia-gold hover:text-mafia-gold/80 cursor-pointer';
      btn.textContent = 'Отменить';
      el.appendChild(msgEl);
      el.appendChild(btn);
      document.body.appendChild(el);
    }
    var msgNode = el.querySelector('[data-undo-msg]');
    var btnNode = el.querySelector('[data-undo-btn]');
    if (msgNode) msgNode.textContent = message;

    function hide() {
      el.classList.remove('opacity-100');
      el.classList.add('opacity-0');
      el.classList.add('pointer-events-none');
    }
    clearTimeout(el._undoHide);
    // Свежий обработчик на каждый показ (старый снимаем клонированием узла).
    if (btnNode) {
      var fresh = btnNode.cloneNode(true);
      btnNode.parentNode.replaceChild(fresh, btnNode);
      fresh.addEventListener('click', function () {
        clearTimeout(el._undoHide);
        hide();
        if (typeof onUndo === 'function') onUndo();
      });
    }
    el.classList.remove('pointer-events-none');
    void el.offsetWidth;
    el.classList.remove('opacity-0');
    el.classList.add('opacity-100');
    el._undoHide = setTimeout(hide, typeof holdMs === 'number' ? holdMs : 6000);
  };
})(window.MafiaApp);
