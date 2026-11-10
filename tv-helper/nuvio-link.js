/*
 * HomeOS link helper.
 * Opens Nuvio on a title, or BBC iPlayer on an episode, for the HomeOS launcher,
 * which webOS will not let open apps with launch parameters itself. Listens on
 * 127.0.0.1 only, so only the TV can reach it, and only ever launches those two
 * apps with links of exactly those shapes, or a card one of the TV's apps is
 * publishing for LG's Home right now (with that card's own launch parameters).
 *
 * It can also open Nuvio when the TV is switched on (a setting the launcher changes).
 *
 * Install: /var/lib/homeos/nuvio-link.js, started by /var/lib/webosbrew/init.d/60-homeos.
 * Remove:  delete both, then reboot (or kill the node process).
 */
var http = require("http");
var crypto = require("crypto");
var fs = require("fs");
var os = require("os");
var execFile = require("child_process").execFile;
var spawn = require("child_process").spawn;

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
/* ---------- Start with Nuvio ---------- */
// When the TV is switched on with the remote (or its own button) from standby,
// or starts up, onto the Home screen, open the chosen Nuvio. Not when it came on
// into an app or input, was woken by another device, or only the screen was off.
var SETTINGS = "/var/lib/homeos/settings.json";
var START_APPS = [NUVIO, "space.nuvio.native.legacy"];
var HOMES = ["com.webos.app.home", "com.tvweb.dashboard"];
var settings = { startApp: null };
try { settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8")) || settings; } catch (e) {}
function saveSettings() {
  try { fs.writeFileSync(SETTINGS + ".tmp", JSON.stringify(settings)); fs.renameSync(SETTINGS + ".tmp", SETTINGS); } catch (e) {}
}
function log(s) { console.log(new Date().toISOString() + " " + s); }

var OFF_STATES = { "Suspend": 1, "Active Standby": 1, "Power Off": 1, "Init": 1 };
var powerState = null;
function onPowerState(state) {
  var was = powerState;
  powerState = state;
  if (state !== "Active" || was === "Active") return;
  // From standby, or the first report just after the TV itself started (not
  // just this helper: restarting it on a TV that's on must not open anything).
  var poweredOn = was ? !!OFF_STATES[was] : os.uptime() < 180;
  if (!poweredOn || !settings.startApp) return;
  // Only when someone switched it on (the remote, or the TV's own button), not
  // an HDMI device over CEC, a cast, a timer or LG's overnight updates.
  luna("luna://com.webos.service.tvpower/power/getPowerOnReason", {}, function (r) {
    log("power " + (was || "boot") + " -> Active, reason " + r.reason);
    if (BY_HAND.indexOf(r.reason) >= 0) startAppSoon(!was);
  });
}
var BY_HAND = ["remoteKey", "localKey"];
// Give Home a moment to come up (much longer after a cold start), then open
// the app only if Home is what's on screen.
function startAppSoon(coldBoot) {
  var tries = 0;
  setTimeout(function check() {
    luna("luna://com.webos.applicationManager/getForegroundAppInfo", {}, function (r) {
      if (powerState !== "Active") return;
      if (HOMES.indexOf(r.appId) < 0 && ++tries < (coldBoot ? 15 : 3)) return setTimeout(check, 3000);
      if (HOMES.indexOf(r.appId) < 0) return log("start skipped, on " + r.appId);
      luna("luna://com.webos.applicationManager/launch", { id: settings.startApp }, function (l) {
        log("start " + settings.startApp + " -> " + (l.returnValue ? "ok" : "failed"));
      });
    });
  }, 2500);
}
// A long-lived subscription; luna-send -i prints one JSON line per change.
function watchPower() {
  var p = spawn("/usr/bin/luna-send", ["-i", "luna://com.webos.service.tvpower/power/getPowerState", '{"subscribe":true}']);
  var buf = "";
  p.stdout.on("data", function (d) {
    buf += d;
    var lines = buf.split("\n");
    buf = lines.pop();
    lines.forEach(function (l) {
      var r = null;
      try { r = JSON.parse(l); } catch (e) {}
      if (r && r.state) onPowerState(r.state);
    });
  });
  p.on("exit", function () { if (watcher === p) setTimeout(watchPower, 10000); });
  p.on("error", function () {});
  watcher = p;
}
var watcher = null;
// Don't leave the subscription behind when the helper is stopped.
["SIGTERM", "SIGINT"].forEach(function (sig) {
  process.on(sig, function () { if (watcher) { var w = watcher; watcher = null; w.kill(); } process.exit(0); });
});
watchPower();

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
  if (req.method === "GET" && req.url === "/settings") return reply(req, res, 200, { ok: true, startApp: settings.startApp || null });
  if (req.method === "POST" && req.url === "/settings") {
    var sdata = "";
    req.on("data", function (c) { sdata += c; if (sdata.length > 512) req.destroy(); });
    return req.on("end", function () {
      var b = {};
      try { b = JSON.parse(sdata) || {}; } catch (e) {}
      if (b.startApp !== null && START_APPS.indexOf(b.startApp) < 0) return reply(req, res, 400, { ok: false, error: "bad app" });
      settings.startApp = b.startApp;
      saveSettings();
      log("startApp " + settings.startApp);
      reply(req, res, 200, { ok: true, startApp: settings.startApp });
    });
  }
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
