(function () {
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
    fireInput(el);
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

  function setByClassNthInRow(row, className, value, hidden) {
    var el = row.querySelector('.' + className);
    if (!el) return false;
    setNativeValue(el, value == null ? '' : String(value));
    if (!hidden) {
      fireInput(el);
      fireChange(el);
    }
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
      hex.slice(0, 4).join('') +
      '-' +
      hex.slice(4, 6).join('') +
      '-' +
      hex.slice(6, 8).join('') +
      '-' +
      hex.slice(8, 10).join('') +
      '-' +
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
        setNativeValue(leading, String(data.host));
        fireInput(leading);
      } else {
        warnings.push('Поле Leading_Name не найдено');
      }
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
    if (nameInput) {
      setNativeValue(nameInput, nick);
      fireInput(nameInput);
    }

    setHidden('GamePlayers_' + index + '__PlayerId', '');

    if (p.roleId != null) {
      setSelect('GamePlayers_' + index + '__GameRoleId', p.roleId);
      row.className = row.className.replace(/role_\d+/g, '').trim() + ' role_' + p.roleId;
    }

    var foulsNum = Number(p.fouls) || 0;
    if (foulsNum < 0) foulsNum = 0;
    if (foulsNum > 5) foulsNum = 5;
    setHidden('GamePlayers_' + index + '__Foul', String(foulsNum));

    setHidden(
      'GamePlayers_' + index + '__KilledFirst',
      p.killedFirst ? 'True' : 'False'
    );

    var bmEl = document.getElementById('GamePlayers_' + index + '__BestMove');
    if (bmEl) {
      if (p.bestMove && bmEl.style && bmEl.style.display === 'none') {
        bmEl.style.display = '';
      }
      setText('GamePlayers_' + index + '__BestMove', p.bestMove || '');
    }

    setText('GamePlayers_' + index + '__BonusScore', p.bonusPlus || '0,00');
    setText('GamePlayers_' + index + '__PenaltyScore', p.bonusMinus || '0,00');
    setText('GamePlayers_' + index + '__TechPenaltyScore', p.techMinus || '0,00');

    return true;
  }

  function votingPreviewRow(entry) {
    var tr = document.createElement('tr');
    tr.className = 'text-center';
    tr.id = entry.VotingId;
    tr.setAttribute('data-mu-importer', '1');
    var td = document.createElement('td');
    var parts = [];
    for (var i = 0; i < entry.VotingStrings.length; i++) {
      var s = entry.VotingStrings[i];
      parts.push('[в' + s.PlayerNumber + '-' + s.VotesCount + ']');
    }
    td.textContent = ' ' + parts.join(' ') + ' ';
    tr.appendChild(td);
    return tr;
  }

  function renderVotingsPreview(processArr) {
    var table = document.getElementById('Votings');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    // удаляем только то, что мы сами добавили ранее, чужие строки не трогаем
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
      if (!strings.length) continue;
      out.push({ VotingId: uuidv4(), VotingStrings: strings });
    }
    setHidden('Process', JSON.stringify(out));
    renderVotingsPreview(out);
    return out.length;
  }

  function handleFill(data, sendResponse) {
    var warnings = [];
    try {
      if (!data || typeof data !== 'object') {
        sendResponse({ ok: false, error: 'JSON не является объектом' });
        return;
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

      sendResponse({
        ok: true,
        playersFilled: filled,
        votingsWritten: votingsCount,
        warnings: warnings,
      });
    } catch (err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.type !== 'fill-mu-form') return false;
    handleFill(msg.data, sendResponse);
    return true;
  });
})();
