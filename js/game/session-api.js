(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    var session = api.createGameSessionApi();
    root.MafiaApp.gameSessionApi = session;
    root.MafiaApp.playerApi = api.createPlayerApi(session);
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function createGameSessionApi() {
    var modes = {};
    var activeMode = null;

    return {
      registerMode: function (mode, adapter) {
        if (!mode || !adapter) throw new Error('GameSessionApi requires a mode and adapter');
        modes[mode] = adapter;
        return adapter;
      },
      hasMode: function (mode) {
        return !!modes[mode];
      },
      setActiveMode: function (mode) {
        if (!modes[mode]) throw new Error('Unknown game mode: ' + mode);
        activeMode = mode;
        return mode;
      },
      getActiveMode: function () {
        return activeMode;
      },
      adapter: function (mode) {
        var key = mode || activeMode;
        var adapter = modes[key];
        if (!adapter) throw new Error('Game mode is not registered: ' + key);
        return adapter;
      },
      command: function (mode, command, payload) {
        var adapter = this.adapter(mode);
        if (typeof adapter[command] !== 'function') {
          throw new Error('Unsupported game command: ' + command);
        }
        return adapter[command](payload || {});
      },
      snapshot: function (mode) {
        var adapter = this.adapter(mode);
        return typeof adapter.snapshot === 'function' ? adapter.snapshot() : null;
      },
    };
  }

  function createPlayerApi(session) {
    function command(mode, name, playerId, extra) {
      return session.command(
        mode,
        name,
        Object.assign({ playerId: Number(playerId) }, extra || {})
      );
    }

    return {
      addFoul: function (mode, playerId) {
        return command(mode, 'addFoul', playerId);
      },
      removeFoul: function (mode, playerId) {
        return command(mode, 'removeFoul', playerId);
      },
      setElimination: function (mode, playerId, reason) {
        return command(mode, 'setElimination', playerId, { reason: reason });
      },
      addNominee: function (mode, playerId, options) {
        return command(mode, 'addNominee', playerId, { options: options || {} });
      },
      removeNominee: function (mode, playerId, options) {
        return command(mode, 'removeNominee', playerId, { options: options || {} });
      },
      toggleNominee: function (mode, playerId, options) {
        return command(mode, 'toggleNominee', playerId, { options: options || {} });
      },
      updateNickname: function (mode, playerId, nickname) {
        return command(mode, 'updateNickname', playerId, { nickname: nickname });
      },
    };
  }

  return {
    createGameSessionApi: createGameSessionApi,
    createPlayerApi: createPlayerApi,
  };
});
