// Низкоуровневый IO для формы /Games/Edit на mafiauniverse.org:
//   • fill*  — заливают MU JSON (формат mu-export.js) в скрытые поля формы
//   • read*  — собирают тот же JSON из текущей формы
//   • MU API: searchPlayers, getLastTournamentGame
// Не знает ни про оверлей, ни про postMessage, ни про iframe — только DOM.
// Экспортирует API в window.MuFormIO для использования из content.js.

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // Карты значений
  // ────────────────────────────────────────────────────────────

  // peaceful|mafia|draw → значение GameWinnerId
  var WINNER_TO_ID = { peaceful: '1', mafia: '2', draw: '3' };
  // значение GameWinnerId → ключ winner
  var ID_TO_WINNER = { '1': 'peaceful', '2': 'mafia', '3': 'draw' };
  // значение GameRoleId → внутренний код роли (для справки; в этом файле не используется)
  // var ROLE_ID_TO_CODE = { '1': 'peaceful', '2': 'sheriff', '3': 'mafia', '4': 'don' };

  // ────────────────────────────────────────────────────────────
  // Низкоуровневые DOM-сеттеры
  // ────────────────────────────────────────────────────────────

  // React-/Vue-safe выставление .value (через native прототипный сеттер).
  // Для MU (jQuery) этого не нужно, но и не вредит.
  function setNativeValue(el, value) {
    if (!el) return;
    var proto = Object.getPrototypeOf(el);
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && typeof desc.set === 'function') desc.set.call(el, value);
    else el.value = value;
  }
  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function fireChange(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Установить значение видимого text/textarea-поля. По умолчанию диспатчит
  // input+change. opts.fireInput=false — не диспатчить input (нужно для полей
  // с jQuery UI autocomplete: они откроют dropdown на каждый input event).
  function setText(id, value, opts) {
    var el = document.getElementById(id);
    if (!el) return false;
    setNativeValue(el, value == null ? '' : String(value));
    if (!opts || opts.fireInput !== false) fireInput(el);
    if (!opts || opts.fireChange !== false) fireChange(el);
    return true;
  }
  // Установить значение hidden-поля — без событий (нет потребителей).
  function setHidden(id, value) {
    var el = document.getElementById(id);
    if (!el) return false;
    setNativeValue(el, value == null ? '' : String(value));
    return true;
  }
  // Установить значение <select>. Диспатчит change (нужно для подсветки и
  // validation-listeners).
  function setSelect(id, value) {
    var el = document.getElementById(id);
    if (!el) return false;
    setNativeValue(el, String(value));
    fireChange(el);
    return true;
  }
  function getValueById(id) {
    var el = document.getElementById(id);
    return el ? (el.value != null ? el.value : el.getAttribute('value')) : null;
  }

  // ────────────────────────────────────────────────────────────
  // Утилиты
  // ────────────────────────────────────────────────────────────

  function uuidv4() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var i = 0; i < bytes.length; i++) hex.push((bytes[i] + 0x100).toString(16).slice(1));
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
    // У них id формата "PlayerName_<i> " (с висящим пробелом) — отлавливаем через ^=.
    return row.querySelector('input[id^="PlayerName_' + index + '"]');
  }

  // ID игрока в форме именуется как GamePlayers_<i>__<Field> — собираем имя.
  function playerFieldId(index, field) {
    return 'GamePlayers_' + index + '__' + field;
  }

  // ────────────────────────────────────────────────────────────
  // Контекст формы (читается со страницы)
  // ────────────────────────────────────────────────────────────

  function getTournamentIdFromForm() {
    var form = document.getElementById('gameForm');
    return form ? form.getAttribute('tournidforplayers') : null;
  }
  function getTournamentTeamIdFromForm() {
    var f = document.querySelector('.GamePlayers_Player_Name');
    return f ? f.getAttribute('tournteamId') : null;
  }
  function getGameId() {
    var idEl = document.getElementById('Id');
    if (!idEl) return null;
    var v = idEl.value || idEl.getAttribute('value');
    return v && v !== '0' ? v : null;
  }

  // ────────────────────────────────────────────────────────────
  // Запись формы: header + игроки + голосования
  // ────────────────────────────────────────────────────────────

  function fillHeader(data, warnings) {
    if (data.dateOfGame) setText('DateOfGame', data.dateOfGame);
    if (data.host) {
      var leading = document.getElementById('Leading_Name');
      if (leading) {
        // НЕ диспатчим input — на Leading_Name висит jQuery autocomplete.
        setNativeValue(leading, String(data.host));
        leading.setAttribute('value', String(data.host));
      } else {
        warnings.push('Поле Leading_Name не найдено');
      }
    }
    if (typeof data.hostId === 'number' && data.hostId > 0) {
      setHidden('LeadingId', String(data.hostId));
    }
    if (data.winner != null) {
      var w = WINNER_TO_ID[data.winner];
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
    setHidden(playerFieldId(index, 'NickName'), nick);
    var nameInput = findPlayerNameInput(index);
    // НЕ диспатчим input — иначе jQuery autocomplete (minLength:0) откроет
    // dropdown и шлёт XHR на /Players/Search/ для всех 10 полей сразу.
    if (nameInput) setNativeValue(nameInput, nick);

    // Если игрок выбран из MU-автокомплита — у нас уже есть PlayerId.
    if (typeof p.playerId === 'number' && p.playerId > 0) {
      setHidden(playerFieldId(index, 'PlayerId'), String(p.playerId));
      if (nameInput) {
        // Подражаем их select-обработчику: привязан → text-black.
        nameInput.classList.remove('text-light');
        nameInput.classList.add('text-black');
        nameInput.setAttribute('value', nick);
      }
    } else {
      setHidden(playerFieldId(index, 'PlayerId'), '');
      if (nameInput) {
        nameInput.classList.add('text-light');
        nameInput.classList.remove('text-black');
      }
    }

    if (p.roleId != null) {
      setSelect(playerFieldId(index, 'GameRoleId'), p.roleId);
      row.className = row.className.replace(/role_\d+/g, '').trim() + ' role_' + p.roleId;
    }

    var foulsNum = clampFouls(p.fouls);
    setHidden(playerFieldId(index, 'Foul'), String(foulsNum));
    // Их UI хранит видимое число фолов в <span class="hasfoul"> рядом с +/−.
    var hasFoulSpan = row.querySelector('.hasfoul');
    if (hasFoulSpan) hasFoulSpan.textContent = foulsNum > 0 ? String(foulsNum) : '';

    setHidden(playerFieldId(index, 'KilledFirst'), p.killedFirst ? 'True' : 'False');

    var bmEl = document.getElementById(playerFieldId(index, 'BestMove'));
    if (bmEl) {
      if (p.bestMove && bmEl.style && bmEl.style.display === 'none') bmEl.style.display = '';
      // НЕ диспатчим input — у них jQuery UI autocomplete на этих полях.
      setText(playerFieldId(index, 'BestMove'), p.bestMove || '', { fireInput: false });
    }

    setText(playerFieldId(index, 'BonusScore'), p.bonusPlus || '0,00', { fireInput: false });
    setText(playerFieldId(index, 'PenaltyScore'), p.bonusMinus || '0,00', { fireInput: false });
    setText(playerFieldId(index, 'TechPenaltyScore'), p.techMinus || '0,00', { fireInput: false });

    return true;
  }
  function clampFouls(raw) {
    var n = Number(raw) || 0;
    if (n < 0) return 0;
    if (n > 5) return 5;
    return n;
  }

  // Запись голосований в hidden #Process + рендер превью внизу страницы.
  function votingPreviewRow(entry) {
    var tr = document.createElement('tr');
    tr.className = 'text-center';
    tr.id = entry.VotingId;
    tr.setAttribute('data-mu-importer', '1');
    var td = document.createElement('td');
    var vs = entry.VotingStrings || [];
    var pg = entry.PlayersGone || [];
    if (!vs.length && pg.length) {
      // "Подняли" — все указанные игроки ушли
      td.textContent = ' ушли ' + pg.join(',') + ' ';
    } else {
      var parts = [];
      for (var i = 0; i < vs.length; i++) {
        parts.push('[в' + vs[i].PlayerNumber + '-' + vs[i].VotesCount + ']');
      }
      var suffix = pg.length === 1 ? ' ушел ' + pg[0] : '';
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
      // "Подняли"     = empty VotingStrings + PlayersGone
      // казнение      = VotingStrings + PlayersGone:[id]
      // ничья         = VotingStrings без PlayersGone
      if (!strings.length && !pg.length) continue;
      var entry = { VotingId: uuidv4(), VotingStrings: strings };
      if (pg.length) entry.PlayersGone = pg;
      out.push(entry);
    }
    setHidden('Process', JSON.stringify(out));
    renderVotingsPreview(out);
    return out.length;
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
    if (data.votings) votingsCount = fillVotings(data.votings, warnings);
    return {
      ok: true,
      playersFilled: filled,
      votingsWritten: votingsCount,
      warnings: warnings,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Чтение формы → MU JSON
  // ────────────────────────────────────────────────────────────

  function readPlayerRow(index) {
    var nick = getValueById(playerFieldId(index, 'NickName')) || '';
    var nameInput = findPlayerNameInput(index);
    if ((!nick || !nick.trim()) && nameInput) nick = nameInput.value || '';
    var pidStr = getValueById(playerFieldId(index, 'PlayerId'));
    var pid = pidStr && /^\d+$/.test(String(pidStr).trim()) ? parseInt(pidStr, 10) : null;
    var roleVal = getValueById(playerFieldId(index, 'GameRoleId'));
    var roleId = roleVal ? parseInt(roleVal, 10) : 1;
    var foulVal = getValueById(playerFieldId(index, 'Foul'));
    var fouls = foulVal ? parseInt(foulVal, 10) : 0;
    if (isNaN(fouls) || fouls < 0) fouls = 0;
    var kfVal = getValueById(playerFieldId(index, 'KilledFirst'));
    return {
      position: index + 1,
      nick: String(nick).trim(),
      playerId: pid,
      roleId: roleId,
      fouls: fouls,
      killedFirst: String(kfVal).toLowerCase() === 'true',
      bestMove: getValueById(playerFieldId(index, 'BestMove')) || '',
      bonusPlus: getValueById(playerFieldId(index, 'BonusScore')) || '0,00',
      bonusMinus: getValueById(playerFieldId(index, 'PenaltyScore')) || '0,00',
      techMinus: getValueById(playerFieldId(index, 'TechPenaltyScore')) || '0,00',
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
            return { playerNumber: Number(s.PlayerNumber), votesCount: Number(s.VotesCount) };
          }),
        };
        if (pg.length) obj.playersGone = pg;
        return obj;
      });
    } catch (e) {
      return [];
    }
  }

  function readFormToMUJson() {
    var winnerVal = getValueById('GameWinnerId');
    var players = [];
    for (var i = 0; i < 10; i++) players.push(readPlayerRow(i));
    var hostIdStr = getValueById('LeadingId');
    var hostId = hostIdStr && /^\d+$/.test(String(hostIdStr).trim()) ? parseInt(hostIdStr, 10) : null;
    return {
      version: 1,
      source: 'mu-form',
      dateOfGame: getValueById('DateOfGame') || '',
      host: getValueById('Leading_Name') || '',
      hostId: hostId,
      winner: winnerVal ? (ID_TO_WINNER[String(winnerVal)] || null) : null,
      scoreCoefficient: getValueById('ScoreCoefficient') || '1.0',
      players: players,
      votings: readVotings(),
    };
  }

  // «В форме что-то есть» — отличаем пустую форму новой игры от открытой
  // сохранённой (когда нужно подтянуть данные в iframe на старте).
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

  // ────────────────────────────────────────────────────────────
  // MU API (через cookies сессии — fetch к их endpoints)
  // ────────────────────────────────────────────────────────────

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
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ────────────────────────────────────────────────────────────
  // Экспорт
  // ────────────────────────────────────────────────────────────

  window.MuFormIO = {
    fillForm: fillForm,
    readFormToMUJson: readFormToMUJson,
    formHasContent: formHasContent,
    searchPlayers: searchPlayers,
    getLastTournamentGame: getLastTournamentGame,
    getTournamentIdFromForm: getTournamentIdFromForm,
    getTournamentTeamIdFromForm: getTournamentTeamIdFromForm,
    getGameId: getGameId,
  };
})();
