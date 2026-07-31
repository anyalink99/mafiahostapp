(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.audioDirector = api.createAudioDirector();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function createAudioDirector() {
    var modes = {};
    var current = null;

    return {
      registerMode: function (mode, policy) {
        modes[mode] = policy || {};
        return policy;
      },
      resolve: function (mode, phase, context) {
        var policy = modes[mode];
        if (!policy) return null;
        var route = policy.routes && policy.routes[phase];
        return typeof route === 'function' ? route(context || {}) : route || null;
      },
      enter: function (mode, phase, context) {
        var policy = modes[mode];
        if (!policy) return null;
        var cue = this.resolve(mode, phase, context);
        if (!cue) {
          if (current && policy.stop) policy.stop(current);
          current = null;
          return null;
        }
        if (
          current &&
          current.mode === mode &&
          current.key === cue.key &&
          current.stage === (cue.stage || null)
        ) {
          return cue;
        }
        if (policy.play) policy.play(cue, current);
        current = { mode: mode, key: cue.key, stage: cue.stage || null, phase: phase };
        return cue;
      },
      setStage: function (mode, stage, context) {
        var policy = modes[mode];
        if (policy && policy.setStage) policy.setStage(stage, context || {}, current);
        if (current && current.mode === mode) current.stage = stage;
      },
      stop: function (mode) {
        var policy = modes[mode];
        if (policy && policy.stop) policy.stop(current);
        if (!mode || (current && current.mode === mode)) current = null;
      },
      forget: function (mode) {
        if (!mode || (current && current.mode === mode)) current = null;
      },
      current: function () {
        return current ? Object.assign({}, current) : null;
      },
    };
  }

  return { createAudioDirector: createAudioDirector };
});
