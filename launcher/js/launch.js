/* Opening things. Media opens in Nuvio on the title itself, through the
   HomeOS helper on the TV (webOS ignores this page's own service calls);
   without the helper it falls back to opening Nuvio. */
window.Launch = (function () {
  var NUVIO_ID = "space.nuvio.webos";
  var cfg = window.HOMEOS_CONFIG || {};

  /* Which app titles open in. Nuvio TV opens on the title; Nuvio Legacy has no
     title links on webOS yet (its docs: "webOS: not wired"), so it opens as an app. */
  var PLAYERS = [
    { key: "nuvio", id: NUVIO_ID, name: "Nuvio TV", titles: true },
    { key: "legacy", id: "space.nuvio.native.legacy", name: "Nuvio Legacy", titles: false }
  ];
  var PLAYER_KEY = "homeos.player";
  function player() {
    var k = null;
    try { k = localStorage.getItem(PLAYER_KEY); } catch (e) {}
    k = k || cfg.PLAYER || "nuvio";
    for (var i = 0; i < PLAYERS.length; i++) if (PLAYERS[i].key === k) return PLAYERS[i];
    return PLAYERS[0];
  }
  function nextPlayer() {
    var at = PLAYERS.indexOf(player());
    var p = PLAYERS[(at + 1) % PLAYERS.length];
    try { localStorage.setItem(PLAYER_KEY, p.key); } catch (e) {}
    return p;
  }

  function beacon(what, data) {
    if (!cfg.DEBUG_BEACON) return;
    var q = "what=" + encodeURIComponent(what) + "&data=" + encodeURIComponent(JSON.stringify(data)).slice(0, 1500);
    (new Image()).src = cfg.DEBUG_BEACON + "?" + q + "&t=" + Date.now();
  }

  function nuvioLink(item) {
    if (item.imdb) return "nuvio://imdb/" + item.type + "/" + item.imdb;
    if (item.tmdb) return "nuvio://tmdb/" + item.type + "/" + item.tmdb;
    return null;
  }

  // The HomeOS helper on the TV (tv-helper/nuvio-link.js) opens Nuvio on the title.
  var HELPER = cfg.NUVIO_HELPER || "http://127.0.0.1:8097";
  function helperOpen(link, cb) {
    var done = false;
    var finish = function (err) { if (!done) { done = true; cb(err); } };
    setTimeout(function () { finish(new Error("helper timeout")); }, 2000);
    fetch(HELPER + "/open", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: link })
    }).then(function (r) { return r.json(); })
      .then(function (j) { finish(j && j.ok ? null : new Error((j && j.error) || "helper refused")); })
      .catch(function (e) { finish(e); });
  }

  function media(item, cb) {
    var p = player();
    if (!p.titles) return Glasshouse.open("app", p.id, function (e) { if (cb) cb(e, { via: "app" }); });
    var link = nuvioLink(item);
    if (!link) return Glasshouse.open("app", NUVIO_ID, cb);
    helperOpen(link, function (err) {
      beacon("launch", { link: link, err: err && err.message });
      if (!err) return cb && cb(null, { via: "deeplink", link: link });
      Glasshouse.open("app", NUVIO_ID, function (e2) { if (cb) cb(e2, { via: "app", link: link }); });
    });
  }

  // A title in Nuvio TV whichever player is chosen (its own hero's titles).
  function openNuvio(item, cb) {
    var link = nuvioLink(item);
    if (!link) return Glasshouse.open("app", NUVIO_ID, cb);
    helperOpen(link, function (err) {
      if (!err) return cb && cb(null);
      Glasshouse.open("app", NUVIO_ID, function (e2) { if (cb) cb(e2); });
    });
  }

  function app(item, cb) { Glasshouse.open("app", item.id, cb); }
  function input(item, cb) { Glasshouse.open("input", item.id, cb); }

  // Start-up probe, only with DEBUG_BEACON set.
  if (cfg.DEBUG_BEACON) {
    setTimeout(function () {
      fetch(HELPER + "/health").then(function (r) { return r.json(); })
        .then(function (j) { beacon("helper", j); }, function (e) { beacon("helper", { err: String(e) }); });
    }, 1500);
  }

  return { media: media, app: app, input: input, nuvioLink: nuvioLink, player: player, nextPlayer: nextPlayer, openNuvio: openNuvio };
})();
