(function () {
  'use strict';

  // =====================================================================
  // Низкоуровневые помощники работы с формой MafiaUniverse.
  // =====================================================================

  var WINNER_MAP = { peaceful: '1', mafia: '2', draw: '3' };

  function setNativeValue(el, value) {
    if (!el) return;
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') {
      desc.set.call(el, value);
    } else {
      el.value = value;
    }
  }
  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function fireChange(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setText(id, value, opts) {
    var el = document.getElementById(id);
    if (!el) return false;
    setNativeValue(el, value == null ? '' : String(value));
    if (!opts || opts.fireInput !== false) fireInput(el);
    if (!opts || opts.fireChange !== false) fireChange(el);
    return true;
  }
  function setHidden(id, value) {
    var el = document.getElementById(id);
    if (!el) return false;
    setNativeValue(el, value == null ? '' : String(value));
    return true;
  }
  function setSelect(id, value) {
    var el = document.getElementById(id);
    if (!el) return false;
    setNativeValue(el, String(value));
    fireChange(el);
    return true;
  }

  function uuidv4() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var i = 0; i < bytes.length; i++) {
      hex.push((bytes[i] + 0x100).toString(16).slice(1));
    }
    return (
      hex.slice(0, 4).join('') + '-' +
      hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' +
      hex.slice(8, 10).join('') + '-' +
      hex.slice(10, 16).join('')
    );
  }

  function findPlayerRow(index) {
    var marker = document.getElementById('GamePlayers_' + index + '__Position');
    return marker ? marker.closest('tr') : null;
  }
  function findPlayerNameInput(index) {
    var row = findPlayerRow(index);
    if (!row) return null;
    var byClass = row.querySelector('.GamePlayers_Player_Name');
    if (byClass) return byClass;
    return row.querySelector('input[id^="PlayerName_' + index + '"]');
  }

  function fillHeader(data, warnings) {
    if (data.dateOfGame) setText('DateOfGame', data.dateOfGame);
    if (data.host) {
      var leading = document.getElementById('Leading_Name');
      if (leading) {
        // НЕ диспатчим input — на Leading_Name тоже висит jQuery autocomplete
        setNativeValue(leading, String(data.host));
        leading.setAttribute('value', String(data.host));
      } else {
        warnings.push('Поле Leading_Name не найдено');
      }
    }
    // hostId — если был привязан в нашем приложении
    if (typeof data.hostId === 'number' && data.hostId > 0) {
      setHidden('LeadingId', String(data.hostId));
    }
    if (data.winner != null) {
      var w = WINNER_MAP[data.winner];
      if (w) setSelect('GameWinnerId', w);
      else warnings.push('Неизвестное значение winner: ' + data.winner);
    }
    if (data.scoreCoefficient) setText('ScoreCoefficient', data.scoreCoefficient);
  }

  function fillPlayer(p, index, warnings) {
    var row = findPlayerRow(index);
    if (!row) {
      warnings.push('Не найдена строка игрока ' + (index + 1));
      return false;
    }

    var nick = p.nick != null ? String(p.nick) : '';
    setHidden('GamePlayers_' + index + '__NickName', nick);
    var nameInput = findPlayerNameInput(index);
    // ВАЖНО: НЕ диспатчим input event — иначе их jQuery autocomplete
    // (minLength:0) разворачивает выпадайку и шлёт XHR на /Players/Search/
    // для всех 10 полей сразу.
    if (nameInput) setNativeValue(nameInput, nick);

    // Если игрок выбран из MU-автокомплита — у нас уже есть его id
    if (typeof p.playerId === 'number' && p.playerId > 0) {
      setHidden('GamePlayers_' + index + '__PlayerId', String(p.playerId));
      if (nameInput) {
        // Подражаем их select-обработчику: привязан → text-black, нет → text-light
        nameInput.classList.remove('text-light');
        nameInput.classList.add('text-black');
        nameInput.setAttribute('value', nick);
      }
    } else {
      setHidden('GamePlayers_' + index + '__PlayerId', '');
      if (nameInput) {
        nameInput.classList.add('text-light');
        nameInput.classList.remove('text-black');
      }
    }

    if (p.roleId != null) {
      setSelect('GamePlayers_' + index + '__GameRoleId', p.roleId);
      row.className = row.className.replace(/role_\d+/g, '').trim() + ' role_' + p.roleId;
    }

    var foulsNum = Number(p.fouls) || 0;
    if (foulsNum < 0) foulsNum = 0;
    if (foulsNum > 5) foulsNum = 5;
    setHidden('GamePlayers_' + index + '__Foul', String(foulsNum));
    // Их UI хранит видимое число фолов в <span class="hasfoul"> рядом с +/−
    var hasFoulSpan = row.querySelector('.hasfoul');
    if (hasFoulSpan) hasFoulSpan.textContent = foulsNum > 0 ? String(foulsNum) : '';

    setHidden(
      'GamePlayers_' + index + '__KilledFirst',
      p.killedFirst ? 'True' : 'False'
    );

    var bmEl = document.getElementById('GamePlayers_' + index + '__BestMove');
    if (bmEl) {
      if (p.bestMove && bmEl.style && bmEl.style.display === 'none') {
        bmEl.style.display = '';
      }
      // НЕ диспатчим input — у них jQuery UI autocomplete на этих полях, он
      // откроет dropdown на каждый input event
      setText('GamePlayers_' + index + '__BestMove', p.bestMove || '', { fireInput: false });
    }

    setText('GamePlayers_' + index + '__BonusScore', p.bonusPlus || '0,00', { fireInput: false });
    setText('GamePlayers_' + index + '__PenaltyScore', p.bonusMinus || '0,00', { fireInput: false });
    setText('GamePlayers_' + index + '__TechPenaltyScore', p.techMinus || '0,00', { fireInput: false });

    return true;
  }

  function votingPreviewRow(entry) {
    var tr = document.createElement('tr');
    tr.className = 'text-center';
    tr.id = entry.VotingId;
    tr.setAttribute('data-mu-importer', '1');
    var td = document.createElement('td');
    var parts = [];
    var vs = entry.VotingStrings || [];
    var pg = entry.PlayersGone || [];
    for (var i = 0; i < vs.length; i++) {
      parts.push('[в' + vs[i].PlayerNumber + '-' + vs[i].VotesCount + ']');
    }
    if (!vs.length && pg.length) {
      // "Подняли" — все указанные игроки ушли
      td.textContent = ' ушли ' + pg.join(',') + ' ';
    } else {
      var suffix = '';
      if (pg.length === 1) suffix = ' ушел ' + pg[0];
      td.textContent = ' ' + parts.join(' ') + suffix + ' ';
    }
    tr.appendChild(td);
    return tr;
  }

  function renderVotingsPreview(processArr) {
    var table = document.getElementById('Votings');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var prev = tbody.querySelectorAll('tr[data-mu-importer="1"]');
    for (var i = 0; i < prev.length; i++) prev[i].remove();
    for (var k = 0; k < processArr.length; k++) {
      tbody.appendChild(votingPreviewRow(processArr[k]));
    }
  }

  function fillVotings(votings, warnings) {
    var proc = document.getElementById('Process');
    if (!proc) {
      warnings.push('Поле Process не найдено');
      return 0;
    }
    if (!Array.isArray(votings) || !votings.length) {
      setHidden('Process', '[]');
      renderVotingsPreview([]);
      return 0;
    }
    var out = [];
    for (var i = 0; i < votings.length; i++) {
      var v = votings[i] || {};
      var cands = Array.isArray(v.candidates) ? v.candidates : [];
      var strings = [];
      for (var j = 0; j < cands.length; j++) {
        var c = cands[j] || {};
        var pn = Number(c.playerNumber);
        if (!isFinite(pn)) continue;
        var votes = c.votesCount;
        if (votes == null) votes = c.votes;
        votes = Number(votes);
        if (!isFinite(votes)) votes = 0;
        strings.push({ PlayerNumber: pn, VotesCount: votes });
      }
      var pg = Array.isArray(v.playersGone)
        ? v.playersGone.map(Number).filter(function (n) { return isFinite(n); })
        : [];
      // "Подняли" в MU = entry с пустым VotingStrings + PlayersGone
      // обычное казнение = VotingStrings + PlayersGone:[id]
      // ничья = VotingStrings без PlayersGone
      if (!strings.length && !pg.length) continue;
      var entry = { VotingId: uuidv4(), VotingStrings: strings };
      if (pg.length) entry.PlayersGone = pg;
      out.push(entry);
    }
    setHidden('Process', JSON.stringify(out));
    renderVotingsPreview(out);
    return out.length;
  }

  // =====================================================================
  // Обратное чтение формы MU в наш JSON-формат (для sync формы → app).
  // =====================================================================

  function getValueById(id) {
    var el = document.getElementById(id);
    return el ? (el.value != null ? el.value : el.getAttribute('value')) : null;
  }

  var WINNER_TO_KEY = { '1': 'peaceful', '2': 'mafia', '3': 'draw' };
  var MU_ROLE_TO_CODE = { '1': 'peaceful', '2': 'sheriff', '3': 'mafia', '4': 'don' };

  function readPlayerRow(index) {
    var nick = getValueById('GamePlayers_' + index + '__NickName') || '';
    var nameInput = findPlayerNameInput(index);
    if ((!nick || !nick.trim()) && nameInput) nick = nameInput.value || '';
    var pidStr = getValueById('GamePlayers_' + index + '__PlayerId');
    var pid = pidStr && /^\d+$/.test(String(pidStr).trim()) ? parseInt(pidStr, 10) : null;
    var roleVal = getValueById('GamePlayers_' + index + '__GameRoleId');
    var roleId = roleVal ? parseInt(roleVal, 10) : 1;
    var foulVal = getValueById('GamePlayers_' + index + '__Foul');
    var fouls = foulVal ? parseInt(foulVal, 10) : 0;
    if (isNaN(fouls) || fouls < 0) fouls = 0;
    var kfVal = getValueById('GamePlayers_' + index + '__KilledFirst');
    var killedFirst = String(kfVal).toLowerCase() === 'true';
    var bestMove = getValueById('GamePlayers_' + index + '__BestMove') || '';
    var bonusPlus = getValueById('GamePlayers_' + index + '__BonusScore') || '0,00';
    var bonusMinus = getValueById('GamePlayers_' + index + '__PenaltyScore') || '0,00';
    var techMinus = getValueById('GamePlayers_' + index + '__TechPenaltyScore') || '0,00';
    return {
      position: index + 1,
      nick: String(nick).trim(),
      playerId: pid,
      roleId: roleId,
      fouls: fouls,
      killedFirst: killedFirst,
      bestMove: bestMove,
      bonusPlus: bonusPlus,
      bonusMinus: bonusMinus,
      techMinus: techMinus,
    };
  }

  function readVotings() {
    var proc = document.getElementById('Process');
    if (!proc || !proc.value) return [];
    try {
      var arr = JSON.parse(proc.value);
      if (!Array.isArray(arr)) return [];
      return arr.map(function (entry) {
        var strings = Array.isArray(entry.VotingStrings) ? entry.VotingStrings : [];
        var pg = Array.isArray(entry.PlayersGone) ? entry.PlayersGone.map(Number).filter(isFinite) : [];
        var obj = {
          candidates: strings.map(function (s) {
            return {
              playerNumber: Number(s.PlayerNumber),
              votesCount: Number(s.VotesCount),
            };
          }),
        };
        if (pg.length) obj.playersGone = pg;
        return obj;
      });
    } catch (e) {
      return [];
    }
  }

  // Признак «в форме что-то есть» — отличаем пустую форму новой игры от
  // открытой сохранённой. Считаем «есть содержимое» если: задан хост, или хотя
  // бы один игрок имеет ник, или есть голосования, или есть GameId.
  function formHasContent(data) {
    if (!data) return false;
    if (getGameId()) return true;
    if (data.host && String(data.host).trim()) return true;
    if (Array.isArray(data.votings) && data.votings.length) return true;
    if (Array.isArray(data.players)) {
      for (var i = 0; i < data.players.length; i++) {
        var p = data.players[i];
        if (p && p.nick && String(p.nick).trim()) return true;
      }
    }
    return false;
  }

  function readFormToMUJson() {
    var winnerVal = getValueById('GameWinnerId');
    var winnerKey = winnerVal ? WINNER_TO_KEY[String(winnerVal)] : null;
    var players = [];
    for (var i = 0; i < 10; i++) {
      players.push(readPlayerRow(i));
    }
    return {
      version: 1,
      source: 'mu-form',
      dateOfGame: getValueById('DateOfGame') || '',
      host: getValueById('Leading_Name') || '',
      hostId: (function () {
        var v = getValueById('LeadingId');
        return v && /^\d+$/.test(String(v).trim()) ? parseInt(v, 10) : null;
      })(),
      winner: winnerKey,
      scoreCoefficient: getValueById('ScoreCoefficient') || '1.0',
      players: players,
      votings: readVotings(),
    };
  }

  function fillForm(data) {
    var warnings = [];
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'JSON не является объектом' };
    }
    fillHeader(data, warnings);

    var players = Array.isArray(data.players) ? data.players : [];
    var filled = 0;
    for (var i = 0; i < Math.min(players.length, 10); i++) {
      if (fillPlayer(players[i], i, warnings)) filled++;
    }
    var votingsCount = 0;
    if (data.votings) {
      votingsCount = fillVotings(data.votings, warnings);
    }
    return {
      ok: true,
      playersFilled: filled,
      votingsWritten: votingsCount,
      warnings: warnings,
    };
  }

  // =====================================================================
  // Прокси к MU-API (jQuery autocomplete у них дёргает /Players/Search/).
  // =====================================================================

  function getTournamentIdFromForm() {
    var form = document.getElementById('gameForm');
    if (!form) return null;
    return form.getAttribute('tournidforplayers') || null;
  }

  function getTournamentTeamIdFromForm() {
    // у нас 10 одинаковых полей; берём первое поле игрока — там лежит tournteamId
    var f = document.querySelector('.GamePlayers_Player_Name');
    return f ? f.getAttribute('tournteamId') : null;
  }

  function getGameId() {
    var idEl = document.getElementById('Id');
    if (idEl) {
      var v = idEl.value || idEl.getAttribute('value');
      return v && v !== '0' ? v : null;
    }
    return null;
  }

  function searchPlayers(term, tournteamId) {
    var body = new URLSearchParams();
    body.set('term', term || '');
    var tid = getTournamentIdFromForm();
    if (tid) body.set('tournamentId', tid);
    if (tournteamId) body.set('tournamentteamid', tournteamId);
    return fetch('/Players/Search/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (items) {
        if (!Array.isArray(items)) return [];
        return items.map(function (it) {
          return {
            label: it.label,
            id: it.id,
            logoId: it.logoId,
            note: it.note,
            avatarUrl: it.logoId
              ? '/Images/GetImage?imageId=' + encodeURIComponent(it.logoId) + '&resizeWith=60'
              : null,
          };
        });
      });
  }

  function getLastTournamentGame() {
    var tid = getTournamentIdFromForm();
    var gid = getGameId();
    if (!tid) return Promise.reject(new Error('tournamentId не найден на странице'));
    var q = new URLSearchParams();
    q.set('tournamentId', tid);
    if (gid) q.set('gameId', gid);
    return fetch('/games/GetLastTournamentGame?' + q.toString(), {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  // =====================================================================
  // Оверлей с iframe нашего приложения.
  // =====================================================================

  var IS_EDIT_PAGE = /\/Games\/Edit(\/|\?|$)/i.test(location.pathname + location.search);

  var overlay = null;
  var iframe = null;
  var iframeReady = false;
  var iframePending = []; // сообщения, накопленные до готовности iframe

  function buildOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'mu-mh-host';

    var bar = document.createElement('div');
    bar.className = 'mu-mh-host__bar';

    var title = document.createElement('div');
    title.className = 'mu-mh-host__title';
    title.textContent = 'Mafia Host UI';
    bar.appendChild(title);

    var spacer = document.createElement('div');
    spacer.className = 'mu-mh-host__spacer';
    bar.appendChild(spacer);

    var showFormBtn = document.createElement('button');
    showFormBtn.type = 'button';
    showFormBtn.className = 'mu-mh-host__btn';
    showFormBtn.textContent = 'Показать форму MU';
    showFormBtn.addEventListener('click', function () {
      // state→form: попросим у iframe текущий MU JSON, зальём в форму, потом спрячем оверлей
      syncStateToFormThenHide();
    });
    bar.appendChild(showFormBtn);

    overlay.appendChild(bar);

    iframe = document.createElement('iframe');
    iframe.className = 'mu-mh-host__frame';
    iframe.src = chrome.runtime.getURL('app/index.html?mu=1');
    iframe.setAttribute('allow', 'clipboard-write; autoplay');
    overlay.appendChild(iframe);

    document.body.appendChild(overlay);

    return overlay;
  }

  function showOverlay() {
    if (!overlay) buildOverlay();
    overlay.classList.remove('mu-mh-host--hidden');
    document.documentElement.style.overflow = 'hidden';
  }

  function hideOverlay() {
    if (overlay) overlay.classList.add('mu-mh-host--hidden');
    document.documentElement.style.overflow = '';
    ensureFloatingReturnButton();
  }

  // Плавающая кнопка, чтобы вернуться к нашему UI после Show form / Apply.
  var floatingBtn = null;
  function ensureFloatingReturnButton() {
    if (floatingBtn) return;
    floatingBtn = document.createElement('button');
    floatingBtn.type = 'button';
    floatingBtn.className = 'mu-mh-host__btn mu-mh-host__btn--primary';
    floatingBtn.textContent = 'Вернуться в Mafia Host';
    floatingBtn.style.position = 'fixed';
    floatingBtn.style.bottom = '16px';
    floatingBtn.style.right = '16px';
    floatingBtn.style.zIndex = '99996';
    floatingBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    floatingBtn.addEventListener('click', function () {
      // form→state: считываем форму, толкаем iframe-у, потом показываем оверлей
      syncFormToStateThenShow();
    });
    document.body.appendChild(floatingBtn);
  }
  function removeFloatingReturnButton() {
    if (floatingBtn && floatingBtn.parentNode) {
      floatingBtn.parentNode.removeChild(floatingBtn);
    }
    floatingBtn = null;
  }

  // Баннер над их формой после Apply.
  var bannerEl = null;
  function showAppliedBanner(result) {
    removeBanner();
    var form = document.getElementById('gameForm');
    if (!form || !form.parentNode) return;

    bannerEl = document.createElement('div');
    bannerEl.className = 'mu-mh-banner';

    var title = document.createElement('div');
    title.className = 'mu-mh-banner__title';
    title.textContent = 'Данные применены';

    var details = document.createElement('div');
    details.className = 'mu-mh-banner__details';
    var w = (result && result.warnings) ? result.warnings.length : 0;
    details.textContent =
      'Игроков: ' + (result.playersFilled || 0) +
      ', голосований: ' + (result.votingsWritten || 0) +
      (w ? ' (предупреждений: ' + w + ')' : '') +
      '. Проверьте поля и нажмите Сохранить.';

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'mu-mh-banner__btn';
    dismissBtn.textContent = 'Скрыть';
    dismissBtn.addEventListener('click', removeBanner);

    bannerEl.appendChild(title);
    bannerEl.appendChild(details);
    bannerEl.appendChild(dismissBtn);

    form.parentNode.insertBefore(bannerEl, form);
  }
  function removeBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  // =====================================================================
  // postMessage-протокол с iframe.
  // =====================================================================

  var EXT_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');

  function sendToIframe(msg) {
    if (!iframe || !iframe.contentWindow) {
      iframePending.push(msg);
      return;
    }
    if (!iframeReady) {
      iframePending.push(msg);
      return;
    }
    iframe.contentWindow.postMessage(msg, EXT_ORIGIN);
  }

  function flushIframePending() {
    if (!iframeReady || !iframe || !iframe.contentWindow) return;
    while (iframePending.length) {
      iframe.contentWindow.postMessage(iframePending.shift(), EXT_ORIGIN);
    }
  }

  function reply(requestId, type, payload) {
    sendToIframe(Object.assign({ type: type, requestId: requestId }, payload || {}));
  }

  // Исходящие запросы content → iframe (с requestId, ждём ответа).
  var contentReqSeq = 1;
  var contentPending = Object.create(null);
  function requestIframe(type, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var rid = 'c-' + contentReqSeq++;
      var to = setTimeout(function () {
        if (contentPending[rid]) {
          delete contentPending[rid];
          reject(new Error('Таймаут ответа iframe (' + type + ')'));
        }
      }, timeoutMs || 5000);
      contentPending[rid] = function (msg) {
        clearTimeout(to);
        if (msg && msg.ok === false) reject(new Error(msg.error || ('Ошибка ' + type)));
        else resolve(msg);
      };
      sendToIframe(Object.assign({ type: type, requestId: rid }, payload || {}));
    });
  }

  // Двунаправленный sync на переключение интерфейса.
  function syncStateToFormThenHide() {
    requestIframe('mu/get-current-state')
      .then(function (msg) {
        if (msg && msg.data) {
          try { fillForm(msg.data); } catch (e) { console.warn('[MU] state→form fillForm:', e); }
        }
      })
      .catch(function (err) {
        // Если iframe не ответил — всё равно прячем оверлей, чтобы юзер мог работать
        console.warn('[MU] state→form sync failed:', err && err.message);
      })
      .then(function () { hideOverlay(); });
  }

  function syncFormToStateThenShow() {
    var formData = null;
    try { formData = readFormToMUJson(); } catch (e) { console.warn('[MU] readForm:', e); }
    removeBanner();
    if (formData) {
      sendToIframe({ type: 'mu/apply-state', data: formData });
    }
    showOverlay();
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== EXT_ORIGIN) return;
    if (!event.data || typeof event.data !== 'object') return;
    var msg = event.data;
    var type = msg.type;
    var rid = msg.requestId;

    if (type === 'mu/ready') {
      iframeReady = true;
      flushIframePending();
      sendToIframe({
        type: 'mu/context',
        tournamentId: getTournamentIdFromForm(),
        gameId: getGameId(),
        tournteamId: getTournamentTeamIdFromForm(),
      });
      // если форма уже содержит данные (открыта сохранённая игра) — заливаем их
      // в iframe, чтобы user видел существующее состояние, а не пустой UI
      try {
        var formData = readFormToMUJson();
        if (formHasContent(formData)) {
          sendToIframe({ type: 'mu/apply-state', data: formData });
        }
      } catch (e) {
        console.warn('[MU] initial form→state push failed:', e);
      }
      return;
    }

    if (type === 'mu/searchPlayers') {
      searchPlayers(msg.term, msg.tournteamId || getTournamentTeamIdFromForm())
        .then(function (items) {
          reply(rid, 'mu/searchPlayersResult', { ok: true, items: items });
        })
        .catch(function (err) {
          reply(rid, 'mu/searchPlayersResult', { ok: false, error: String(err && err.message || err) });
        });
      return;
    }

    if (type === 'mu/getLastGamePlayers') {
      getLastTournamentGame()
        .then(function (data) {
          reply(rid, 'mu/getLastGamePlayersResult', { ok: true, data: data });
        })
        .catch(function (err) {
          reply(rid, 'mu/getLastGamePlayersResult', { ok: false, error: String(err && err.message || err) });
        });
      return;
    }

    if (type === 'mu/apply') {
      var result;
      try {
        result = fillForm(msg.data);
      } catch (e) {
        result = { ok: false, error: String(e && e.message || e) };
      }
      reply(rid, 'mu/applyResult', result);
      if (result && result.ok) {
        hideOverlay();
        showAppliedBanner(result);
      }
      return;
    }

    if (type === 'mu/showOriginal') {
      hideOverlay();
      reply(rid, 'mu/showOriginalResult', { ok: true });
      return;
    }

    // Ответы iframe на наши (content→iframe) запросы.
    if (rid && contentPending[rid]) {
      var cb = contentPending[rid];
      delete contentPending[rid];
      cb(msg);
    }
  });

  // =====================================================================
  // Старый popup-flow (textarea + Fill). Сохраняем для отладки/fallback.
  // =====================================================================

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.type !== 'fill-mu-form') return false;
    try {
      var result = fillForm(msg.data);
      sendResponse(result);
      if (result && result.ok) {
        hideOverlay();
        showAppliedBanner(result);
      }
    } catch (err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    }
    return false;
  });

  // =====================================================================
  // Bootstrap.
  // =====================================================================

  if (IS_EDIT_PAGE) {
    // Дождёмся, пока DOM формы точно есть (run_at: document_idle обычно достаточно).
    if (document.getElementById('gameForm')) {
      showOverlay();
    } else {
      var tries = 0;
      var poll = setInterval(function () {
        tries++;
        if (document.getElementById('gameForm')) {
          clearInterval(poll);
          showOverlay();
        } else if (tries > 40) {
          clearInterval(poll);
        }
      }, 100);
    }
  }
})();
