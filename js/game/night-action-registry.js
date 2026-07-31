(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.nightActionRegistry = api.createNightActionRegistry();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function createNightActionRegistry() {
    var scopes = {};
    function scopeFor(name) {
      var key = name || 'default';
      if (!scopes[key]) scopes[key] = { actions: {}, fallback: null };
      return scopes[key];
    }
    return {
      register: function (role, action, scope) {
        var registry = scopeFor(scope);
        if (role === '*') registry.fallback = action;
        else registry.actions[role] = action;
        return action;
      },
      get: function (role, context) {
        context = context || {};
        var registry = scopeFor(context.mode);
        var defaults = scopeFor('default');
        var fallback = registry.fallback || defaults.fallback;
        var action = registry.actions[role] || defaults.actions[role] || fallback;
        if (!action) return null;
        if (typeof action.when === 'function' && !action.when(context)) {
          return fallback && fallback !== action ? fallback : null;
        }
        return action;
      },
      run: function (role, context) {
        var action = this.get(role, context);
        return action && typeof action.render === 'function' ? action.render(context || {}) : [];
      },
      roles: function (scope) {
        return Object.keys(scopeFor(scope).actions);
      },
    };
  }

  return { createNightActionRegistry: createNightActionRegistry };
});
