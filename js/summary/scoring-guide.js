(function (app) {
  'use strict';

  app.syncScoringUi = function () {
    var profile = app.getScoringProfile();
    var label = document.getElementById('summary-scoring-label');
    if (label)
      label.textContent = profile.label + ' · шаг ' + app.formatBonusForDisplay(profile.bonusStep);
    var buttons = document.querySelectorAll('[data-action="summary-bonus-delta"]');
    for (var i = 0; i < buttons.length; i++) {
      var direction = Number(buttons[i].getAttribute('data-direction'));
      buttons[i].textContent =
        (direction > 0 ? '+' : '−') + app.formatBonusForDisplay(profile.bonusStep);
    }
    var hint = document.getElementById('summary-bonus-step-hint');
    if (hint)
      hint.textContent =
        profile.label +
        ': шаг ' +
        app.formatBonusForDisplay(profile.bonusStep) +
        '. Победа учитывается отдельно.';
    ['modal-summary-protocol-section', 'modal-player-protocol-section'].forEach(function (id) {
      var section = document.getElementById(id);
      if (section) section.style.display = profile.protocol ? 'flex' : 'none';
    });
  };

  app.renderScoringGuide = function () {
    var container = document.getElementById('scoring-guide-content');
    if (!container) return;
    var profile = app.getScoringProfile();
    container.replaceChildren();
    var edition = document.createElement('p');
    edition.className = 'text-xs text-mafia-cream/60';
    edition.textContent = profile.label + ' · редакция ' + profile.edition;
    container.appendChild(edition);
    profile.sections.forEach(function (entry) {
      var section = document.createElement('section');
      var title = document.createElement('h3');
      title.className = 'font-display text-mafia-gold text-lg';
      title.textContent = entry.title;
      section.appendChild(title);
      if (entry.text) {
        var text = document.createElement('p');
        text.className = 'mt-2 text-sm leading-relaxed text-mafia-cream/85';
        text.textContent = entry.text;
        section.appendChild(text);
      }
      if (entry.rows) {
        var table = document.createElement('table');
        table.className = 'mt-3 w-full text-left text-sm leading-relaxed text-mafia-cream/85';
        table.setAttribute('aria-label', entry.title);
        var body = document.createElement('tbody');
        entry.rows.forEach(function (row) {
          var tr = document.createElement('tr');
          tr.className = 'border-b border-mafia-gold/20';
          var label = document.createElement('th');
          label.scope = 'row';
          label.className = 'py-2 pr-3 align-top font-normal';
          label.textContent = row[0];
          var value = document.createElement('td');
          value.className = 'py-2 align-top text-mafia-gold';
          value.textContent = row[1];
          tr.append(label, value);
          body.appendChild(tr);
        });
        table.appendChild(body);
        section.appendChild(table);
      }
      if (entry.items) {
        var list = document.createElement('ul');
        list.className =
          'mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-mafia-cream/85';
        entry.items.forEach(function (item) {
          var li = document.createElement('li');
          li.textContent = item;
          list.appendChild(li);
        });
        section.appendChild(list);
      }
      container.appendChild(section);
    });
    var note = document.createElement('p');
    note.className = 'text-xs leading-relaxed text-mafia-cream/60';
    note.textContent =
      'В поле «Доп. баллы» вносите итоговую ручную оценку с учётом нужных начислений и штрафов. ЛХ и компенсация автоматически не прибавляются. Решение и основание удобно записать в примечание.';
    container.appendChild(note);
    [
      { url: profile.rulesUrl, label: 'Полные правила ' + profile.label },
      { url: profile.amendmentsUrl, label: 'Изменения с 24.09.2026' },
    ].forEach(function (source) {
      if (!source.url) return;
      var link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'block text-sm text-mafia-gold underline underline-offset-4';
      link.textContent = source.label;
      container.appendChild(link);
    });
  };

  app.uiActionHandlers = app.uiActionHandlers || {};
  app.uiActionHandlers['scoring-guide-open'] = function () {
    app.renderScoringGuide();
    app.modalSetOpen(document.getElementById('modal-scoring-guide'), true);
  };
  app.uiActionHandlers['scoring-guide-close'] = function () {
    app.modalSetOpen(document.getElementById('modal-scoring-guide'), false);
  };
})(window.MafiaApp);
