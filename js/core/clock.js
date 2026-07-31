(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MafiaApp = root.MafiaApp || {};
    root.MafiaApp.clockApi = api.createClockApi();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function createClockApi(options) {
    options = options || {};
    var now = options.now || Date.now;
    var schedule = options.setInterval || setInterval;
    var cancel = options.clearInterval || clearInterval;
    var clocks = {};

    function snapshot(clock) {
      if (!clock) return null;
      var elapsedMs = clock.running ? Math.max(0, now() - clock.startedAt) : clock.elapsedMs;
      var remainingMs =
        clock.kind === 'countdown' ? Math.max(0, clock.durationMs - elapsedMs) : null;
      return {
        key: clock.key,
        kind: clock.kind,
        running: clock.running,
        elapsedMs: elapsedMs,
        remainingMs: remainingMs,
        durationMs: clock.durationMs,
        startedAt: clock.startedAt,
      };
    }

    function tick(clock) {
      if (!clock || !clock.running) return;
      var state = snapshot(clock);
      if (clock.onTick) clock.onTick(state);
      if (clock.kind === 'countdown' && state.remainingMs <= 0) {
        stop(clock.key, true);
        if (clock.onDone) clock.onDone(snapshot(clock));
      }
    }

    function start(key, kind, durationMs, callbacks) {
      stop(key);
      callbacks = callbacks || {};
      var clock = {
        key: key,
        kind: kind,
        durationMs: Math.max(0, Number(durationMs) || 0),
        elapsedMs: 0,
        startedAt: now(),
        running: true,
        interval: null,
        onTick: callbacks.onTick,
        onDone: callbacks.onDone,
      };
      clocks[key] = clock;
      tick(clock);
      if (clock.running) {
        clock.interval = schedule(
          function () {
            tick(clock);
          },
          Math.max(50, Number(callbacks.tickMs) || 200)
        );
      }
      return snapshot(clock);
    }

    function stop(key, completed) {
      var clock = clocks[key];
      if (!clock) return null;
      if (clock.running) clock.elapsedMs = Math.max(0, now() - clock.startedAt);
      if (completed && clock.kind === 'countdown') clock.elapsedMs = clock.durationMs;
      clock.running = false;
      if (clock.interval != null) cancel(clock.interval);
      clock.interval = null;
      return snapshot(clock);
    }

    function pause(key) {
      return stop(key, false);
    }

    function resume(key, callbacks) {
      var clock = clocks[key];
      if (!clock || clock.running) return snapshot(clock);
      callbacks = callbacks || {};
      if (callbacks.onTick) clock.onTick = callbacks.onTick;
      if (callbacks.onDone) clock.onDone = callbacks.onDone;
      clock.startedAt = now() - clock.elapsedMs;
      clock.running = true;
      tick(clock);
      if (clock.running) {
        clock.interval = schedule(
          function () {
            tick(clock);
          },
          Math.max(50, Number(callbacks.tickMs) || 200)
        );
      }
      return snapshot(clock);
    }

    return {
      startCountdown: function (key, durationMs, callbacks) {
        return start(key, 'countdown', durationMs, callbacks);
      },
      startStopwatch: function (key, callbacks) {
        return start(key, 'stopwatch', 0, callbacks);
      },
      pause: pause,
      resume: resume,
      stop: stop,
      reset: function (key) {
        stop(key);
        delete clocks[key];
      },
      get: function (key) {
        return snapshot(clocks[key]);
      },
      has: function (key) {
        return !!clocks[key];
      },
    };
  }

  return { createClockApi: createClockApi };
});
