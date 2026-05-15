window.MafiaApp = window.MafiaApp || {};

(function (app) {
  var CLIENT_ID_KEY = 'mafia_host_spotify_client_id';
  var TOKENS_KEY = 'mafia_host_spotify_tokens';
  var VERIFIER_KEY = 'spotify_pkce_verifier';

  var SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state';
  var AUTH_URL = 'https://accounts.spotify.com/authorize';
  var TOKEN_URL = 'https://accounts.spotify.com/api/token';

  var _clientId = '';

  function getRedirectUri() {
    return location.origin + location.pathname;
  }

  function base64urlEncode(buffer) {
    var bytes = new Uint8Array(buffer);
    var str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function generateVerifier() {
    var arr = new Uint8Array(64);
    crypto.getRandomValues(arr);
    return base64urlEncode(arr);
  }

  function sha256(plain) {
    var encoder = new TextEncoder();
    return crypto.subtle.digest('SHA-256', encoder.encode(plain));
  }

  app.spotifyLoadClientId = function () {
    try {
      _clientId = localStorage.getItem(CLIENT_ID_KEY) || '';
    } catch (e) {
      _clientId = '';
    }
  };

  app.spotifySaveClientId = function (id) {
    _clientId = (id || '').trim();
    try {
      localStorage.setItem(CLIENT_ID_KEY, _clientId);
    } catch (e) {}
  };

  app.spotifyGetClientId = function () {
    return _clientId;
  };

  function loadTokens() {
    try {
      var raw = localStorage.getItem(TOKENS_KEY);
      if (!raw) return null;
      var t = JSON.parse(raw);
      if (!t || !t.access_token) return null;
      return t;
    } catch (e) {
      return null;
    }
  }

  function saveTokens(tokens) {
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    } catch (e) {}
  }

  function clearTokens() {
    try {
      localStorage.removeItem(TOKENS_KEY);
    } catch (e) {}
  }

  app.spotifyIsAuthenticated = function () {
    var t = loadTokens();
    return !!(t && t.access_token);
  };

  app.spotifyGetAccessToken = function () {
    var t = loadTokens();
    if (!t || !t.access_token) return Promise.resolve(null);
    if (t.expires_at && Date.now() < t.expires_at) {
      return Promise.resolve(t.access_token);
    }
    if (t.refresh_token) {
      return app.spotifyRefreshToken().then(function (newToken) {
        return newToken;
      }).catch(function () {
        clearTokens();
        if (app.showToast) app.showToast('Сессия Spotify истекла, подключитесь заново');
        return null;
      });
    }
    clearTokens();
    return Promise.resolve(null);
  };

  app.spotifyRefreshToken = function () {
    var t = loadTokens();
    if (!t || !t.refresh_token) return Promise.reject(new Error('no refresh token'));
    var cid = _clientId || '';
    if (!cid) return Promise.reject(new Error('no client id'));

    var body = 'grant_type=refresh_token'
      + '&refresh_token=' + encodeURIComponent(t.refresh_token)
      + '&client_id=' + encodeURIComponent(cid);

    return fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    }).then(function (res) {
      if (!res.ok) throw new Error('refresh failed: ' + res.status);
      return res.json();
    }).then(function (data) {
      var tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || t.refresh_token,
        expires_at: Date.now() + (data.expires_in - 60) * 1000,
      };
      saveTokens(tokens);
      return tokens.access_token;
    });
  };

  app.spotifyStartAuth = function () {
    var cid = _clientId;
    if (!cid) {
      if (app.showToast) app.showToast('Введите Spotify Client ID');
      return;
    }
    if (location.protocol === 'file:') {
      if (app.showToast) app.showToast('Spotify доступен только через веб-сервер');
      return;
    }

    var verifier = generateVerifier();
    try {
      sessionStorage.setItem(VERIFIER_KEY, verifier);
    } catch (e) {}

    sha256(verifier).then(function (hashed) {
      var challenge = base64urlEncode(hashed);
      var params = [
        'client_id=' + encodeURIComponent(cid),
        'response_type=code',
        'redirect_uri=' + encodeURIComponent(getRedirectUri()),
        'scope=' + encodeURIComponent(SCOPES),
        'code_challenge_method=S256',
        'code_challenge=' + encodeURIComponent(challenge),
      ];
      window.location.href = AUTH_URL + '?' + params.join('&');
    });
  };

  app.spotifyHandleCallback = function () {
    if (location.protocol === 'file:') return;
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    var error = params.get('error');

    if (error) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      return;
    }
    if (!code) return;

    var verifier = '';
    try { verifier = sessionStorage.getItem(VERIFIER_KEY) || ''; } catch (e) {}
    try { sessionStorage.removeItem(VERIFIER_KEY); } catch (e) {}

    if (!verifier) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      return;
    }

    var cid = '';
    try { cid = localStorage.getItem(CLIENT_ID_KEY) || ''; } catch (e) {}
    if (!cid) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      return;
    }

    _clientId = cid;

    var body = 'grant_type=authorization_code'
      + '&code=' + encodeURIComponent(code)
      + '&redirect_uri=' + encodeURIComponent(getRedirectUri())
      + '&client_id=' + encodeURIComponent(cid)
      + '&code_verifier=' + encodeURIComponent(verifier);

    fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body,
    }).then(function (res) {
      if (!res.ok) throw new Error('token exchange failed: ' + res.status);
      return res.json();
    }).then(function (data) {
      saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in - 60) * 1000,
      });
    }).catch(function (err) {
      console.warn('Spotify token exchange error:', err);
    }).then(function () {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
    });
  };

  app.spotifyLogout = function () {
    clearTokens();
    if (app.spotifyDisconnect) app.spotifyDisconnect();
  };
})(window.MafiaApp);
