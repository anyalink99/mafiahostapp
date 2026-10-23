'use strict';

var assert = require('assert');
var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var chromium = require('playwright-core').chromium;
var root = path.resolve(__dirname, '..');
var server = http.createServer(function (req, res) {
  var name = path.resolve(
    root,
    '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0])
  );
  if (!name.startsWith(root + path.sep) || !fs.existsSync(name) || !fs.statSync(name).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  var types = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
  };
  res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
  fs.createReadStream(name).pipe(res);
});

async function exercise(browser, base, width) {
  var desktop = width >= 1024;
  var context = await browser.newContext({
    viewport: { width: width, height: 950 },
    serviceWorkers: 'block',
  });
  // Optional webfonts must not make a local functional regression depend on Google.
  await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, function (route) {
    return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  });
  var page = await context.newPage();
  var errors = [];
  page.on('pageerror', function (err) {
    errors.push(err.message);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(function () {
    var app = window.MafiaApp;
    app.MU.setLookupEnabled(false);
    app.rolesApi.beginDeal(
      [
        'Мирный',
        'Шериф',
        'Дон',
        'Мафия',
        'Мафия',
        'Мирный',
        'Мирный',
        'Мирный',
        'Мирный',
        'Мирный',
      ],
      { shuffle: false }
    );
    for (var i = 0; i < 10; i++) app.rolesApi.revealCard(i);
    app.players[0].nick = 'Альфа';
    app.players[1].nick = 'Бета';
    app.navigateToScreen('prepare-screen');
  });

  await page.click('#prepare-players-list [data-player-id="1"]');
  await page.click('#modal-player-prepare-role-icons [data-role-code="mafia"]');
  await page.fill('#modal-player-nick', 'Альфа правка');
  if (desktop) {
    await page.click('#prepare-players-list [data-player-id="1"]');
    assert.strictEqual(await page.inputValue('#modal-player-nick'), 'Альфа правка');
    // Switch directly, without Save: this used to overwrite the first player's draft.
    await page.click('#prepare-players-list [data-player-id="2"]');
    assert.strictEqual(await page.inputValue('#modal-player-nick'), 'Бета');
    await page.click('#modal-player-prepare-role-icons [data-role-code="don"]');
    await page.click('[data-action="unified-player-close"]');
  } else {
    await page.click('button[data-action="player-modal-save"]');
  }
  var role = await page.evaluate(function () {
    var app = window.MafiaApp;
    return {
      role: app.rolesApi.getAssignedRole(1),
      nick: app.players[0].nick,
      other: app.players[1].nick,
    };
  });
  assert.deepStrictEqual(role, { role: 'mafia', nick: 'Альфа правка', other: 'Бета' });

  // A correction must not shadow an explicitly repeated live assignment.
  await page.evaluate(function () {
    window.MafiaApp.rolesApi.setSummaryCorrection(1, 'don');
  });
  await page.click('#prepare-players-list [data-player-id="1"]');
  await page.click('#modal-player-prepare-role-icons [data-role-code="mafia"]');
  await page.click(
    desktop ? '[data-action="unified-player-close"]' : 'button[data-action="player-modal-save"]'
  );
  assert.strictEqual(
    await page.evaluate(function () {
      return window.MafiaApp.rolesApi.getEffectiveRole(1);
    }),
    'mafia'
  );
  await page.reload({ waitUntil: 'networkidle' });
  assert.strictEqual(
    await page.evaluate(function () {
      return window.MafiaApp.rolesApi.getEffectiveRole(1);
    }),
    'mafia'
  );

  await page.evaluate(function () {
    window.MafiaApp.navigateToScreen('settings-screen');
  });
  await page.click('[data-action="settings-tab"][data-tab="general"]');
  await page.selectOption('#setting-scoring-system', 'msl');
  assert.strictEqual(await page.locator('#setting-player-protocol-visible').count(), 0);
  assert.strictEqual(await page.locator('[id*="opinion-"]').count(), 0);
  await page.evaluate(function () {
    window.MafiaApp.navigateToScreen('summary-screen');
  });
  await page.click('[data-action="summary-team-pick"][data-summary-team="mafia"]');
  await page.click('[data-action="scoring-guide-open"]');
  assert.ok((await page.textContent('#scoring-guide-content')).includes('МСЛ'));
  assert.ok((await page.textContent('#scoring-guide-content')).includes('0,25'));
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(os.tmpdir(), 'mafia-scoring-guide-' + width + '.png') });
  await page.click('button[data-action="scoring-guide-close"]:last-child');
  await page.click('#summary-roles-grid [data-player-id="1"]');
  await page.fill('#modal-summary-bonus', '0');
  var plus = page.locator('[data-action="summary-bonus-delta"][data-direction="1"]');
  assert.strictEqual(await plus.textContent(), '+0,25');
  await plus.click();
  await plus.click();
  await plus.click();
  assert.strictEqual(await page.inputValue('#modal-summary-bonus'), '0,75');
  await page.click(
    desktop ? '[data-action="unified-player-close"]' : 'button[data-action="summary-modal-save"]'
  );
  var exported = await page.evaluate(function () {
    var app = window.MafiaApp;
    var model = app.buildGameExportModel();
    app.protocolByPlayerId['1'] = { peaceful: '2', mafia: '', sheriff: '' };
    app.saveState();
    return {
      base: model.players[0].basePoints,
      bonus: model.players[0].bonus,
      total: model.players[0].totalPoints,
      system: model.scoringSystem,
    };
  });
  assert.deepStrictEqual(exported, { base: 2.5, bonus: 0.75, total: 3.25, system: 'msl' });

  await page.reload({ waitUntil: 'networkidle' });
  assert.strictEqual(
    await page.evaluate(function () {
      return window.MafiaApp.getScoringProfile().id;
    }),
    'msl'
  );
  await page.evaluate(function () {
    var app = window.MafiaApp;
    app.setScoringSystem('fsm');
    app.navigateToScreen('summary-screen');
  });
  await page.click('#summary-roles-grid [data-player-id="1"]');
  assert.strictEqual(await page.inputValue('#modal-summary-bonus'), '0,75');
  assert.strictEqual(await page.inputValue('#modal-summary-protocol-peaceful'), '2');
  assert.strictEqual(await plus.textContent(), '+0,1');
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(os.tmpdir(), 'mafia-scoring-player-' + width + '.png') });
  await page.click(
    desktop ? '[data-action="unified-player-close"]' : 'button[data-action="summary-modal-save"]'
  );

  await page.click('[data-action="scoring-guide-open"]');
  var opinionTable = page.getByRole('table', { name: 'Мнение в завещании', exact: false });
  var colorsTable = page.getByRole('table', { name: 'Протокол ПУ: цвета', exact: false });
  assert.strictEqual(await opinionTable.count(), 1);
  assert.strictEqual(await colorsTable.getByRole('row').count(), 8);
  assert.ok((await page.textContent('#scoring-guide-content ul')).length > 0);
  await colorsTable.scrollIntoViewIfNeeded();
  await page.waitForTimeout(450);
  assert.ok(
    await page.locator('#modal-scoring-guide .modal-panel').evaluate(function (panel) {
      return panel.scrollWidth <= panel.clientWidth;
    }),
    'FSM guide tables must fit the dialog at ' + width + 'px'
  );
  await page.screenshot({
    path: path.join(os.tmpdir(), 'mafia-scoring-fsm-colors-' + width + '.png'),
  });
  await opinionTable.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(os.tmpdir(), 'mafia-scoring-fsm-opinion-' + width + '.png'),
  });
  await page.click('button[data-action="scoring-guide-close"]:last-child');

  // Archive round-trip must restore the game's profile, not the current preference.
  var archived = await page.evaluate(function () {
    var app = window.MafiaApp;
    app.setScoringSystem('msl');
    app.saveCurrentGameToHistory({ silent: true });
    return JSON.parse(localStorage.getItem(app.GAME_HISTORY_STORAGE_KEY)).find(function (entry) {
      return entry.snapshot.hostState && entry.snapshot.hostState.scoringSystem === 'msl';
    }).id;
  });
  await page.evaluate(function () {
    var app = window.MafiaApp;
    app.resetGameState();
    app.setScoringSystem('fsm');
  });
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(function (id) {
      window.MafiaApp.restoreGameFromHistory(id, 'summary');
    }, archived),
  ]);
  assert.strictEqual(
    await page.evaluate(function () {
      return window.MafiaApp.getScoringProfile().id;
    }),
    'msl'
  );
  var manualNight = await page.evaluate(function () {
    var app = window.MafiaApp;
    app.rolesApi.reset();
    app.playerRoleOverrides = {};
    app.prepareConfig.variant = 'urban';
    app.prepareConfig.mode = 'host';
    var roles = [
      'don',
      'sheriff',
      'mafia',
      'maniac',
      'doctor',
      'beauty',
      'peaceful',
      'peaceful',
      'peaceful',
      'peaceful',
    ];
    app.players.forEach(function (player, index) {
      player.eliminationReason = null;
      if (roles[index] !== 'peaceful') app.rolesApi.assignPlayerRole(player.id, roles[index]);
    });
    app.navigateToScreen('game-screen');
    var entries = app.getHostDealtRoles();
    app.goToUrbanNightActions();
    return { count: entries.length, sheriff: entries[1].code, hasDraft: !!app.urbanNightDraft };
  });
  assert.deepStrictEqual(manualNight, { count: 10, sheriff: 'sheriff', hasDraft: true });
  assert.deepStrictEqual(errors, [], 'browser errors');
  console.log(
    '  ✓ ' + width + 'px: roles, player switching, settings, guide, scores, reload, archive'
  );
  await context.close();
}

(async function () {
  var chrome = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(function (file) {
    return file && fs.existsSync(file);
  });
  if (!chrome) throw new Error('Chrome is required for scoring browser regressions');
  var browser;
  try {
    await new Promise(function (resolve) {
      server.listen(0, '127.0.0.1', resolve);
    });
    browser = await chromium.launch({ executablePath: chrome, headless: true });
    var base = 'http://127.0.0.1:' + server.address().port + '/';
    await exercise(browser, base, 390);
    await exercise(browser, base, 1440);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
