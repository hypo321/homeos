/* Where the launcher's rows come from.
   Media: SIMKL (to come), sample data until it is connected.
   Apps and inputs: Glasshouse's catalogue, in the owner's order, with
   favourites lifted to the front. */
window.Sources = (function () {
  var FEATURED = [
    { match: /^space\.nuvio\.webos$|^nuvio( tv)?$/i, color: "#1b2740", tagline: "Your library, addons and everything you stream" },
    { match: /^bbc\.iplayer|iplayer/i, color: "#202020", tagline: "Live and on demand from the BBC" },
    { match: /^com\.fvp\.ch4$|channel\s*4/i, color: "#151a24", tagline: "Shows and films from Channel 4" }
  ];
  var KNOWN = [
    { match: /youtube/i, color: "#2a1515", tagline: "Videos, music and live streams" },
    { match: /netflix/i, color: "#2a1012", tagline: "Films and series from Netflix" },
    { match: /prime|amazon/i, color: "#10202c", tagline: "Prime Video" },
    { match: /disney/i, color: "#0f1a33", tagline: "Disney, Pixar, Marvel and Star Wars" },
    { match: /live tv/i, color: "#1d1d1d", tagline: "Freeview channels" },
    { match: /itvx/i, color: "#15202a", tagline: "Shows and films from ITV" },
    { match: /^demand5$/i, color: "#1d1530", tagline: "Shows from Channel 5" }
  ];

  function hits(rule, a) { return rule.match.test(a.id) || rule.match.test(a.title); }
  function styleFor(a) {
    var all = FEATURED.concat(KNOWN);
    for (var i = 0; i < all.length; i++) if (hits(all[i], a)) return all[i];
    return { color: "#1d1a18", tagline: "App" };
  }
  function featuredRank(a) {
    for (var i = 0; i < FEATURED.length; i++) if (hits(FEATURED[i], a)) return i;
    return -1;
  }

  function apps(cb) {
    Glasshouse.catalogue(function (err, res) {
      if (err || !res) return cb(err || new Error("No catalogue"), { favourites: [], others: [], inputs: [] });
      var visible = res.apps.filter(function (a) { return !a.hidden; });
      var fav = visible.filter(function (a) { return featuredRank(a) >= 0; })
        .sort(function (a, b) { return featuredRank(a) - featuredRank(b); });
      var rest = visible.filter(function (a) { return featuredRank(a) < 0; });
      rest.sort(function (a, b) { return (a.folder ? 1 : 0) - (b.folder ? 1 : 0); });

      function toTile(a) {
        var s = styleFor(a);
        return { kind: "app", id: a.id, title: a.title, icon: a.icon, color: s.color, tagline: s.tagline };
      }
      var inputs = (res.inputs || []).filter(function (i) { return !i.hidden; }).map(function (i) {
        return { kind: "input", id: i.id, title: i.title, port: i.port, color: "#22201e",
          tagline: i.tuner ? "TV tuner" : "HDMI " + i.port };
      });
      cb(null, { favourites: fav.map(toTile), others: rest.map(toTile), inputs: inputs });
    });
  }

  /* ---------- Media from SIMKL ---------- */
  var MEDIA_KEY = "homeos.media";
  var EMPTY = { continueWatching: [], upNext: [], recommended: [] };

  function epLabel(code) {
    var m = /^S(\d+)E(\d+)$/i.exec(code || "");
    return m ? "S" + (+m[1]) + " E" + (+m[2]) : code || "";
  }
  function timeLeft(runtime, progress) {
    if (!runtime || progress == null) return null;
    var mins = Math.max(1, Math.round(runtime * (1 - progress)));
    if (mins < 60) return mins + " min left";
    return Math.floor(mins / 60) + " hr " + (mins % 60 ? (mins % 60) + " min " : "") + "left";
  }
  function kindOf(type) { return type === "movie" || type === "movies" ? "movie" : type === "anime" ? "anime" : "tv"; }
  function idKey(ids) { return ids && ids.simkl ? String(ids.simkl) : null; }

  function baseItem(entry, kind) {
    var ids = entry.ids || {};
    return {
      kind: "media", simkl: ids.simkl, kindSimkl: kind,
      type: kind === "movie" ? "movie" : "series",
      imdb: ids.imdb || null, tmdb: ids.tmdb || null,
      title: entry.title, year: entry.year, poster: entry.poster || null, fanart: entry.fanart || null
    };
  }
  function dress(item, d) {
    if (d) {
      item.fanart = item.fanart || d.fanart;
      item.poster = item.poster || d.poster;
      item.synopsis = d.overview || "";
      item.genres = (d.genres || []).slice(0, 2);
      item.runtime = d.runtime;
      if (!item.imdb && d.ids) item.imdb = d.ids.imdb || null;
      if (!item.tmdb && d.ids) item.tmdb = d.ids.tmdb || null;
      if (!item.year) item.year = d.year;
    }
    item.backdrop = item.fanart ? Simkl.image("fanart", item.fanart, "_medium")
      : item.poster ? Simkl.image("posters", item.poster, "_m") : null;
    item.still = item.fanart ? Simkl.image("fanart", item.fanart, "_w")
      : item.poster ? Simkl.image("posters", item.poster, "_w") : null;
    if (item.progress != null && !item.remaining) item.remaining = timeLeft(item.runtime, item.progress);
    return item;
  }

  function fetchMedia() {
    var safe = function (p) { return p.catch(function () { return null; }); };
    return Promise.all([
      safe(Simkl.get("/sync/playback", {}, true)),
      safe(Simkl.get("/sync/all-items/shows/watching", { next_watch_info: "yes" }, true)),
      safe(Simkl.get("/sync/all-items/anime/watching", { next_watch_info: "yes" }, true)),
      safe(Simkl.get("/sync/all-items/all/plantowatch", {}, true))
    ]).then(function (res) {
      var playback = res[0] || [], watchingShows = (res[1] && res[1].shows) || [],
        watchingAnime = (res[2] && res[2].anime) || [], plan = res[3] || {};
      var seen = {};

      // Continue watching, as Nuvio shows it: what you're part-way through, the
      // next episode of shows you're watching, and new episodes of shows you'd
      // caught up on. Newest activity first; nothing untouched for STALE_DAYS.
      var STALE_DAYS = 90, MAX_CONTINUE = 20;
      var cutoff = Date.now() - STALE_DAYS * 24 * 3600 * 1000;
      var when = function (iso) { var t = Date.parse(iso || ""); return isNaN(t) ? 0 : t; };
      var cand = [], paused = {};
      var epNum = function (label) { var m = /S(\d+)\s*E(\d+)/i.exec(label || ""); return m ? +m[1] * 10000 + +m[2] : 0; };
      playback.forEach(function (p) {
        var src = p.movie || p.show || p.anime;
        if (!src) return;
        // 90% in is finished, as Nuvio counts it: the next episode takes over.
        if ((p.progress || 0) >= 90) return;
        var it = baseItem(src, p.movie ? "movie" : p.anime ? "anime" : "tv");
        it.progress = Math.min(1, (p.progress || 0) / 100);
        it.state = "resume";
        if (p.episode) {
          it.episode = "S" + p.episode.season + " E" + p.episode.number;
          it.episodeTitle = p.episode.title || null;
        }
        var c = { it: it, at: when(p.paused_at) };
        if (it.simkl) paused[it.simkl] = c;
        cand.push(c);
      });
      watchingShows.concat(watchingAnime).forEach(function (w) {
        var src = w.show || w.anime;
        if (!src || !w.next_to_watch) return;
        var info = w.next_to_watch_info || {};
        var aired = when(info.date), last = when(w.last_watched_at);
        if (aired && aired > Date.now()) return;            // not out yet
        var it = baseItem(src, w.anime ? "anime" : "tv");
        it.episode = epLabel(w.next_to_watch);
        it.episodeTitle = info.title || null;
        it.state = aired && last && aired > last ? "new" : "next";
        // Part-way through this same episode: keep "resume", at the later of the two times.
        // Moved on past the paused one: the next episode replaces it.
        var p = it.simkl && paused[it.simkl];
        if (p) {
          if (epNum(p.it.episode) >= epNum(it.episode)) { p.at = Math.max(p.at, last); return; }
          p.drop = true;
        }
        // A new episode counts from when it aired, so it rises to the front.
        cand.push({ it: it, at: it.state === "new" ? Math.max(aired, last) : last });
      });
      // Newest first, one per title: a part-watched episode beats "next up".
      cand.sort(function (x, y) { return (y.at - x.at) || ((x.it.state === "resume") ? -1 : 1); });
      var cont = [];
      cand.forEach(function (c) {
        if (c.drop) return;
        var key = idKey({ simkl: c.it.simkl });
        if (!key || seen[key] || cont.length >= MAX_CONTINUE) return;
        if (c.at && c.at < cutoff) return;
        seen[key] = true;
        cont.push(c.it);
      });

      // Watchlist: plan to watch, in a shuffled order that changes every few hours
      // (steady in between, so it doesn't move while you browse). The whole list
      // is shuffled, so titles from deep in it come round too.
      var next = [];
      var planned = [];
      ["movies", "shows", "anime"].forEach(function (k) {
        (plan[k] || []).forEach(function (w) { planned.push({ w: w, k: k }); });
      });
      planned.sort(function (a, b) { return (a.w.added_to_watchlist_at || "") < (b.w.added_to_watchlist_at || "") ? 1 : -1; });
      shuffle(planned, shuffleBucket());
      planned.forEach(function (x) {
          var src = x.w.movie || x.w.show || x.w.anime;
          var key = idKey(src && src.ids);
          if (!key || seen[key]) return;
          seen[key] = true;
          var it = baseItem(src, kindOf(x.k));
          it.note = "On your watchlist";
          next.push(it);
        });
      next = next.slice(0, 16);

      // Details for everything shown, a few at a time.
      var shown = cont.concat(next);
      return Simkl.pool(shown.map(function (it) {
        return function () { return Simkl.detail(it.kindSimkl, it.simkl); };
      }), 4).then(function (details) {
        shown.forEach(function (it, i) { dress(it, details[i]); });

        // Recommended: what SIMKL users pair with the three most recent titles.
        var seeds = [], recs = [];
        shown.forEach(function (it, i) { if (seeds.length < 3 && details[i] && details[i].recs.length) seeds.push({ it: it, d: details[i] }); });
        var round = 0, added = true;
        while (recs.length < 15 && added) {
          added = false;
          seeds.forEach(function (s) {
            var r = s.d.recs[round];
            if (!r) return;
            added = true;
            var key = idKey(r.ids);
            if (!key || seen[key]) return;
            seen[key] = true;
            var it = baseItem(r, kindOf(r.type));
            it.note = "Because you watched " + s.it.title;
            recs.push(it);
          });
          round++;
        }
        return Simkl.pool(recs.map(function (it) {
          return function () { return Simkl.detail(it.kindSimkl, it.simkl); };
        }), 4).then(function (rd) {
          recs.forEach(function (it, i) { dress(it, rd[i]); });
          return { continueWatching: cont, upNext: next, recommended: recs.filter(function (r) { return r.backdrop; }) };
        });
      });
    });
  }

  // Calls cb with what is cached at once, then again with fresh data.
  function media(cb) {
    if (!Simkl.configured()) return setTimeout(function () { cb(null, window.HOMEOS_MOCK); }, 0);
    if (!Simkl.signedIn()) return setTimeout(function () { cb(null, { connect: true, continueWatching: [], upNext: [], recommended: [] }); }, 0);
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(MEDIA_KEY) || "null"); } catch (e) {}
    if (cached && cached.data) cb(null, cached.data);
    // The activity stamp is read before the lists it vouches for, and saved with them.
    var stamp = null;
    activity().then(function (a) { stamp = a; }, function () {}).then(fetchMedia).then(function (data) {
      try { localStorage.setItem(MEDIA_KEY, JSON.stringify({ at: Date.now(), all: stamp, bucket: shuffleBucket(), data: data })); } catch (e) {}
      cb(null, data);
    }).catch(function (err) {
      if (!Simkl.signedIn()) return cb(null, { connect: true, continueWatching: [], upNext: [], recommended: [] });
      if (!cached) cb(err, EMPTY);
    });
  }

  /* ---------- Watchlist shuffle ---------- */
  var SHUFFLE_HOURS = 3;
  function shuffleBucket() { return Math.floor(Date.now() / (SHUFFLE_HOURS * 3600 * 1000)); }
  // Fisher-Yates with a small seeded generator (mulberry32): same seed, same order.
  function shuffle(list, seed) {
    var a = seed >>> 0;
    var rand = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), x = list[i];
      list[i] = list[j]; list[j] = x;
    }
    return list;
  }

  /* ---------- Has anything changed on SIMKL? ---------- */
  // SIMKL's /sync/activities: one timestamp ("all") that moves whenever anything
  // in the account does. The cheapest call in its API, made for polling.
  function activity() {
    return Simkl.get("/sync/activities", {}, true).then(function (a) { return (a && a.all) || null; });
  }
  // cb(true) when SIMKL has moved on since the lists on screen were fetched.
  function changed(cb) {
    if (!Simkl.configured() || !Simkl.signedIn()) return cb(false);
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(MEDIA_KEY) || "null"); } catch (e) {}
    // Time for a new Watchlist order counts as a change too.
    if (cached && cached.bucket !== shuffleBucket()) return cb(true);
    activity().then(function (now) { cb(!!now && (!cached || cached.all !== now)); }, function () { cb(false); });
  }

  return { apps: apps, media: media, changed: changed };
})();
