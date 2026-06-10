// Унифицированная панель игрока (lg+).
//
// На десктопе модалки игрока (modal-player-actions + modal-summary-player)
// сворачиваются в одну боковую панель с тремя разворачиваемыми секциями:
// «Подготовка» / «Игра» / «Итоги». Псевдоним вынесен в шапку панели,
// редактируется из любой секции (через зеркалирование в скрытое summary-nick).
//
// Default-раскрытая секция выбирается по контексту:
//   • modal-player-actions на prepare-screen     → «Подготовка»
//   • modal-player-actions на game-screen        → «Игра»
//   • modal-summary-player (включая левую панель
//     «summary-player-open-from-game»)            → «Итоги»
//
// Видимость секций реагирует в реальном времени:
//   • prepare-screen          → все 3 секции
//   • game-screen             → «Подготовка» скрыта, пока выключен «Показать роли»;
//                               в «Итогах» скрыты бонусы/роль (пока роли скрыты)
//   • summary-screen          → «Подготовка» скрыта, пока не выбран победитель;
//                               в «Итогах» скрыты бонусы/роль (пока не выбран победитель)
//
// Выбор роли в «Подготовке» и «Итогах» зеркалируется и автосохраняется.
//
// Шорткаты 1..9, 0 — открыть/закрыть панель игрока соответствующего номера.

