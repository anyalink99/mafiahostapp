/**
 * Музыка — громкость и Web Audio-усиление (>100%).
 *
 * HTMLAudio.volume жёстко ограничен 1.0, поэтому x2 раньше «упирался» в потолок.
 * Маршрутизируем элемент через GainNode ТОЛЬКО когда нужно усиление (target>1) —
 * обычный случай (≤100%) идёт нативным element.volume и работает везде.
 * Любой сбой Web Audio → _webAudioBroken и откат на element.volume (cap 1.0).
 *
 * Файлы музыки общаются через app._music (M); снаружи — только app.*.
 */
(function (app) {
  'use strict';

  var M = (app._music = app._music || {});

  M.BASE_VOLUME = 0.85;

  var _audioCtx = null;
  var _gainNodes = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  // Под file:// Web Audio глушит медиа (непрозрачный origin → cross-origin taint),
  // поэтому усиление там невозможно — отключаем граф и играем нативно (cap 1.0).
  // По http(s)/localhost и в собранном приложении усиление работает.
  var _webAudioBroken = typeof location !== 'undefined' && location.protocol === 'file:';

  function getAudioCtx() {
    if (_webAudioBroken) return null;
    if (_audioCtx) return _audioCtx;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) {
        _webAudioBroken = true;
        return null;
      }
      _audioCtx = new Ctx();
    } catch (e) {
      _webAudioBroken = true;
      return null;
    }
    return _audioCtx;
  }

  function resumeAudioCtx() {
    if (!_audioCtx || _audioCtx.state !== 'suspended' || !_audioCtx.resume) return;
    try {
      var p = _audioCtx.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  app.resumeMusicAudioCtx = resumeAudioCtx;
  M.resumeAudioCtx = resumeAudioCtx;

  // Создаёт и «разогревает» AudioContext синхронно в рамках пользовательского жеста
  // (клик «играть»/превью). Без этого resume() в асинхронном колбэке отклоняется
  // (жест уже истёк), и усиленный трек уходит в suspended-граф → тишина до перезагрузки.
  app.primeMusicAudio = function () {
    var ctx = getAudioCtx();
    if (ctx) resumeAudioCtx();
  };

  function getGainForEl(a) {
    if (!_gainNodes || !a) return null;
    if (_gainNodes.has(a)) return _gainNodes.get(a);
    if (_webAudioBroken) return null;
    var ctx = getAudioCtx();
    if (!ctx) return null;
    try {
      var src = ctx.createMediaElementSource(a);
      var g = ctx.createGain();
      src.connect(g);
      g.connect(ctx.destination);
      var rec = { gain: g };
      _gainNodes.set(a, rec);
      return rec;
    } catch (e) {
      _webAudioBroken = true;
      return null;
    }
  }

  M.setElementGainVolume = function (a, mul) {
    if (!a) return;
    var target = M.BASE_VOLUME * mul;
    if (target < 0) target = 0;
    var routed = _gainNodes && _gainNodes.has(a);
    // Обычный случай (≤100% и ещё не маршрутизирован) — нативно, без Web Audio.
    if (!routed && target <= 1) {
      a.volume = target;
      return;
    }
    var ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') resumeAudioCtx();
    if (routed) {
      var rec0 = getGainForEl(a);
      if (rec0) {
        a.volume = 1;
        try {
          rec0.gain.gain.value = target;
        } catch (e) {}
        return;
      }
      a.volume = target > 1 ? 1 : target;
      return;
    }
    // Нужно усиление. Маршрутизируем элемент в граф ТОЛЬКО если контекст реально
    // играет — иначе звук уходит в неактивный граф и пропадает до перезагрузки.
    // Если контекст не запущен — безопасный откат на нативную громкость (cap 1.0).
    if (!ctx || ctx.state !== 'running') {
      a.volume = target > 1 ? 1 : target;
      return;
    }
    var rec = getGainForEl(a);
    if (rec) {
      a.volume = 1;
      try {
        rec.gain.gain.value = target;
      } catch (e) {}
    } else {
      a.volume = target > 1 ? 1 : target;
    }
  };
})(window.MafiaApp);
