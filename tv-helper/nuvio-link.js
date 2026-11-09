/*
 * HomeOS link helper.
 * Opens Nuvio on a title, or BBC iPlayer on an episode, for the HomeOS launcher,
 * which webOS will not let open apps with launch parameters itself. Listens on
 * 127.0.0.1 only, so only the TV can reach it, and only ever launches those two
 * apps with links of exactly those shapes, or a card one of the TV's apps is
 * publishing for LG's Home right now (with that card's own launch parameters).
 *
 * Install: /var/lib/homeos/nuvio-link.js, started by /var/lib/webosbrew/init.d/60-homeos.
 * Remove:  delete both, then reboot (or kill the node process).
 */
var http = require("http");
var crypto = require("crypto");
var execFile = require("child_process").execFile;

var PORT = 8097;
var NUVIO = "space.nuvio.webos";
var LINK = /^nuvio:\/\/(imdb|tmdb)\/(movie|series)\/(tt\d{5,10}|\d{1,9})$/;
var IPLAYER = "bbc.iplayer.3.0";
var PID = /^[a-z0-9]{8}$/;
// The link LG's own catalogue gives iPlayer for an episode.
function iplayerLink(pid) {
  return "https://www.live.bbctvapps.co.uk/tap/iplayer?deeplink=tv/playback/urn:bbc:iplayer:episode:" + pid +
    "&campaign=catalogue&medium=referral&origin=search&partner=com.lg";
}
var CARD = /^[0-9a-f]{16}$/;
// The cards the TV's apps publish for LG's Home; ids as Glasshouse makes them.
function findCard(id, cb) {
  execFile("/usr/bin/luna-send", ["-n", "1", "-w", "8000", "luna://com.webos.service.applicationmanager/getAllContents", "{}"],
    { timeout: 10000, maxBuffer: 8 * 1024 * 1024 }, function (err, out) {
      var r = {}, hit = null;
      try { r = JSON.parse(String(out)); } catch (e) {}
      (r.allContents || []).forEach(function (lp) {
        (lp.contents || []).forEach(function (c) {
          var oc = c && c.onClick;
          if (hit || !c || c.type !== "content" || !oc || !oc.targetAppId || typeof oc.contentId !== "string" || !oc.contentId) return;
          var cid = crypto.createHash("md5").update(oc.targetAppId + "\n" + oc.contentId).digest("hex").slice(0, 16);
          if (cid === id) hit = { app: oc.targetAppId, params: oc.launchParam || { contentTarget: oc.contentId } };
        });
      });
      cb(hit);
    });
}
function luna(uri, payload, cb) {
  execFile("/usr/bin/luna-send", ["-n", "1", "-w", "5000", uri, JSON.stringify(payload)], { timeout: 8000 }, function (err, out) {
    var r = {};
    try { r = JSON.parse(String(out).trim()); } catch (e) {}
    cb(r);
  });
}
var ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
var last = 0;

function reply(req, res, code, body) {
  var origin = req.headers.origin;
  var headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (origin && ORIGIN.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Allow-Private-Network"] = "true";
    headers["Vary"] = "Origin";
  }
  res.writeHead(code, headers);
  res.end(body === undefined ? "" : JSON.stringify(body));
}

http.createServer(function (req, res) {
  if (req.method === "OPTIONS") return reply(req, res, 204);
  if (req.method === "GET" && req.url === "/health") return reply(req, res, 200, { ok: true, apps: [NUVIO, IPLAYER] });
  if (req.method !== "POST" || req.url !== "/open") return reply(req, res, 404, { ok: false, error: "not found" });

  var data = "";
  req.on("data", function (c) { data += c; if (data.length > 2048) req.destroy(); });
  req.on("end", function () {
    var body = {};
    try { body = JSON.parse(data) || {}; } catch (e) {}
    var app, target, params;
    if (body.app === "card") {
      if (typeof body.card !== "string" || !CARD.test(body.card)) return reply(req, res, 400, { ok: false, error: "bad card" });
      if (Date.now() - last < 800) return reply(req, res, 429, { ok: false, error: "too soon" });
      last = Date.now();
      return findCard(body.card, function (hit) {
        if (!hit) return reply(req, res, 404, { ok: false, error: "no such card" });
        // Apps ignore a link when already running in the background, so they start afresh.
        luna("luna://com.webos.applicationManager/closeByAppId", { id: hit.app }, function () {
          setTimeout(function () {
            luna("luna://com.webos.applicationManager/launch", { id: hit.app, params: hit.params }, function (r) {
              console.log(new Date().toISOString() + " card " + hit.app + " " + JSON.stringify(hit.params).slice(0, 200) + " -> " + (r.returnValue ? "ok" : "failed"));
              reply(req, res, r.returnValue ? 200 : 502, { ok: !!r.returnValue, app: hit.app, error: r.errorText });
            });
          }, 700);
        });
      });
    }
    if (body.app === "iplayer") {
      if (typeof body.pid !== "string" || !PID.test(body.pid)) return reply(req, res, 400, { ok: false, error: "bad pid" });
      app = IPLAYER; target = iplayerLink(body.pid);
    } else {
      if (typeof body.link !== "string" || !LINK.test(body.link)) return reply(req, res, 400, { ok: false, error: "bad link" });
      app = NUVIO; target = body.link;
    }
    if (Date.now() - last < 800) return reply(req, res, 429, { ok: false, error: "too soon" });
    last = Date.now();
    var go = function () {
      luna("luna://com.webos.applicationManager/launch", { id: app, params: { contentTarget: target } }, function (r) {
        console.log(new Date().toISOString() + " open " + app + " " + target + " -> " + (r.returnValue ? "ok" : "failed"));
        reply(req, res, r.returnValue ? 200 : 502, { ok: !!r.returnValue, error: r.errorText });
      });
    };
    // iPlayer ignores a link when it is already running in the background, so it starts afresh.
    if (app === IPLAYER) luna("luna://com.webos.applicationManager/closeByAppId", { id: IPLAYER }, function () { setTimeout(go, 700); });
    else go();
  });
}).listen(PORT, "127.0.0.1", function () {
  console.log(new Date().toISOString() + " nuvio-link listening on 127.0.0.1:" + PORT);
});
