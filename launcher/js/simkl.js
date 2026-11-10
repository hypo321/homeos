/* SIMKL: device sign-in (AUTH V2) and the reads the launcher needs. */
window.Simkl = (function () {
  var API = "https://api.simkl.com";
  var IMG = "https://wsrv.nl/?url=https://simkl.in/";
  var cfg = window.HOMEOS_CONFIG || {};
  var TOKEN_KEY = "homeos.simkl.token";
  var DETAIL_KEY = "homeos.simkl.detail.";
  var DETAIL_TTL = 7 * 24 * 3600 * 1000;
  // Details saved before this version lack the network and IMDb rating: fetch again.
  var DETAIL_V = 2;
  var EP_KEY = "homeos.simkl.ep.";
  var EP_TTL = 24 * 3600 * 1000, EP_V = 2;

  function store(key, val) {
    try { if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function load(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }

  function configured() { return !!cfg.SIMKL_CLIENT_ID; }
  function token() { return load(TOKEN_KEY); }
  function signedIn() { return configured() && !!token(); }
  function signOut() { store(TOKEN_KEY, null); }

  function qs(params) {
    var base = { client_id: cfg.SIMKL_CLIENT_ID, "app-name": cfg.APP_NAME, "app-version": cfg.APP_VERSION };
    for (var k in params) base[k] = params[k];
    return Object.keys(base).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(base[k]); }).join("&");
  }

  function form(path, body) {
    body.client_id = cfg.SIMKL_CLIENT_ID;
    var enc = Object.keys(body).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(body[k]); }).join("&");
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: enc
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  function saveToken(t) {
    store(TOKEN_KEY, {
      access: t.access_token,
      refresh: t.refresh_token,
      expires: Date.now() + (t.expires_in || 604800) * 1000,
      scope: t.scope
    });
  }

  /* ---------- Device sign-in ---------- */
  // Calls onCode({userCode, url, expiresIn}) once, then resolves when approved.
  function signIn(onCode) {
    var cancelled = false, timer = null;
    var promise = form("/oauth2/device", { scope: "media:read" }).then(function (res) {
      if (res.status !== 200 || !res.body.device_code) throw new Error(res.body.error_description || res.body.error || "Couldn't start sign-in");
      var d = res.body;
      var interval = (d.interval || 5) * 1000;
      var deadline = Date.now() + (d.expires_in || 900) * 1000;
      onCode({ userCode: d.user_code, url: d.verification_uri, expiresIn: d.expires_in });
      return new Promise(function (resolve, reject) {
        function poll() {
          if (cancelled) return reject(new Error("cancelled"));
          if (Date.now() > deadline) return reject(new Error("expired"));
          form("/oauth2/token", { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: d.device_code })
            .then(function (r) {
              if (r.status === 200 && r.body.access_token) { saveToken(r.body); return resolve(); }
              var e = r.body.error;
              if (e === "slow_down") interval += 5000;
              else if (e === "expired_token") return reject(new Error("expired"));
              else if (e === "invalid_client") return reject(new Error("invalid_client"));
              timer = setTimeout(poll, interval);
            })
            .catch(function () { timer = setTimeout(poll, interval); });
        }
        timer = setTimeout(poll, interval);
      });
    });
    promise.cancel = function () { cancelled = true; clearTimeout(timer); };
    return promise;
  }

  function refreshIfNeeded() {
    var t = token();
    if (!t) return Promise.reject(new Error("signed out"));
    if (t.expires - Date.now() > 24 * 3600 * 1000) return Promise.resolve(t);
    return form("/oauth2/token", { grant_type: "refresh_token", refresh_token: t.refresh }).then(function (r) {
      if (r.status === 200 && r.body.access_token) { saveToken(r.body); return token(); }
      if (r.status === 400 || r.status === 401) { signOut(); throw new Error("signed out"); }
      return t;
    });
  }

  function get(path, params, authed) {
    var go = function (t) {
      var headers = {};
      if (t) headers.Authorization = "Bearer " + t.access;
      return fetch(API + path + "?" + qs(params || {}), { headers: headers }).then(function (r) {
        if (r.status === 401 && authed) { signOut(); throw new Error("signed out"); }
        if (!r.ok) throw new Error("SIMKL " + r.status);
        return r.json();
      });
    };
    return authed ? refreshIfNeeded().then(go) : go(null);
  }

  /* ---------- Details (cached) ---------- */
  function detail(kind, simklId) {
    var key = DETAIL_KEY + kind + "." + simklId;
    var cached = load(key);
    if (cached && cached.v === DETAIL_V && Date.now() - cached.at < DETAIL_TTL) return Promise.resolve(cached.d);
    var path = kind === "movie" ? "/movies/" : kind === "anime" ? "/anime/" : "/tv/";
    return get(path + simklId, {}, false).then(function (d) {
      if (d && !Array.isArray(d)) store(key, { at: Date.now(), v: DETAIL_V, d: slim(d) });
      return slim(d);
    }).catch(function () { return cached ? cached.d : null; });
  }
  function slim(d) {
    if (!d || Array.isArray(d)) return null;
    return {
      title: d.title, year: d.year, poster: d.poster, fanart: d.fanart, overview: d.overview,
      genres: d.genres, runtime: d.runtime, ids: d.ids, network: d.network || null,
      imdb: (d.ratings && d.ratings.imdb && d.ratings.imdb.rating) || null,
      recs: (d.users_recommendations || []).slice(0, 8).map(function (r) {
        return { title: r.title, year: r.year, poster: r.poster, fanart: r.fanart, type: r.type, ids: r.ids };
      })
    };
  }

  /* ---------- One episode (cached a day) ---------- */
  // SIMKL lists a show's episodes in one call; only the one asked for is kept.
  // season may be null (anime counts episodes straight through).
  function episode(kind, simklId, season, number) {
    var key = EP_KEY + kind + "." + simklId + "." + (season || 0) + "." + number;
    var cached = load(key);
    if (cached && cached.v === EP_V && Date.now() - cached.at < EP_TTL) return Promise.resolve(cached.e);
    return get((kind === "anime" ? "/anime/episodes/" : "/tv/episodes/") + simklId, {}, false).then(function (list) {
      var hit = null;
      (Array.isArray(list) ? list : []).forEach(function (e) {
        if (!hit && e.type !== "special" && e.episode === number && (season == null || e.season === season)) hit = e;
      });
      var e = hit ? { title: hit.title || null, runtime: hit.runtime || null, overview: hit.description || null,
        finale: hit.finale_type || null, img: hit.img || null } : null;
      store(key, { at: Date.now(), v: EP_V, e: e });
      return e;
    }).catch(function () { return cached ? cached.e : null; });
  }

  // Run tasks with at most n at once.
  function pool(tasks, n) {
    var out = new Array(tasks.length), i = 0;
    function next() {
      if (i >= tasks.length) return Promise.resolve();
      var at = i++;
      return tasks[at]().then(function (v) { out[at] = v; }, function () { out[at] = null; }).then(next);
    }
    var workers = [];
    for (var w = 0; w < Math.min(n, tasks.length); w++) workers.push(next());
    return Promise.all(workers).then(function () { return out; });
  }

  /* ---------- Images ---------- */
  function image(kind, path, size) {
    if (!path) return null;
    var ext = ".webp";
    return IMG + kind + "/" + path + size + ext + "&q=85";
  }

  /* ---------- Tidy the detail cache ---------- */
  // Details older than 30 days are dropped, once, a minute after start-up, so
  // storage doesn't grow with every title ever shown.
  setTimeout(function () {
    try {
      var drop = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf(DETAIL_KEY) === 0 || k.indexOf(EP_KEY) === 0)) {
          var v = load(k), keep = k.indexOf(EP_KEY) === 0 ? 7 : 30;
          if (!v || Date.now() - v.at > keep * 24 * 3600 * 1000) drop.push(k);
        }
      }
      drop.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }, 60000);

  return {
    configured: configured, signedIn: signedIn, signIn: signIn, signOut: signOut,
    get: get, detail: detail, episode: episode, pool: pool, image: image
  };
})();
