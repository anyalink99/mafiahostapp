(function (app) {
  var API_BASE = 'https://api.spotify.com/v1';
  var SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
  var SDK_LOAD_TIMEOUT = 10000;
  var PLAYER_NAME = 'Мафия — Ведущий';

  var _player = null;
  var _deviceId = null;
  var _sdkReady = false;
  var _sdkLoading = false;
  var _sdkReadyCallbacks = [];

  app.spotifyLastError = null;

  function waitForSdk() {
    if (_sdkReady) return Promise.resolve(true);
    if (!_sdkLoading) {
      _sdkLoading = true;
      var script = document.createElement('script');
      script.src = SDK_URL;
      script.onerror = function () {
        _sdkLoading = false;
        var cbs = _sdkReadyCallbacks.splice(0);
        for (var i = 0; i < cbs.length; i++) cbs[i](false);
      };
      document.head.appendChild(script);
      setTimeout(function () {
        if (!_sdkReady) {
          _sdkLoading = false;
          var cbs = _sdkReadyCallbacks.splice(0);
          for (var i = 0; i < cbs.length; i++) cbs[i](false);
        }
      }, SDK_LOAD_TIMEOUT);
    }
    return new Promise(function (resolve) {
      _sdkReadyCallbacks.push(resolve);
    });
  }

  window.onSpotifyWebPlaybackSDKReady = function () {
    _sdkReady = true;
    _sdkLoading = false;
    var cbs = _sdkReadyCallbacks.splice(0);
    for (var i = 0; i < cbs.length; i++) cbs[i](true);
  };

  app.spotifyEnsurePlayer = function () {
    if (_player && _deviceId) return Promise.resolve({ player: _player, deviceId: _deviceId });

    return waitForSdk().then(function (ok) {
      if (!ok) {
        if (app.showToast) app.showToast('Не удалось загрузить Spotify SDK');
        return null;
      }
      if (_player && _deviceId) return { player: _player, deviceId: _deviceId };

      return new Promise(function (resolve) {
        var player = new Spotify.Player({
          name: PLAYER_NAME,
          getOAuthToken: function (cb) {
            app.spotifyGetAccessToken().then(function (token) {
              cb(token || '');
            });
          },
          volume: 0.85,
        });

        player.addListener('initialization_error', function (e) {
          app.spotifyLastError = e.message || 'initialization_error';
          console.warn('Spotify init error:', e.message);
        });
        player.addListener('authentication_error', function (e) {
          app.spotifyLastError = e.message || 'authentication_error';
          console.warn('Spotify auth error:', e.message);
        });
        player.addListener('account_error', function (e) {
          app.spotifyLastError = 'premium_required';
          console.warn('Spotify account error (Premium required):', e.message);
        });
        player.addListener('playback_error', function (e) {
          app.spotifyLastError = e.message || 'playback_error';
          console.warn('Spotify playback error:', e.message);
        });

        player.addListener('ready', function (data) {
          _player = player;
          _deviceId = data.device_id;
          app.spotifyLastError = null;
          resolve({ player: player, deviceId: data.device_id });
        });

        player.addListener('not_ready', function () {
          _deviceId = null;
        });

        player.connect().then(function (ok) {
          if (!ok) {
            resolve(null);
          }
        });

        setTimeout(function () {
          if (!_deviceId) resolve(null);
        }, 8000);
      });
    });
  };

  function apiFetch(method, path, body) {
    return app.spotifyGetAccessToken().then(function (token) {
      if (!token) throw new Error('not authenticated');
      var opts = {
        method: method,
        headers: { Authorization: 'Bearer ' + token },
      };
      if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      return fetch(API_BASE + path, opts);
    }).then(function (res) {
      if (res.status === 204 || res.status === 202) return null;
      if (!res.ok) throw new Error('Spotify API ' + res.status);
      return res.json();
    });
  }

  app.spotifyPlayPlaylist = function (playlistId, volume) {
    if (!_deviceId) return Promise.reject(new Error('no device'));
    var uri = 'spotify:playlist:' + playlistId;
    var vol = typeof volume === 'number' ? volume : 0.85;

    return apiFetch('PUT', '/me/player/play?device_id=' + encodeURIComponent(_deviceId), {
      context_uri: uri,
    }).then(function () {
      return apiFetch('PUT', '/me/player/shuffle?state=true&device_id=' + encodeURIComponent(_deviceId));
    }).then(function () {
      if (_player) return _player.setVolume(vol);
    });
  };

  app.spotifyPause = function () {
    if (_player) return _player.pause();
    return Promise.resolve();
  };

  app.spotifyResume = function () {
    if (_player) return _player.resume();
    return Promise.resolve();
  };

  app.spotifySetVolume = function (vol) {
    if (vol < 0) vol = 0;
    if (vol > 1) vol = 1;
    if (_player) return _player.setVolume(vol);
    return Promise.resolve();
  };

  app.spotifyDisconnect = function () {
    if (_player) {
      try { _player.disconnect(); } catch (e) {}
    }
    _player = null;
    _deviceId = null;
  };

  app.spotifyIsActive = function () {
    return !!(_player && _deviceId);
  };

  /* ── Settings UI rendering ── */

  var escapeHtml = app.escapeHtml;

  app.renderSpotifyGlobalSettings = function () {
    var container = document.getElementById('spotify-settings-container');
    if (!container) return;

    var clientId = app.spotifyGetClientId ? app.spotifyGetClientId() : '';
    var authed = app.spotifyIsAuthenticated ? app.spotifyIsAuthenticated() : false;
    var isFile = location.protocol === 'file:';

    var html = '';
    html += '<label class="block text-xs text-mafia-cream/60 uppercase tracking-wider mb-1">Client ID</label>';
    html += '<input type="text" id="spotify-client-id" value="' + escapeHtml(clientId) + '" placeholder="Вставьте Client ID из Spotify Developer" class="w-full px-3 py-2 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm mb-3">';

    if (isFile) {
      html += '<p class="text-mafia-cream/50 text-xs mb-3">Spotify доступен только при запуске через веб-сервер (http/https).</p>';
    } else if (authed) {
      html += '<div class="flex items-center gap-3 mb-3">';
      html += '<span class="text-green-400 text-sm">Подключен</span>';
      html += '<button type="button" data-action="spotify-disconnect" class="px-3 py-1.5 bg-mafia-card hover:bg-mafia-border border border-mafia-border text-mafia-cream/80 text-xs uppercase tracking-wider rounded cursor-pointer">Отключить</button>';
      html += '</div>';
    } else {
      html += '<button type="button" data-action="spotify-connect" class="px-4 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-medium text-sm rounded cursor-pointer transition-colors' + (clientId ? '' : ' opacity-50 pointer-events-none') + '">Подключить Spotify</button>';
      if (!clientId) {
        html += '<p class="text-mafia-cream/40 text-xs mt-2">Сначала введите Client ID.</p>';
      }
    }

    container.innerHTML = html;
  };

  app.renderSpotifySlotSettings = function (slot) {
    var k = String(slot) === '2' ? '2' : '1';
    var container = document.getElementById('spotify-slot-' + k + '-config');
    if (!container) return;

    var authed = app.spotifyIsAuthenticated ? app.spotifyIsAuthenticated() : false;
    if (!authed) {
      container.innerHTML = '';
      return;
    }

    var info = app.spotifyGetSlotPlaylist(slot);
    var html = '';

    if (info && info.playlistId) {
      html += '<div class="flex items-center gap-3 p-2.5 bg-[#1DB954]/10 border border-[#1DB954]/30 rounded">';
      if (info.playlistImageUrl) {
        html += '<img src="' + escapeHtml(info.playlistImageUrl) + '" alt="" class="w-10 h-10 rounded flex-shrink-0">';
      }
      html += '<div class="flex-1 min-w-0">';
      html += '<p class="text-sm text-[#1DB954] font-medium truncate">' + escapeHtml(info.playlistName || 'Плейлист') + '</p>';
      html += '<p class="text-xs text-mafia-cream/50">' + (info.trackCount || 0) + ' треков</p>';
      html += '</div>';
      html += '<button type="button" data-action="spotify-clear-playlist" data-slot="' + escapeHtml(k) + '" class="text-red-400/80 hover:text-red-300 text-xs uppercase tracking-wider cursor-pointer flex-shrink-0">Убрать</button>';
      html += '</div>';
    } else {
      html += '<div class="flex gap-2">';
      html += '<input type="text" data-spotify-playlist-input data-slot="' + escapeHtml(k) + '" placeholder="https://open.spotify.com/playlist/..." class="flex-1 min-w-0 px-3 py-2 bg-mafia-coal border border-mafia-border rounded text-mafia-cream text-sm">';
      html += '<button type="button" data-action="spotify-paste-playlist" data-slot="' + escapeHtml(k) + '" class="px-3 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black text-xs font-medium uppercase tracking-wider rounded cursor-pointer flex-shrink-0">Добавить</button>';
      html += '</div>';
      html += '<div id="spotify-slot-' + escapeHtml(k) + '-error" class="text-red-400/80 text-xs mt-1 hidden"></div>';
    }

    container.innerHTML = html;
  };
})(window.MafiaApp);