(function (app) {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // Константы
  // ────────────────────────────────────────────────────────────

  // Модалки, чьё открытие/закрытие мы перехватываем для unified-панели.
  var MODAL_IDS = ['modal-player-actions', 'modal-summary-player'];

  // Секции в порядке отображения. Соответствуют контекстам редактирования игрока.
  var SECTIONS = [
    { key: 'prepare', label: 'Подготовка' },
    { key: 'game', label: 'Игра' },
    { key: 'summary', label: 'Итоги' },
  ];

  // ID groups радио-кнопок выбора роли. Используется при автосейве и пересинке.
  var ROLE_ROW_PREPARE = 'modal-player-prepare-role-icons';
  var ROLE_ROW_SUMMARY = 'modal-summary-role-icons';

  // ────────────────────────────────────────────────────────────
  // Маленькие helpers общего назначения
  // ────────────────────────────────────────────────────────────

  function isLg() {
    return window.matchMedia && window.matchMedia('(min-width: 1024px)').matches;
  }
  function activeScreen() {
    return document.querySelector('.screen.active');
  }
  function activeScreenId() {
    var s = activeScreen();
    return s ? s.id : null;
  }

  function findSlot() {
    var s = activeScreen();
    // Селектор .unified-player-slot — чтобы не зацепить специализированные
    // боковые слоты (#vote-count-slot, #setup-slot), которые тоже имеют
    // класс .player-detail-slot ради переиспользования анимации.
    return s ? s.querySelector('.unified-player-slot') : null;
  }
  function closeAllSlots() {
    var slots = document.querySelectorAll('.unified-player-slot.is-open');
    for (var i = 0; i < slots.length; i++) slots[i].classList.remove('is-open');
  }

  // Прочитать ID игрока из dataset любой из перехватываемых модалок, если она открыта.
  function getCurrentOpenPlayerId() {
    for (var i = 0; i < MODAL_IDS.length; i++) {
      var m = document.getElementById(MODAL_IDS[i]);
      if (m && m.hasAttribute('data-open') && m.dataset.playerId) {
        var n = parseInt(m.dataset.playerId, 10);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }
  function panelIsCurrentlyOpen() {
    return !!document.querySelector('.unified-player-slot.is-open');
  }

  // Прочитать выбранную роль из ARIA-radio группы (Подготовка / Итоги).
  function getSelectedRoleFromRow(rowId) {
    var row = document.getElementById(rowId);
    if (!row) return null;
    var picked = row.querySelector('[role="radio"][aria-checked="true"]');
    if (!picked) return null;
    // Подготовка пишет в data-role-code, Итоги — в data-summary-role.
    return picked.getAttribute('data-role-code') || picked.dataset.summaryRole || null;
  }

  // ────────────────────────────────────────────────────────────
  // Локальное состояние модуля
  // ────────────────────────────────────────────────────────────

  var unified = null; // корневой DOM-элемент панели
  var sectionByKey = Object.create(null); // key → <section>
  var titleEl = null; // <span> с номером игрока в шапке

  // Гард для рекурсии: cross-populate вызывает чужие show* функции, которые
  // вызывают modalSetOpen → попадают в наш хук. Этот флаг отсекает их.
  var inCrossPopulateCall = false;

  // Гард для рекурсии при закрытии: closeUnified вызывает hide*/apply*
  // функции, которые тоже идут через modalSetOpen → возвращаются сюда же.
  var inUnifiedCloseCall = false;

  // ────────────────────────────────────────────────────────────
  // Построение DOM unified-панели
  // ────────────────────────────────────────────────────────────

  function buildUnified() {
    unified = document.createElement('div');
    unified.id = 'unified-player-panel';
    unified.className =
      'unified-player-panel bg-mafia-coal border-2 border-mafia-gold/40 rounded-lg shadow-xl';

    var header = document.createElement('div');
    header.className = 'unified-player-panel__header';
    header.innerHTML =
      '<div class="unified-player-panel__title-row">' +
      '<h2 class="font-display text-mafia-gold text-xl font-bold tracking-wide leading-tight">Игрок №<span id="unified-player-num">—</span></h2>' +
      '<button type="button" class="modal-panel__close-x" data-action="unified-player-close" aria-label="Закрыть">×</button>' +
      '</div>' +
      '<div id="unified-nick-host"></div>';
    unified.appendChild(header);
    titleEl = header.querySelector('#unified-player-num');

    var sectionsWrap = document.createElement('div');
    sectionsWrap.className = 'unified-sections';
    unified.appendChild(sectionsWrap);

    SECTIONS.forEach(function (s) {
      var section = buildSection(s);
      sectionsWrap.appendChild(section);
      sectionByKey[s.key] = section;
    });

    // Делегированный click-handler + collapse-others on expand. Single-mode =
    // классический accordion (одна секция за раз). Графика (max-height transition,
    // chevron rotation) полностью в niokit'овском .k-accordion.
    if (window.Kit && window.Kit.accordion) window.Kit.accordion(sectionsWrap, { single: true });

    // Универсальный Save в подвале — закрывает панель (а closeUnified уже
    // прогоняет save-функции каждой открытой модалки). Стиль — как у
    // оригинальных Save кнопок в модалках (приглушённая ссылка-подпись).
    var footer = document.createElement('div');
    footer.className = 'unified-player-panel__footer';
    footer.innerHTML =
      '<button type="button" data-action="unified-player-close" ' +
      'class="w-full py-2 text-mafia-cream/50 hover:text-mafia-cream/80 ' +
      'text-sm uppercase tracking-wider cursor-pointer">Сохранить</button>';
    unified.appendChild(footer);

    distributeOriginalModalContent();
    bindNickMirror();
  }

  function buildSection(spec) {
    var section = document.createElement('section');
    // .k-accordion__item — niokit базовая разметка; .unified-section — наш
    // селектор для проектных оверрайдов (chevron цвет, padding modal-panel).
    section.className = 'k-accordion__item unified-section';
    section.setAttribute('data-section-key', spec.key);

    var headerBtn = document.createElement('button');
    headerBtn.type = 'button';
    headerBtn.className = 'k-accordion__header unified-section__header';
    // Chevron — через ::before niokit'овского .k-accordion__header, span здесь
    // больше не нужен. Click-handler не вешаем — Kit.accordion на корне
    // делегирует click'и + сам collapse'ит другие при single:true.
    headerBtn.innerHTML = '<span>' + spec.label + '</span>';

    var body = document.createElement('div');
    body.className = 'k-accordion__body unified-section__body';
    var inner = document.createElement('div');
    inner.className = 'k-accordion__inner unified-section__inner';
    body.appendChild(inner);

    section.appendChild(headerBtn);
    section.appendChild(body);
    return section;
  }

  // Перетаскивает поля оригинальных модалок в подготовленные секции.
  // Псевдоним из modal-player-actions выносится в шапку (общая точка для
  // редактирования). Дублирующий nick в modal-summary-player скрывается.
  function distributeOriginalModalContent() {
    distributePlayerActionsContent();
    distributeSummaryPlayerContent();
  }

  function distributePlayerActionsContent() {
    var modal = document.getElementById('modal-player-actions');
    if (!modal) return;
    var panel = modal.querySelector('.modal-panel');
    if (!panel) return;

    var nickInput = panel.querySelector('#modal-player-nick');
    var nickWrap = nickInput ? nickInput.parentElement : null;
    var prepareRole = panel.querySelector('#modal-player-prepare-role-section');
    var actionsActive = panel.querySelector('#modal-player-actions-when-active');
    var actionsOut = panel.querySelector('#modal-player-actions-when-out');

    var nickHost = unified.querySelector('#unified-nick-host');
    if (nickWrap && nickHost) nickHost.appendChild(nickWrap);

    if (prepareRole) {
      // В унифицированной панели prepare-role не скрывается по mode —
      // её видимостью управляет updateSectionVisibility().
      prepareRole.classList.remove('hidden');
      sectionInner('prepare').appendChild(prepareRole);
    }
    if (actionsActive) sectionInner('game').appendChild(actionsActive);
    if (actionsOut) sectionInner('game').appendChild(actionsOut);
  }

  function distributeSummaryPlayerContent() {
    var modal = document.getElementById('modal-summary-player');
    if (!modal) return;
    var panel = modal.querySelector('.modal-panel');
    if (!panel) return;
    sectionInner('summary').appendChild(panel);
    // Скрываем дублирующий nick из summary — он теперь в шапке.
    var spNick = panel.querySelector('#modal-summary-nick');
    if (spNick && spNick.parentElement) {
      spNick.parentElement.style.display = 'none';
    }
  }

  function sectionInner(key) {
    return sectionByKey[key].querySelector('.unified-section__inner');
  }

  // Любые правки шапочного nick дублируются в скрытое #modal-summary-nick,
  // чтобы applySummaryPlayerModal (читает оттуда) видел свежее значение.
  function bindNickMirror() {
    var src = document.getElementById('modal-player-nick');
    var dst = document.getElementById('modal-summary-nick');
    if (!src || !dst) return;
    src.addEventListener('input', function () {
      if (dst.value !== src.value) dst.value = src.value;
    });
  }

  // ────────────────────────────────────────────────────────────
  // Аккордеон — тонкие обёртки над Kit.accordion (niokit v0.3.0).
  // Всю механику (измеренная max-height, transition, chevron rotation)
  // делает Kit; здесь — только проектные хелперы expandOnly/collapseAll
  // под sectionByKey.
  // ────────────────────────────────────────────────────────────

  function kitAcc() {
    return (window.Kit && window.Kit.accordion) || null;
  }

  function expandOnly(key) {
    var A = kitAcc();
    if (!A) return;
    Object.keys(sectionByKey).forEach(function (k) {
      if (k === key) A.expand(sectionByKey[k]);
      else A.collapse(sectionByKey[k]);
    });
  }

  function collapseAll() {
    var A = kitAcc();
    if (!A) return;
    Object.keys(sectionByKey).forEach(function (k) {
      A.collapse(sectionByKey[k]);
    });
  }

  // После изменения видимости/контента внутри открытой секции (показался
  // или скрылся бонус-блок, перерендерилась радио-row ролей) — фиксированный
  // max-height становится неверным. Просим Kit перемерить scrollHeight.
  function recomputeExpandedHeights() {
    var A = kitAcc();
    if (!A) return;
    Object.keys(sectionByKey).forEach(function (k) {
      A.recompute(sectionByKey[k]);
    });
  }

  // ────────────────────────────────────────────────────────────
  // Видимость секций по флагу «роли показаны»
  // ────────────────────────────────────────────────────────────

  // Считаем «роли видны» по правилу:
  //   prepare-screen — всегда (играем в открытую перед раздачей карт).
  //   game-screen    — только когда нажата кнопка «Показать роли».
  //   summary-screen — только когда выбран победитель.
  function rolesAreVisible() {
    var sid = activeScreenId();
    if (sid === 'prepare-screen') return true;
    if (sid === 'game-screen') return !!app.gameSideShowRoles;
    if (sid === 'summary-screen') return !!(app.summaryWinnerChosen && app.summaryWinnerChosen());
    return true;
  }

  function updateSectionVisibility() {
    if (!unified) return;
    var visible = rolesAreVisible();

    // Секция «Подготовка» целиком прячется, когда роли не видны.
    var prep = sectionByKey.prepare;
    if (prep) {
      prep.style.display = visible ? '' : 'none';
      if (!visible && prep.classList.contains('is-expanded')) {
        prep.classList.remove('is-expanded');
        var pb = prep.querySelector('.unified-section__body');
        if (pb) pb.style.maxHeight = '0px';
      }
    }

    // В «Итогах» гейтим бонусы (роль на десктопе скрыта всегда — она в
    // «Подготовке» — см. CSS-правило для .unified-section #modal-summary-role-section).
    setDisplay('modal-summary-bonus-section', visible);

    recomputeExpandedHeights();
  }

  function setDisplay(id, visible) {
    var el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  }

  // ────────────────────────────────────────────────────────────
  // Open / close оркестрация
  // ────────────────────────────────────────────────────────────

  // showPlayerActionsModal (из players.js) скрывает foul/vote/eliminate на
  // prepare-screen и prepare-role на game-screen — в зависимости от
  // активного экрана. В унифицированной панели нам нужно ВСЁ содержимое
  // независимо от источника. Перевыставляем .hidden от состояния игрока.
  function unhideContentFor(playerId) {
    var prepRole = document.getElementById('modal-player-prepare-role-section');
    if (prepRole) prepRole.classList.remove('hidden');

    var p =
      app.players &&
      app.players.find(function (x) {
        return x.id === playerId;
      });
    if (!p) return;
    var whenActive = document.getElementById('modal-player-actions-when-active');
    var whenOut = document.getElementById('modal-player-actions-when-out');
    if (!whenActive || !whenOut) return;
    if (p.eliminationReason) {
      whenActive.classList.add('hidden');
      whenOut.classList.remove('hidden');
    } else {
      whenActive.classList.remove('hidden');
      whenOut.classList.add('hidden');
    }
  }

  // Подтянуть данные игрока во все 3 модалки (кроме источника, которая
  // только что показала себя сама). Источник определяется по modalId.
  function crossPopulate(playerId, sourceModalId) {
    if (typeof playerId !== 'number' || isNaN(playerId)) return;
    inCrossPopulateCall = true;
    try {
      if (
        sourceModalId !== 'modal-player-actions' &&
        typeof app.showPlayerActionsModal === 'function'
      ) {
        try {
          app.showPlayerActionsModal(playerId);
        } catch (e) {}
      }
      if (
        sourceModalId !== 'modal-summary-player' &&
        typeof app.showSummaryPlayerModal === 'function'
      ) {
        try {
          app.showSummaryPlayerModal(playerId);
        } catch (e) {}
      }
    } finally {
      inCrossPopulateCall = false;
    }
  }

  function sourceSectionKeyForOpen(modalId) {
    if (modalId === 'modal-summary-player') return 'summary';
    if (modalId === 'modal-player-actions') {
      return activeScreenId() === 'prepare-screen' ? 'prepare' : 'game';
    }
    return 'game';
  }

  function firstVisibleSectionKey(preferred) {
    if (sectionByKey[preferred] && sectionByKey[preferred].style.display !== 'none') {
      return preferred;
    }
    var order = ['game', 'summary', 'prepare'];
    for (var i = 0; i < order.length; i++) {
      var s = sectionByKey[order[i]];
      if (s && s.style.display !== 'none') return order[i];
    }
    return preferred;
  }

  function openForPlayer(playerId, sourceModalId) {
    var target = findSlot();
    if (!target) return false;

    // Если панель уже открыта для ДРУГОГО игрока — сохраняем его правки до
    // того как crossPopulate перепишет dataset.playerId на нового. Иначе
    // правки старого приписались бы новому или потерялись.
    var prevPid = getCurrentOpenPlayerId();
    if (prevPid != null && prevPid !== playerId) saveCurrentPlayerInputs(prevPid);

    crossPopulate(playerId, sourceModalId);
    unhideContentFor(playerId);

    if (unified.parentNode !== target) target.appendChild(unified);
    if (titleEl) titleEl.textContent = String(playerId);

    updateSectionVisibility();
    expandOnly(firstVisibleSectionKey(sourceSectionKeyForOpen(sourceModalId)));

    requestAnimationFrame(function () {
      target.classList.add('is-open');
    });
    return true;
  }

  function markAllModalsClosed() {
    MODAL_IDS.forEach(function (id) {
      var m = document.getElementById(id);
      if (!m) return;
      m.removeAttribute('data-open');
      m.setAttribute('aria-hidden', 'true');
    });
  }

  function hideAllOverlays() {
    MODAL_IDS.forEach(function (id) {
      var m = document.getElementById(id);
      if (m) m.style.display = 'none';
    });
  }

  // Прогон save-функций открытых модалок (без визуального закрытия). Их
  // modalSetOpen(false) попадает в наш hook → closeUnified → guarded
  // inUnifiedCloseCall → return early. Используется при переключении игроков
  // (чтобы не потерять правки) и из closeUnified.
  //
  // targetPid — кому ПРАВИТЬ. Caller (showSummary/showPlayerActions) может
  // уже переписать modal.dataset.playerId на нового игрока ДО того, как мы
  // через modalSetOpen попадём в openForPlayer и вызовем save. apply/hide
  // читают dataset.playerId и пишут туда — без явного targetPid'а правки
  // старого игрока приписались бы новому. Snapshot+force+restore над
  // MODAL_IDS dataset'ами гарантирует, что save пишет в targetPid.
  function saveCurrentPlayerInputs(targetPid) {
    if (inUnifiedCloseCall) return;
    inUnifiedCloseCall = true;
    var snapshot = null;
    if (targetPid != null) {
      snapshot = {};
      for (var si = 0; si < MODAL_IDS.length; si++) {
        var sm = document.getElementById(MODAL_IDS[si]);
        if (!sm) continue;
        snapshot[MODAL_IDS[si]] = sm.dataset.playerId;
        sm.dataset.playerId = String(targetPid);
      }
    }
    try {
      if (
        isModalMarkedOpen('modal-player-actions') &&
        typeof app.hidePlayerActionsModal === 'function'
      ) {
        try {
          app.hidePlayerActionsModal();
        } catch (e) {}
      }
      // ВАЖНО: applySummaryPlayerModal читает #modal-summary-nick и пишет
      // в pl.nick. Если bindNickMirror не успел сработать (paste, programmatic
      // .value=, autocomplete pick) — summary nick может содержать старое
      // значение и перезатрёт свежий nick из header. Синкаем явно.
      forceMirrorNickFromHeader();
      if (
        isModalMarkedOpen('modal-summary-player') &&
        typeof app.applySummaryPlayerModal === 'function'
      ) {
        try {
          app.applySummaryPlayerModal();
        } catch (e) {}
      }
    } finally {
      if (snapshot) {
        for (var ri = 0; ri < MODAL_IDS.length; ri++) {
          var rm = document.getElementById(MODAL_IDS[ri]);
          if (rm && snapshot[MODAL_IDS[ri]] != null) {
            rm.dataset.playerId = snapshot[MODAL_IDS[ri]];
          }
        }
      }
      inUnifiedCloseCall = false;
    }
  }

  function forceMirrorNickFromHeader() {
    var src = document.getElementById('modal-player-nick');
    var dst = document.getElementById('modal-summary-nick');
    if (src && dst && dst.value !== src.value) dst.value = src.value;
  }

  // Закрытие unified — сохраняем правки + сворачиваем слот.
  function closeUnified() {
    if (inUnifiedCloseCall) return;
    saveCurrentPlayerInputs();
    closeAllSlots();
    collapseAll();
    markAllModalsClosed();
  }

  function isModalMarkedOpen(id) {
    var m = document.getElementById(id);
    return !!(m && m.hasAttribute('data-open'));
  }

  // ────────────────────────────────────────────────────────────
  // Автосейв роли при пике и пересинк radio-групп
  // ────────────────────────────────────────────────────────────

  function savePlayerRoleAndSync(sourceRowId) {
    var pid = getCurrentOpenPlayerId();
    if (pid == null) return;
    var roleCode = getSelectedRoleFromRow(sourceRowId);
    if (!roleCode) return;

    app.summaryRoleByPlayerId = app.summaryRoleByPlayerId || {};
    app.summaryRoleByPlayerId[String(pid)] = roleCode;
    if (app.saveState) app.saveState();

    // Пересинк обеих radio-групп: они должны показывать одно и то же.
    if (app.getEffectiveSummaryRoleCode) {
      var p = app.players.find(function (x) {
        return x.id === pid;
      });
      var seatIndex = p ? app.players.indexOf(p) : -1;
      var current = app.getEffectiveSummaryRoleCode(pid, seatIndex);
      if (app.renderPrepareModalRoleRadios) app.renderPrepareModalRoleRadios(current);
      if (app.renderModalSummaryRoleRadios) {
        var unlocked = app.summaryWinnerChosen ? app.summaryWinnerChosen() : true;
        app.renderModalSummaryRoleRadios(current, !!unlocked);
      }
    }

    // Re-render потребителей роли (гармошки, итоги).
    ['renderPlayers', 'renderPreparePlayers', 'renderSummary', 'renderGameSidePanels'].forEach(
      function (fn) {
        if (typeof app[fn] === 'function') app[fn]();
      }
    );
  }

  // ────────────────────────────────────────────────────────────
  // Хуки: modalSetOpen, navigateToScreen
  // ────────────────────────────────────────────────────────────

  function hookModalSetOpen() {
    var orig = app.modalSetOpen;
    if (!orig || orig.__desktopPlayerPanelHooked) return;
    var wrapped = function (el, open) {
      if (el && MODAL_IDS.indexOf(el.id) !== -1) {
        // Рекурсия из cross-populate — оставить только метки data-open.
        if (inCrossPopulateCall) {
          if (open) {
            el.setAttribute('data-open', '');
            el.setAttribute('aria-hidden', 'false');
          }
          return;
        }
        if (open) {
          var pid = parseInt(el.dataset.playerId, 10);
          if (!openForPlayer(pid, el.id)) {
            return orig.apply(this, arguments);
          }
          el.setAttribute('data-open', '');
          el.setAttribute('aria-hidden', 'false');
        } else {
          closeUnified();
        }
        return;
      }
      return orig.apply(this, arguments);
    };
    wrapped.__desktopPlayerPanelHooked = true;
    app.modalSetOpen = wrapped;
  }

  function hookNavigateToScreen() {
    var orig = app.navigateToScreen;
    if (!orig || orig.__desktopPlayerPanelNavHooked) return;
    var wrapped = function () {
      closeUnified();
      return orig.apply(this, arguments);
    };
    wrapped.__desktopPlayerPanelNavHooked = true;
    app.navigateToScreen = wrapped;
  }

  // ────────────────────────────────────────────────────────────
  // Глобальные слушатели событий
  // ────────────────────────────────────────────────────────────

  // Перерасчёт видимости при переключении «Показать роли» / выборе победителя.
  // Слушаем на capture-фазе, чтобы поймать e.target ДО того как обработчик
  // оригинала (b.onclick → renderSummary) перерисует #summary-winning-team-icons
  // и отвяжет target от DOM — иначе .closest() вернёт null и trigger не сработает.
  function bindVisibilityTriggers() {
    document.addEventListener(
      'click',
      function (e) {
        if (!e.target || !e.target.closest) return;
        if (
          e.target.closest('[data-action="game-side-toggle-roles"]') ||
          e.target.closest('#summary-winning-team-icons')
        ) {
          // setTimeout 0 — даём оригинальному хендлеру сначала обновить флаг state.
          setTimeout(updateSectionVisibility, 0);
        }
      },
      true
    );
  }

  // Автосейв роли при клике по любой радио-кнопке (Подготовка/Итоги).
  // Capture-фаза по той же причине: оригинальный handler пересоздаёт radio-row.
  function bindRolePickerAutosave() {
    document.addEventListener(
      'click',
      function (e) {
        if (!e.target || !e.target.closest) return;
        if (e.target.closest('[data-action="player-prepare-role-pick"]')) {
          setTimeout(function () {
            savePlayerRoleAndSync(ROLE_ROW_PREPARE);
          }, 0);
        } else if (e.target.closest('#' + ROLE_ROW_SUMMARY + ' [role="radio"]')) {
          setTimeout(function () {
            savePlayerRoleAndSync(ROLE_ROW_SUMMARY);
          }, 0);
        }
      },
      true
    );
  }

  // Шорткаты 1..9, 0 → открыть/закрыть панель игрока соответствующего номера.
  // На каком экране — туда и роутим (player-actions на game/prepare, summary
  // на summary). Игнорируем при фокусе в текстовом инпуте и модификаторах.
  function bindPlayerNumberShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (!isLg()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (
        t &&
        t.matches &&
        t.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
      )
        return;

      var pid = numberKeyToPlayerId(e.key);
      if (pid == null) return;

      var show = showFnForActiveScreen();
      if (!show) return;

      e.preventDefault();
      if (panelIsCurrentlyOpen() && getCurrentOpenPlayerId() === pid) {
        closeUnified();
      } else {
        show(pid);
      }
    });
  }

  function numberKeyToPlayerId(k) {
    if (k >= '1' && k <= '9') return parseInt(k, 10);
    if (k === '0') return 10;
    return null;
  }
  function showFnForActiveScreen() {
    var sid = activeScreenId();
    if (sid === 'game-screen' || sid === 'prepare-screen') return app.showPlayerActionsModal;
    if (sid === 'summary-screen') return app.showSummaryPlayerModal;
    return null;
  }

  function registerCloseAction() {
    app.uiActionHandlers = app.uiActionHandlers || {};
    app.uiActionHandlers['unified-player-close'] = closeUnified;
  }

  // ────────────────────────────────────────────────────────────
  // Bootstrap
  // ────────────────────────────────────────────────────────────

  function init() {
    if (!isLg()) return;
    buildUnified();
    // Прицепить unified к первому unified-player-slot СРАЗУ, иначе содержимое
    // (включая #modal-player-prepare-role-section) живёт в detached-дереве и
    // `document.getElementById` его не находит. Это ломает render-функции
    // (showPlayerActionsModal → renderPrepareModalRoleRadios), которые
    // выполняются ДО того, как openForPlayer успеет attach'нуть panel в slot.
    // Слот в закрытом состоянии имеет width:0/opacity:0, так что unified
    // не виден, пока его не раскроют через .is-open (niokit's .k-slot).
    var initSlot = document.querySelector('.unified-player-slot');
    if (initSlot && unified) initSlot.appendChild(unified);
    hideAllOverlays();
    hookModalSetOpen();
    hookNavigateToScreen();
    registerCloseAction();
    bindVisibilityTriggers();
    bindRolePickerAutosave();
    bindPlayerNumberShortcuts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }
})((window.MafiaApp = window.MafiaApp || {}));
