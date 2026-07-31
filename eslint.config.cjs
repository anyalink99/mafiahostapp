'use strict';
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/',
      'www/',
      'android/',
      'ios/',
      'js/vendor/',
      'chrome-extension-mu/app/',
      'chrome-extension-mu/mu-reskin-css.js', // генерируется build-app.cjs
      'css/tailwind.css', // генерируется build:css
    ],
  },
  js.configs.recommended,
  {
    // Кодовая база — ES5-style IIFE без модулей; пустые catch — осознанный
    // паттерн (localStorage/vibrate/audio могут кидать в любых сочетаниях).
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, Capacitor: 'readonly', JSZip: 'readonly' },
    },
  },
  {
    files: ['service-worker.js'],
    languageOptions: {
      sourceType: 'script',
      globals: globals.serviceworker,
    },
  },
  {
    files: ['chrome-extension-mu/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, chrome: 'readonly', MU_RESKIN_CSS: 'readonly' },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    // Spotify Web Playback SDK создаёт глобал window.Spotify.
    files: ['js/audio/spotify-player.js'],
    languageOptions: { globals: { Spotify: 'readonly' } },
  },
  {
    // Двухсредные модули: работают и в браузере, и в node-тестах через module.exports.
    files: [
      'js/mu-vote-reconstruct.js',
      'js/mu-utils.js',
      'js/game/vote-rules.js',
      'js/core/storage.js',
      'js/core/clock.js',
      'js/game/session-api.js',
      'js/game/vote-api.js',
      'js/game/phase-machine.js',
      'js/game/night-action-registry.js',
      'js/audio/audio-director.js',
    ],
    languageOptions: { globals: { module: 'writable', require: 'readonly' } },
  },
  {
    // Колбэки page.evaluate выполняются в браузере.
    files: ['tests/smoke-browser.cjs', 'tests/test-pwa.cjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
