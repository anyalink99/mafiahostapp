(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.phaseMachine = api.createPhaseMachine();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function createPhaseMachine() {
    var flows = {};

    return {
      register: function (name, config) {
        flows[name] = config || {};
        return flows[name];
      },
      canTransition: function (name, state, target) {
        var flow = flows[name] || {};
        var from = state && state.phase;
        var allowed = flow.transitions && flow.transitions[from];
        return allowed === '*' || (Array.isArray(allowed) && allowed.indexOf(target) !== -1);
      },
      transition: function (name, state, target, context) {
        var flow = flows[name];
        if (!flow) throw new Error('Unknown phase flow: ' + name);
        if (!this.canTransition(name, state, target)) {
          throw new Error('Invalid phase transition: ' + state.phase + ' -> ' + target);
        }
        var previous = state.phase;
        if (flow.before) flow.before(previous, target, state, context || {});
        state.phase = target;
        if (flow.effects && flow.effects[target]) {
          flow.effects[target](state, context || {}, previous);
        }
        if (flow.after) flow.after(previous, target, state, context || {});
        return state;
      },
    };
  }

  return { createPhaseMachine: createPhaseMachine };
});
