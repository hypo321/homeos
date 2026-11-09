/* What an app's hero shows when the app is focused.
   1. The app's own cards: the titles each app publishes for LG's Home, which
      Glasshouse lists (its Recommended setting) and can open in the app.
   2. Otherwise, shows trending on the app's network, from SIMKL's public
      trending lists (data.simkl.in), fetched at most once a day. */
window.Featured = (function () {
  var LISTS = ["https://data.simkl.in/discover/trending/tv/month_500.json",
               "https://data.simkl.in/discover/trending/tv/week_500.json"];
  // Popular this week, for Nuvio's hero: series and films alternately.
  var POPULAR = { series: "https://data.simkl.in/discover/trending/tv/week_100.json",
                  movie: "https://data.simkl.in/discover/trending/movies/week_100.json" };
  var NUVIO_APPS = ["space.nuvio.webos", "space.nuvio.native.legacy"], POPULAR_EACH = 8;
  var KEY = "homeos.featured2", TTL = 24 * 3600 * 1000, PER_APP = 8;
  var CARDS_TTL = 15 * 60 * 1000, MAX_CARDS = 12;

  // App -> the networks whose shows it carries (null: cards only).
  var APPS = [
    { id: "bbc.iplayer.3.0", name: "BBC iPlayer", net: /^BBC (One|Two|Three|Four|Scotland|Alba)\b|^CBBC$|^CBeebies$/ },
    { id: "com.fvp.ch4", name: "Channel 4", net: /^(Channel 4|E4|More4|Film4)$/ },
    { id: "com.fvp.itv", name: "ITVX", net: /^(ITV|ITV1|ITV2|ITV3|ITV4|ITVX|ITVBe)$/ },
    { id: "demand5", name: "5", net: /^(5|Channel 5|5Star|5USA)$/ },
    { id: "com.disney.disneyplus-prod", name: "Disney+", net: /^Disney\+$/ },
    { id: "amazon", name: "Prime Video", net: /^(Prime Video|Amazon( Prime Video| Freevee)?)$/ },
    { id: "youtube.leanback.v4", name: "YouTube", net: null }
  ];
  function appInfo(appId) {
    for (var i = 0; i < APPS.length; i++) if (APPS[i].id === appId) return APPS[i];
    return null;
  }

  /* ---------- 1. App cards, through Glasshouse ---------- */
  var cards = {}, cardsAt = 0, cardsLoading = false;

  // Each image service's own way of asking for a backdrop-sized picture.
  function bigImage(url) {
    if (!url) return null;
    if (/img\.freeviewplay\.net/.test(url)) return url.replace(/([?&])w=\d+/, "$1w=1920");
    if (/bamgrid\.com/.test(url)) return url.replace(/scale\?width=\d+.*$/, "scale?width=1920&format=jpeg&quality=85");
    if (/images-(eu|na)\.ssl-images-amazon\.com/.test(url)) return url.replace(/\._UR\d+,\d+_\.jpg$/, "._UR1920,1080_.jpg");
    if (/i\.ytimg\.com\/vi\/[^/]+\//.test(url)) return url.replace(/\/vi\/([^/]+)\/.*$/, "/vi/$1/maxresdefault.jpg");
    return url;
  }
  // "This City Is Ours, Series 2: Episode 1" -> title + subtitle.
  function splitTitle(t) {
    var m = /^(.*?),\s*((?:Series|Season|Episode|Part|Specials?)\b.*)$/i.exec(t || "");
    return m ? { title: m[1], subtitle: m[2] } : { title: t, subtitle: "" };
  }

  function refreshCards() {
    if (cardsLoading || Glasshouse.preview || Date.now() - cardsAt < CARDS_TTL) return;
    cardsLoading = true;
    fetch("/api/home/catalogue").then(function (r) { return r.json(); }).then(function (d) {
      cardsLoading = false;
      var list = d && d.recommended;
      if (!list || !list.length) return;
      var out = {};
      list.forEach(function (c) {
        var info = appInfo(c.app);
        if (!info || !c.image) return;
        out[c.app] = out[c.app] || [];
        if (out[c.app].length >= MAX_CARDS) return;
        var tt = splitTitle(c.title);
        out[c.app].push({
          source: "card", cardId: c.id, app: c.app, title: tt.title, subtitle: tt.subtitle,
          eyebrow: c.category ? c.category + " on " + info.name : "On " + info.name,
          image: bigImage(c.image), overview: ""
        });
      });
      cards = out; cardsAt = Date.now();
    }).catch(function () { cardsLoading = false; });
  }

  // Opens a card in its app. The HomeOS helper launches it with the card's own
  // launch parameters (Freeview Play apps need their contentType) after closing
  // the app; without the helper, Glasshouse opens it with the link alone.
  var HELPER = (window.HOMEOS_CONFIG || {}).NUVIO_HELPER || "http://127.0.0.1:8097";
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || "refused"); return j; });
  }
  function openCard(show, cb) {
    post(HELPER + "/open", { app: "card", card: show.cardId })
      .catch(function () { return post("/api/home/open", { kind: "rec", id: show.cardId }); })
      .then(function () { cb(null); }, cb);
  }

  /* ---------- 2. SIMKL trending, by network ---------- */
  var byApp = {}, freshAt = 0, loading = false;
  try {
    var c = JSON.parse(localStorage.getItem(KEY) || "null");
    if (c && c.byApp) { byApp = c.byApp; freshAt = c.at || 0; }
  } catch (e) {}

  function slim(x, info) {
    var ov = String(x.overview || "");
    if (ov.length > 320) ov = ov.slice(0, 317).replace(/\s+\S*$/, "") + "…";
    var m = /(\d{4})/.exec(x.release_date || "");
    return {
      source: "trend", title: x.title, year: m ? +m[1] : null, overview: ov, genres: (x.genres || []).slice(0, 2),
      fanart: x.fanart, simkl: x.ids && x.ids.simkl_id, imdb: x.ids && x.ids.imdb,
      airing: x.status === "airing", eyebrow: "Trending on " + info.name
    };
  }

  function build(lists) {
    var out = {}, seen = {};
    APPS.forEach(function (a) { out[a.id] = []; });
    lists.forEach(function (list) {
      (list || []).forEach(function (x) {
        if (!x || !x.fanart || !x.ids || seen[x.ids.simkl_id]) return;
        for (var i = 0; i < APPS.length; i++) {
          if (APPS[i].net && APPS[i].net.test(x.network || "")) {
            seen[x.ids.simkl_id] = true;
            if (out[APPS[i].id].length < PER_APP * 2) out[APPS[i].id].push(slim(x, APPS[i]));
            return;
          }
        }
      });
    });
    // Shows on air now first, then trending order.
    APPS.forEach(function (a) {
      out[a.id] = out[a.id].map(function (s, i) { return { s: s, i: i }; })
        .sort(function (p, q) { return (q.s.airing - p.s.airing) || (p.i - q.i); })
        .slice(0, PER_APP).map(function (p) { return p.s; });
    });
    return out;
  }

  function popular(series, films) {
    var pick = function (list, type) {
      return (list || []).filter(function (x) { return x && x.fanart && x.ids && (x.ids.imdb || x.ids.tmdb); })
        .slice(0, POPULAR_EACH).map(function (x) {
          var p = slim(x, { name: "Nuvio" });
          p.source = "popular"; p.type = type; p.tmdb = x.ids.tmdb || null;
          p.eyebrow = "Popular this week  ·  " + (type === "movie" ? "Film" : "Series");
          return p;
        });
    };
    var a = pick(series, "series"), b = pick(films, "movie"), out = [];
    for (var i = 0; i < Math.max(a.length, b.length); i++) { if (b[i]) out.push(b[i]); if (a[i]) out.push(a[i]); }
    return out;
  }

  // One retry: big list downloads are sometimes reset on the first try.
  var get1 = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
  var get = function (u) {
    return get1(u).catch(function () {
      return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return get1(u); });
    }).catch(function () { return []; });
  };
  function refreshTrending() {
    if (loading || Date.now() - freshAt < TTL) return;
    loading = true;
    Promise.all(LISTS.map(get).concat([get(POPULAR.series), get(POPULAR.movie)])).then(function (all) {
      var lists = all.slice(0, LISTS.length);
      var b = build(lists);
      var pop = popular(all[LISTS.length], all[LISTS.length + 1]);
      NUVIO_APPS.forEach(function (id) { b[id] = pop; });
      loading = false;
      var any = Object.keys(b).some(function (k) { return b[k].length; });
      if (!any) return;
      byApp = b;
      // A list that didn't arrive is tried again in 10 minutes, not tomorrow.
      var partial = all.some(function (l) { return !l || !l.length; });
      freshAt = partial ? Date.now() - TTL + 10 * 60 * 1000 : Date.now();
      try { localStorage.setItem(KEY, JSON.stringify({ at: freshAt, byApp: byApp })); } catch (e) {}
    });
  }

  /* ---------- Shared ---------- */
  function refresh() { refreshCards(); refreshTrending(); }
  function name(appId) { var a = appInfo(appId); return a ? a.name : null; }
  // The app's own cards when it has some, else trending shows from its network.
  function forApp(appId) { return (cards[appId] && cards[appId].length) ? cards[appId] : (byApp[appId] || []); }

  refresh();
  return { forApp: forApp, name: name, refresh: refresh, openCard: openCard };
})();
