(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };
  var statusEl = $('status');
  var jsonInput = $('json-input');
  var fillBtn = $('fill-btn');
  var pasteBtn = $('paste-btn');
  var reskinToggle = $('reskin-toggle');

  // Чекбокс reskin'а: читаем из storage (дефолт true), пишем при изменении.
  // mu-reskin.js на всех вкладках MU подхватит chrome.storage.onChanged
  // и снимет/наложит <style> без перезагрузки страницы.
  if (reskinToggle && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['reskinEnabled'], function (items) {
      reskinToggle.checked = items && items.reskinEnabled === false ? false : true;
    });
    reskinToggle.addEventListener('change', function () {
      chrome.storage.local.set({ reskinEnabled: !!reskinToggle.checked });
    });
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'status ' + (kind || 'info');
  }

  function getActiveTab() {
    return new Promise(function (resolve, reject) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!tabs || !tabs.length) return reject(new Error('No active tab'));
        resolve(tabs[0]);
      });
    });
  }

  function isMUEditUrl(url) {
    if (!url) return false;
    return /^https?:\/\/mafiauniverse\.org\/Games\/Edit\b/i.test(url);
  }

  function sendFill(tabId, data) {
    return new Promise(function (resolve, reject) {
      chrome.tabs.sendMessage(tabId, { type: 'fill-mu-form', data: data }, function (response) {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        resolve(response);
      });
    });
  }

  pasteBtn.addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      setStatus('Браузер не поддерживает чтение буфера. Вставьте вручную (Ctrl+V).', 'err');
      return;
    }
    navigator.clipboard
      .readText()
      .then(function (txt) {
        if (!txt) {
          setStatus('Буфер пуст.', 'err');
          return;
        }
        jsonInput.value = txt;
        setStatus('Из буфера вставлено ' + txt.length + ' символов.', 'info');
      })
      .catch(function (err) {
        setStatus('Не удалось прочитать буфер: ' + (err && err.message ? err.message : err), 'err');
      });
  });

  fillBtn.addEventListener('click', function () {
    var raw = jsonInput.value.trim();
    if (!raw) {
      setStatus('Сначала вставьте JSON.', 'err');
      return;
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setStatus('Невалидный JSON: ' + e.message, 'err');
      return;
    }

    setStatus('Заполняю форму...', 'info');

    getActiveTab()
      .then(function (tab) {
        if (!isMUEditUrl(tab.url)) {
          throw new Error(
            'Активная вкладка не на странице mafiauniverse.org/Games/Edit.\nОткройте нужную страницу и попробуйте снова.'
          );
        }
        return sendFill(tab.id, parsed);
      })
      .then(function (response) {
        if (!response) {
          setStatus(
            'Контент-скрипт не ответил. Перезагрузите страницу /Games/Edit и попробуйте снова.',
            'err'
          );
          return;
        }
        if (response.ok) {
          var lines = [
            'Заполнено.',
            'Игроков: ' + response.playersFilled,
            'Голосований: ' + response.votingsWritten,
          ];
          if (response.warnings && response.warnings.length) {
            lines.push('');
            lines.push('Предупреждения:');
            for (var i = 0; i < response.warnings.length; i++) {
              lines.push('• ' + response.warnings[i]);
            }
          }
          setStatus(lines.join('\n'), 'ok');
        } else {
          setStatus('Ошибка: ' + (response.error || 'неизвестная'), 'err');
        }
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : String(err), 'err');
      });
  });
})();
