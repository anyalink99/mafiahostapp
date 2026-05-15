(function (app) {
  // Цвет лица карты. «Без роли» (донская до назначения мафии) — нейтральный серый.
  function cardFrontBgClass(role) {
    if (role === 'Мафия' || role === 'Дон') return 'bg-mafia-black';
    if (role === (app.DONSKAYA_BLANK_ROLE || 'Без роли')) return 'bg-mafia-border';
    return 'bg-mafia-blood';
  }

  app.getRoleIconId = function (role) {
    if (role === 'Мирный') return 'icon-peaceful';
    if (role === 'Мафия') return 'icon-mafia';
    if (role === 'Дон') return 'icon-don';
    if (role === 'Шериф') return 'icon-sheriff';
    if (role === 'Мерлин') return 'icon-merlin';
    return null;
  };

  app.renderRoleIcon = function (iconId, sizeClass) {
    if (!iconId) return '';
    var cls = 'role-icon' + (sizeClass ? ' ' + sizeClass : '');
    return '<svg class="' + cls + '" aria-hidden="true"><use href="#' + iconId + '"/></svg>';
  };

  app.initCards = function (noShuffle) {
    const container = document.getElementById('card-container');
    if (!container) return;
    container.innerHTML = '';
    if (!noShuffle) {
      app.roles = [...app.roles].sort(() => Math.random() - 0.5);
      app.revealedIndices = [];
    }
    const total = app.getAvailableCount();
    for (let i = 0; i < app.roles.length; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'card-wrap';
      wrap.setAttribute('data-role-index', String(i));
      const inner = document.createElement('div');
      inner.className = 'card-inner';
      const card = document.createElement('div');
      card.className =
        'card-flip w-full h-full rounded overflow-hidden border border-mafia-gold/50 bg-mafia-card cursor-pointer transition-all duration-200 hover:border-mafia-gold active:scale-[0.98]';
      card.id = 'card-' + i;
      card.style.position = 'relative';

      const back = document.createElement('div');
      back.className =
        'card-back absolute inset-0 flex flex-col items-center justify-center bg-mafia-coal border border-mafia-border rounded';
      back.innerHTML =
        '<span class="back-num text-mafia-gold/50 font-display text-3xl sm:text-4xl font-semibold">1</span>' +
        '<span class="text-mafia-gold/30 font-display text-6xl sm:text-7xl">♠</span>';

      const front = document.createElement('div');
      front.className = 'card-front absolute inset-0 flex flex-col items-center justify-center rounded text-center p-1';
      const role = app.roles[i];
      front.classList.add(cardFrontBgClass(role));
      const iconId = app.getRoleIconId(role);
      const iconHtml = iconId ? app.renderRoleIcon(iconId, 'role-icon--small') : '';
      front.innerHTML =
        '<span class="front-num text-mafia-gold/70 text-2xl sm:text-3xl font-display font-semibold mb-1">1 игрок</span>' +
        (iconHtml ? '<span class="mb-1 text-mafia-gold">' + iconHtml + '</span>' : '') +
        '<span class="font-display font-bold text-base sm:text-lg md:text-xl text-mafia-gold leading-tight">' +
        role +
        '</span>';

      card.appendChild(back);
      card.appendChild(front);
      inner.appendChild(card);
      wrap.appendChild(inner);
      container.appendChild(wrap);
      if (app.revealedIndices.indexOf(i) !== -1) card.classList.add('revealed');
    }
    if (app.revealedIndices.length > 0) app.sortCardsByRevealOrder();
    app.updateCardNumbers();
    app.saveState();
  };

  app.updateCardNumbers = function () {
    const container = document.getElementById('card-container');
    if (!container) return;
    const wraps = Array.from(container.children);
    let backPosition = 0;
    wraps.forEach(function (wrap) {
      const roleIndex = parseInt(wrap.getAttribute('data-role-index'), 10);
      if (isNaN(roleIndex)) return;
      const card = wrap.querySelector('.card-flip');
      if (!card) return;
      const back = card.querySelector('.card-back');
      const front = card.querySelector('.card-front');
      const isRevealed = card.classList.contains('revealed');

      if (back) {
        const backNumEl = back.querySelector('.back-num');
        if (backNumEl) {
          if (isRevealed) backNumEl.textContent = '';
          else {
            backPosition++;
            backNumEl.textContent = backPosition;
          }
        }
      }
      if (front) {
        const frontNumEl = front.querySelector('.front-num');
        if (frontNumEl && isRevealed) {
          const revealOrder = app.revealedIndices.indexOf(roleIndex) + 1;
          frontNumEl.textContent = revealOrder + ' игрок';
        }
      }
    });
  };

  app.sortCardsByRevealOrder = function () {
    const container = document.getElementById('card-container');
    if (!container || app.revealedIndices.length === 0) return;
    const wraps = Array.from(container.children);
    const byRoleIndex = {};
    wraps.forEach(function (w) {
      const idx = parseInt(w.getAttribute('data-role-index'), 10);
      if (!isNaN(idx)) byRoleIndex[idx] = w;
    });
    app.revealedIndices.forEach(function (roleIndex) {
      if (byRoleIndex[roleIndex]) container.appendChild(byRoleIndex[roleIndex]);
    });
  };

  app.showRole = function (index) {
    const card = document.getElementById('card-' + index);
    if (!card) return;

    const wasRevealed = card.classList.contains('revealed');
    if (!wasRevealed) {
      card.classList.add('revealed');
      if (app.revealedIndices.indexOf(index) === -1) app.revealedIndices.push(index);
      app.updateCardNumbers();
      app.saveState();
    }

    const role = app.roles[index];
    const screen = document.getElementById('role-screen');
    const roleName = document.getElementById('role-name');
    const hint = document.getElementById('close-hint');
    const bg = document.getElementById('role-bg');
    if (!roleName || !bg) return;

    roleName.innerText = role;
    bg.className = 'absolute inset-0 ' + cardFrontBgClass(role);
    var iconWrap = document.getElementById('role-icon-wrap');
    if (iconWrap) {
      var iconId = app.getRoleIconId(role);
      iconWrap.innerHTML = iconId ? app.renderRoleIcon(iconId, 'role-icon--large') : '';
      iconWrap.classList.toggle('hidden', !iconId);
    }
    screen.classList.add('active');
    app.canCloseRole = false;
    if (hint) hint.style.display = 'none';

    setTimeout(function () {
      app.canCloseRole = true;
    }, 100);
  };

  app.closeRole = function () {
    if (!app.canCloseRole) return;
    const roleScreen = document.getElementById('role-screen');
    roleScreen.classList.remove('active');

    const revealed = document.querySelectorAll('.card-flip.revealed').length;
    if (revealed >= app.getAvailableCount()) {
      app.sortCardsByRevealOrder();
      app.updateCardNumbers();
    }
  };
})(window.MafiaApp);
