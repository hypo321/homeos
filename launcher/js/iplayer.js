/* "Watch on iPlayer": finds a SIMKL title in BBC iPlayer's own catalogue (iBL)
   and opens it on the right episode through the HomeOS helper on the TV.
   Without the helper it falls back to Glasshouse's search, which opens at S1 E1. */
window.IPlayer = (function () {
  var APP = "bbc.iplayer.3.0";
  var IBL = "https://ibl.api.bbc.co.uk/ibl/v1";
  var KEY = "homeos.iplayer2.";
  var YES_TTL = 24 * 3600 * 1000, NO_TTL = 24 * 3600 * 1000;
  var cfg = window.HOMEOS_CONFIG || {};
  var HELPER = cfg.NUVIO_HELPER || "http://127.0.0.1:8097";

  function enabled() { return !Glasshouse.preview; }
  function words(s) { return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim(); }
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error("iBL " + r.status); return r.json(); }); }
  function yearOf(s) { var m = /(\d{4})/.exec(s || ""); return m ? +m[1] : null; }

  // "Series 2: 3. Title", "Series 1: Episode 3", "Season 2: 7. Title" -> {s, e}
  function numbering(sub) {
    var m = /^(?:Series|Season)\s+(\d+):\s*(?:Episode\s+)?(\d+)\b/i.exec(sub || "");
    return m ? { s: +m[1], e: +m[2] } : null;
  }
  function wanted(item) {
    var m = /^S(\d+)\s*E(\d+)$/i.exec(item.episode || "");
    return m ? { s: +m[1], e: +m[2] } : null;
  }

  function findProgramme(item) {
    var url = IBL + "/new-search?q=" + encodeURIComponent(item.title) + "&rights=tv&availability=available&lang=en";
    return getJSON(url).then(function (d) {
      var res = (d.new_search && d.new_search.results) || [];
      var want = words(item.title), film = item.type === "movie";
      for (var i = 0; i < res.length; i++) {
        var r = res[i];
        if (words(r.title) !== want) continue;
        if (film && r.type === "episode") return { film: r.id };
        if (!film && r.type === "programme") return { programme: r.id };
      }
      return null;
    });
  }

  function episodes(programme) {
    return getJSON(IBL + "/programmes/" + programme + "/episodes?rights=tv&availability=available&per_page=200&lang=en")
      .then(function (d) {
        return ((d.programme_episodes && d.programme_episodes.elements) || []).map(function (e) {
          var n = numbering(e.subtitle);
          return { pid: e.id, s: n ? n.s : null, e: n ? n.e : null, year: yearOf(e.release_date) };
        });
      });
  }

  // Resolve to {pid, label} for this item, or null when iPlayer hasn't got it.
  function resolve(item) {
    return findProgramme(item).then(function (hit) {
      if (!hit) return null;
      if (hit.film) return { pid: hit.film, label: "Watch on iPlayer" };
      return episodes(hit.programme).then(function (eps) {
        if (!eps.length) return null;
        // A same-named show from before this one began is a different show (Ghosts UK vs US).
        var years = eps.map(function (e) { return e.year; }).filter(Boolean);
        var oldest = years.length ? Math.min.apply(null, years) : null;
        if (item.year && oldest && oldest < item.year - 1) return null;
        var w = wanted(item), pick = null;
        if (w) eps.forEach(function (e) { if (!pick && e.s === w.s && e.e === w.e) pick = e; });
        if (pick) return { pid: pick.pid, label: "Watch S" + pick.s + " E" + pick.e + " on iPlayer" };
        var numbered = eps.filter(function (e) { return e.s; }).sort(function (a, b) { return a.s - b.s || a.e - b.e; });
        var first = numbered[0] || eps[eps.length - 1];
        return { pid: first.pid, label: first.s ? "Watch from S" + first.s + " E" + first.e + " on iPlayer" : "Watch on iPlayer" };
      });
    });
  }

  function cacheKey(item) { return KEY + (item.simkl || words(item.title)) + "|" + (item.episode || ""); }
  function cached(item) {
    try {
      var c = JSON.parse(localStorage.getItem(cacheKey(item)) || "null");
      if (c && Date.now() - c.at < (c.hit ? YES_TTL : NO_TTL)) return c.hit || false;
    } catch (e) {}
    return null;
  }

  // cb({pid, label}) when iPlayer has it, cb(null) otherwise.
  function lookup(item, cb) {
    if (!enabled() || !item || item.kind !== "media") return cb(null);
    var c = cached(item);
    if (c !== null) return cb(c || null);
    resolve(item).then(function (hit) {
      try { localStorage.setItem(cacheKey(item), JSON.stringify({ at: Date.now(), hit: hit })); } catch (e) {}
      cb(hit);
    }, function () { cb(null); });
  }

  function viaHelper(pid) {
    return fetch(HELPER + "/open", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app: "iplayer", pid: pid })
    }).then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || "helper refused"); });
  }

  // Fallback without the helper: Glasshouse's search opens the series at S1 E1.
  function viaGlasshouse(item) {
    var post = function (path, body) {
      return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); }).then(function (j) { if (!j || j.ok === false) throw new Error("refused"); return j; });
    };
    return post("/api/home/search", { query: item.title }).then(function (j) {
      var want = words(item.title), hit = null;
      (j.results || []).forEach(function (r) {
        if (!hit && words(r.title) === want && (r.apps || []).some(function (a) { return a.id === APP; })) hit = r;
      });
      if (!hit) throw new Error("not found");
      return post("/api/home/search/open", { id: hit.id, app: APP });
    });
  }

  function open(item, hit, cb) {
    viaHelper(hit.pid).catch(function () { return viaGlasshouse(item); })
      .then(function () { cb(null); }, function (err) { Glasshouse.open("app", APP, function () {}); cb(err); });
  }

  return { lookup: lookup, open: open, cached: cached, _resolve: resolve };
})();
