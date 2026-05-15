(function (app) {
  var API_BASE = 'https://api.spotify.com/v1';

  app.spotifyParsePlaylistUrl = function (input) {
    if (!input || typeof input !== 'string') return null;
    input = input.trim();
    var m = input.match(/spotify[:/]playlist[:/]([A-Za-z0-9]{22})/);
    if (m) return m[1];
    try {
      var url = new URL(input);
      if (url.hostname === 'open.spotify.com') {
        var parts = url.pathname.split('/');
        var idx = parts.indexOf('playlist');
        if (idx >= 0 && parts[idx + 1]) {
          var id = parts[idx + 1].split('?')[0];
          if (/^[A-Za-z0-9]{22}$/.test(id)) return id;
        }
      }
    } catch (e) {}
    return null;
  };

  app.spotifyGetSlotPlaylist = function (slot) {
    var meta = app.loadMusicMeta();
    var key = String(slot) === '2' ? '2' : '1';
    if (!meta.spotify) return null;
    return meta.spotify[key] || null;
  };

  app.spotifySetSlotPlaylist = function (slot, info) {
    var meta = app.loadMusicMeta();
    var key = String(slot) === '2' ? '2' : '1';
    if (!meta.spotify || typeof meta.spotify !== 'object') meta.spotify = { '1': null, '2': null };
    meta.spotify[key] = {
      playlistId: info.playlistId,
      playlistName: info.playlistName || '',
      playlistImageUrl: info.playlistImageUrl || '',
      trackCount: info.trackCount || 0,
    };
    app.saveMusicMeta(meta);
  };

  app.spotifyClearSlotPlaylist = function (slot) {
    var meta = app.loadMusicMeta();
    var key = String(slot) === '2' ? '2' : '1';
    if (!meta.spotify) return;
    meta.spotify[key] = null;
    app.saveMusicMeta(meta);
  };

  app.spotifyFetchPlaylistInfo = function (playlistId) {
    return app.spotifyGetAccessToken().then(function (token) {
      if (!token) throw new Error('not authenticated');
      return fetch(API_BASE + '/playlists/' + encodeURIComponent(playlistId) + '?fields=name,images,tracks.total', {
        headers: { Authorization: 'Bearer ' + token },
      });
    }).then(function (res) {
      if (res.status === 404) throw new Error('playlist not found');
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      return res.json();
    }).then(function (data) {
      var imageUrl = '';
      if (data.images && data.images.length) {
        imageUrl = data.images[data.images.length - 1].url || data.images[0].url;
      }
      return {
        playlistName: data.name || '',
        playlistImageUrl: imageUrl,
        trackCount: data.tracks && data.tracks.total ? data.tracks.total : 0,
      };
    });
  };
})(window.MafiaApp);
