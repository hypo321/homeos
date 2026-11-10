/* HomeOS launcher: rows, focus, hero, backdrop, clock. */
(function () {
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, BACKSPACE: 8, ESC: 27, BLUE: 406, B: 66, RED: 403, R: 82, YELLOW: 405, Y: 89 };
  var $ = function (id) { return document.getElementById(id); };

  var state = { rows: [], r: 0, covered: false, lastKey: 0 };
  var keyTimes = [];
  // Debug trail, only with DEBUG_BEACON set in config.js.
  var BEACON = (window.HOMEOS_CONFIG || {}).DEBUG_BEACON, t0 = Date.now();
  function hlog(what, data) {
    if (!BEACON) return;
    (new Image()).src = BEACON + "?ev=" + encodeURIComponent(what) + "&t=" + (Date.now() - t0) +
      "&d=" + encodeURIComponent(JSON.stringify(data || {})).slice(0, 600) + "&n=" + Math.random();
  }
  hlog("load", { visible: document.visibilityState, w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio, sw: screen.width, sh: screen.height });
  // Debug only: smoothness report every 10 s (frames, slow frames over 34 ms, worst).
  if (BEACON) (function () {
    var last = 0, frames = 0, slow = 0, worst = 0, since = performance.now();
    (function frame(t) {
      if (last) { var gap = t - last; frames++; if (gap > 34) slow++; if (gap > worst) worst = gap; }
      last = t;
      if (t - since > 10000) { hlog("frames", { frames: frames, slow: slow, worst: Math.round(worst), keyMs: keyTimes.splice(0) }); frames = slow = worst = 0; since = t; }
      requestAnimationFrame(frame);
    })(0);
  })();
  var els = {
    rows: $("rows"), hero: $("hero"), eyebrow: $("heroEyebrow"), title: $("heroTitle"),
    meta: $("heroMeta"), synopsis: $("heroSynopsis"), action: $("heroAction"),
    actionLabel: $("heroActionLabel"), bdA: $("bdA"), bdB: $("bdB"),
    time: $("time"), toast: $("toast"),
    hint: $("playerHint"), hintWrap: $("playerHintWrap"), iplayerWrap: $("iplayerWrap")
  };

  /* ---------- Time of day ---------- */
  function timeOfDay(d) {
    var h = d.getHours();
    if (h >= 5 && h < 12) return "morning";
    if (h >= 12 && h < 17) return "day";
    if (h >= 17 && h < 22) return "evening";
    return "night";
  }
  var clockTimer = null;
  function tick() {
    var d = new Date();
    els.time.textContent = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    var tod = timeOfDay(d);
    var cls = "tod-" + tod;
    if (!document.body.classList.contains(cls)) {
      document.body.className = document.body.className.replace(/\btod-\w+/g, "").trim() + " " + cls;
      relabelRows();
    }
  }
  function startClock() {
    stopClock(); tick();
    clockTimer = setTimeout(function loop() { tick(); clockTimer = setTimeout(loop, 60000 - Date.now() % 60000 + 50); },
      60000 - Date.now() % 60000 + 50);
  }
  function stopClock() { if (clockTimer) clearTimeout(clockTimer); clockTimer = null; }
  function upNextTitle() {
    var tod = timeOfDay(new Date());
    return "Watchlist";
  }
  function relabelRows() {
    state.rows.forEach(function (row) {
      if (row.id === "upnext" && row.titleEl) row.titleEl.textContent = upNextTitle();
    });
  }

  /* ---------- Building rows ---------- */
  function tileFor(item, rowId) {
    var t = document.createElement("div");
    var art = document.createElement("div");
    art.className = "art";
    t.appendChild(art);
    if (item.kind === "media") {
      t.className = "tile media";
      if (item.still) art.style.backgroundImage = "url('" + item.still + "')";
      var label = document.createElement("div");
      label.className = "label";
      label.textContent = item.title;
      art.appendChild(label);
      if (rowId === "continue" && (item.state === "new" || item.state === "next")) {
        var tag = document.createElement("div");
        tag.className = "tag" + (item.state === "new" ? " new" : "");
        tag.textContent = item.state === "new" ? "New episode" : "Next up";
        art.appendChild(tag);
      }
      if (rowId === "continue" && item.episode) {
        var ep = document.createElement("div");
        ep.className = "ep";
        ep.textContent = item.episode;
        art.appendChild(ep);
      }
      if (rowId === "continue" && item.progress) {
        t.classList.add("has-progress");
        var p = document.createElement("div");
        p.className = "progress";
        p.innerHTML = "<i style='width:" + Math.round(item.progress * 100) + "%'></i>";
        art.appendChild(p);
      }
    } else if (item.kind === "connect") {
      t.className = "tile media connect";
      var cm = document.createElement("div");
      cm.className = "monogram";
      cm.textContent = "Connect SIMKL";
      art.appendChild(cm);
    } else {
      var isApp = item.kind === "app";
      t.className = "tile app" + (isApp ? " icon" : " input");
      art.style.backgroundColor = item.color;
      if (isApp) {
        t.dataset.app = item.id;
        if (item.id === startState()) t.classList.add("starts");
        var power = document.createElement("div");
        power.className = "power";
        power.innerHTML = POWER_SVG;
        art.appendChild(power);
      }
      var monogram = function () {
        var mono = document.createElement("div");
        mono.className = "monogram";
        // Apps without an icon get initials in their square; inputs keep their name.
        mono.textContent = isApp ? initials(item.title) : item.title;
        art.appendChild(mono);
      };
      if (item.icon) {
        var img = document.createElement("img");
        img.alt = "";
        img.onerror = function () { img.remove(); monogram(); };
        img.src = item.icon;
        art.appendChild(img);
      } else monogram();
    }
    return t;
  }

  function initials(title) {
    var w = String(title || "").replace(/[^A-Za-z0-9+ ]/g, " ").trim().split(/\s+/);
    return (w.length > 1 ? w[0].charAt(0) + w[1].charAt(0) : (w[0] || "?").slice(0, 2)).toUpperCase();
  }

  function addRow(id, title, items) {
    if (!items || !items.length) return;
    var rowEl = document.createElement("section");
    rowEl.className = "row";
    var h = document.createElement("h2");
    h.className = "row-title";
    h.textContent = title;
    var track = document.createElement("div");
    track.className = "track";
    var tiles = items.map(function (it) { var t = tileFor(it, id); track.appendChild(t); return t; });
    rowEl.appendChild(h); rowEl.appendChild(track);
    els.rows.appendChild(rowEl);
    state.rows.push({ id: id, items: items, el: rowEl, titleEl: h, track: track, tiles: tiles, i: 0 });
  }

  function build(media, apps) {
    els.rows.innerHTML = "";
    state.rows = [];
    lastHeroKey = null;
    if (media.connect) addRow("connect", "Your films and shows", [{ kind: "connect", id: "connect", title: "Connect SIMKL" }]);
    addRow("continue", "Continue watching", media.continueWatching);
    addRow("upnext", upNextTitle(), media.upNext);
    addRow("apps", "Your apps", apps.favourites.concat(apps.others));
    addRow("recommended", "Recommended for you", media.recommended);
    addRow("inputs", "Inputs", apps.inputs);
    state.r = 0;
    measure();
    render(true);
    setTimeout(scanBadges, 1500);
  }

  /* ---------- Focus and layout ---------- */
  function current() { var row = state.rows[state.r]; return row ? row.items[row.i] : null; }

  // Rows where focus moves freely instead of staying at the left edge.
  var FREE_ROWS = { apps: true, inputs: true };

  /* Positions are measured once, when rows are built or the screen resizes, so a
     key press only writes classes and transforms: no layout is read while moving. */
  var room = 0;
  function measure() {
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    room = window.innerWidth - 2 * 6.5 * rem;
    state.rows.forEach(function (rw) {
      var first = rw.tiles[0];
      rw.top = rw.el.offsetTop;
      rw.left = rw.tiles.map(function (t) { return t.offsetLeft - first.offsetLeft; });
      rw.width = rw.tiles.map(function (t) { return t.offsetWidth; });
      rw.drawn = null;
    });
  }

  function render(immediate) {
    var row = state.rows[state.r];
    if (!row) return;
    state.rows.forEach(function (rw, ri) {
      if (!rw.tiles.length) return;
      var offset;
      var left = rw.left[rw.i] || 0, right = left + (rw.width[rw.i] || 0);
      if (FREE_ROWS[rw.id]) {
        // Focus moves across the screen; the row scrolls only once it reaches an edge.
        offset = rw.offset || 0;
        if (right - offset > room) offset = right - room;
        if (left < offset) offset = left;
        rw.offset = offset;
      } else offset = left;
      var pos = ri === state.r ? "active" : ri < state.r ? "above" : "below";
      var focusAt = ri === state.r ? rw.i : -1;
      // Only rows whose look has changed are touched.
      var d = rw.drawn;
      if (d && d.pos === pos && d.focusAt === focusAt && d.offset === offset) return;
      if (!d || d.pos !== pos) {
        rw.el.classList.toggle("active", pos === "active");
        rw.el.classList.toggle("above", pos === "above");
        rw.el.classList.toggle("below", pos === "below");
      }
      if (!d || d.focusAt !== focusAt) {
        if (d && d.focusAt >= 0 && rw.tiles[d.focusAt]) rw.tiles[d.focusAt].classList.remove("focus");
        if (focusAt >= 0) rw.tiles[focusAt].classList.add("focus");
      }
      if (!d || d.offset !== offset) {
        for (var ti = 0; ti < rw.tiles.length; ti++) {
          var past = rw.left[ti] < offset - 1;
          if (rw.tiles[ti].classList.contains("past") !== past) rw.tiles[ti].classList.toggle("past", past);
        }
        rw.track.style.transform = "translateX(" + -offset + "px)";
      }
      rw.drawn = { pos: pos, focusAt: focusAt, offset: offset };
    });
    els.rows.style.transform = "translateY(" + -row.top + "px)";
    showHero(current(), row.id, immediate);
  }

  function move(dr, di) {
    if (dr) {
      var nr = Math.max(0, Math.min(state.rows.length - 1, state.r + dr));
      if (nr === state.r) return;
      state.r = nr;
    } else {
      var row = state.rows[state.r];
      // Left from the first app wraps round to the last one.
      if (di < 0 && row.i === 0 && FREE_ROWS[row.id] && row.items.length > 1 && !state.lastWasRepeat) {
        row.i = row.items.length - 1;
        return render(false);
      }
      // Right from the last app wraps round to the first.
      if (di > 0 && row.i === row.items.length - 1 && FREE_ROWS[row.id] && row.items.length > 1 && !state.lastWasRepeat) {
        row.i = 0;
        return render(false);
      }
      var ni = Math.max(0, Math.min(row.items.length - 1, row.i + di));
      if (ni === row.i) return;
      row.i = ni;
    }
    render(false);
  }

  /* ---------- Where focus was ---------- */
  // Kept by identity (row + item), so it survives rows being rebuilt or reordered.
  var FOCUS_KEY = "homeos.focus", FOCUS_TTL = 30 * 60 * 1000, uncoveredAt = 0;
  function itemKey(it) { return it ? it.kind + ":" + (it.id || it.simkl || it.imdb || it.title) : null; }
  function focusNow() {
    var row = state.rows[state.r], it = current();
    return row && it ? { row: row.id, key: itemKey(it), at: Date.now() } : null;
  }
  // Set when the launcher opens something; cleared by any key pressed in the launcher.
  // On this TV Glasshouse's onCovered doesn't fire when an app opens, so this is how
  // the next Home is known to be a return from that app.
  var launchedAt = 0;
  function rememberFocus(launching) {
    var f = focusNow();
    if (launching) launchedAt = Date.now();
    hlog("remember", f);
    if (f) try { localStorage.setItem(FOCUS_KEY, JSON.stringify(f)); } catch (e) {}
    return f;
  }
  function savedFocus() {
    try {
      var f = JSON.parse(localStorage.getItem(FOCUS_KEY) || "null");
      return f && Date.now() - f.at < FOCUS_TTL ? f : null;
    } catch (e) { return null; }
  }
  // Puts focus back on that item; on its row's start if the item has gone.
  function restoreFocus(f) {
    hlog("restore", f);
    if (!f) return false;
    for (var r = 0; r < state.rows.length; r++) {
      if (state.rows[r].id !== f.row) continue;
      var items = state.rows[r].items, at = 0;
      for (var i = 0; i < items.length; i++) if (itemKey(items[i]) === f.key) { at = i; break; }
      state.r = r; state.rows[r].i = at;
      render(true);
      return true;
    }
    return false;
  }

  function goHome() {
    hlog("goHome", focusNow());
    try { localStorage.removeItem(FOCUS_KEY); } catch (e) {}
    state.rows.forEach(function (r) { r.i = 0; r.offset = 0; });
    state.r = 0;
    render(false);
  }

  /* ---------- Hero ---------- */
  var heroTimer = null, lastHeroKey = null;
  function heroContent(item, rowId) {
    if (item.kind === "media") {
      var eyebrow, action;
      if (rowId === "continue") {
        var lead = item.state === "new" ? "New episode" : item.state === "next" ? "Next up" : "Continue watching";
        eyebrow = [lead, item.episode, item.state === "resume" ? item.remaining : null].filter(Boolean).join("  ·  ");
        var verb = item.state === "resume" || !item.state ? "Resume in " : "Play in ";
        action = Launch.player().titles ? verb + Launch.player().name : "Open " + Launch.player().name;
      } else {
        eyebrow = item.note || (rowId === "upnext" ? upNextTitle() : "Recommended");
        action = Launch.player().titles ? "Play in " + Launch.player().name : "Open " + Launch.player().name;
      }
      var meta = [item.year ? String(item.year) : null, item.type === "movie" ? "Film" : "Series"].concat(item.genres || []).filter(Boolean);
      if (item.episodeTitle) meta.unshift(item.episode + " · " + item.episodeTitle);
      return { eyebrow: eyebrow, title: item.title, meta: meta, synopsis: item.synopsis, action: action };
    }
    if (item.kind === "connect") {
      return { eyebrow: "SIMKL", title: "Bring in your films and shows", meta: [],
        synopsis: "Connect your SIMKL account to see what you're part-way through, what's up next and what to watch tonight.",
        action: "Connect" };
    }
    if (item.kind === "input") {
      return { eyebrow: "Input · HDMI " + item.port, title: item.title, meta: [], synopsis: "", action: "Switch to " + item.title };
    }
    var show = featuredShow(item);
    if (show) {
      var appName = Featured.name(item.id) || item.title;
      return { eyebrow: show.eyebrow || ((show.source === "card" ? "On " : "Trending on ") + appName), title: show.title,
        meta: show.source === "card" ? [show.subtitle].filter(Boolean)
          : [show.year ? String(show.year) : null].concat(show.genres || []).filter(Boolean),
        synopsis: show.overview || "", action: "Open " + item.title };
    }
    return { eyebrow: "App", title: item.title, meta: [], synopsis: item.tagline, action: "Open " + item.title };
  }

  /* Featured shows on app heroes: a different one each visit, and the next every 9 s while focused. */
  var featureAt = {}, heroApp = null, featureTimer = null;
  function featuredShow(item) {
    if (!item || item.kind !== "app") return null;
    var list = Featured.forApp(item.id);
    return list.length ? list[(featureAt[item.id] || 0) % list.length] : null;
  }
  function featureFocus(item, rowId) {
    var isFeat = item && item.kind === "app" && Featured.forApp(item.id).length > 0;
    if (!isFeat) { heroApp = null; clearInterval(featureTimer); featureTimer = null; return; }
    if (heroApp === item.id) return;
    heroApp = item.id;
    featureAt[item.id] = (featureAt[item.id] === undefined ? Math.floor(Math.random() * 8) : featureAt[item.id] + 1);
    clearInterval(featureTimer);
    featureTimer = setInterval(function () {
      if (state.covered || current() !== item) return;
      featureAt[item.id]++;
      showHero(item, rowId, false);
    }, 9000);
  }

  /* The hero's text and backdrop change together: the new picture is loaded and
     decoded first, then the old text fades out while the picture crossfades, and
     the new text fades in. A picture that is slow to arrive (over 1.5 s) lets the
     text change on its own, and crossfades in when it lands. */
  var heroToken = 0;
  function showHero(item, rowId, immediate) {
    if (!item) return;
    featureFocus(item, rowId);
    var key = rowId + ":" + (item.id || item.imdb || item.title) + (item.kind === "app" ? ":" + (featureAt[item.id] || 0) : "");
    if (key === lastHeroKey) return;
    lastHeroKey = key;
    var c = heroContent(item, rowId);
    var b = backdropFor(item);
    var token = ++heroToken;
    clearTimeout(heroTimer);

    var apply = function () {
        els.eyebrow.textContent = c.eyebrow;
      els.title.textContent = c.title;
      els.title.classList.toggle("long", c.title.length > 16);
      els.meta.innerHTML = "";
      c.meta.forEach(function (m) { var s = document.createElement("span"); s.textContent = m; els.meta.appendChild(s); });
      els.synopsis.textContent = c.synopsis || "";
      els.actionLabel.textContent = c.action;
      playerHint();
      iplayerHint(item);
      els.hero.classList.remove("swap");
    };
    var textDone = false;
    var swapText = function () {
      if (textDone || token !== heroToken) return;
      textDone = true;
      if (immediate) return apply();
      els.hero.classList.add("swap");
      heroTimer = setTimeout(function () { if (token === heroToken) apply(); }, 240);
    };

    // A short pause while focus is moving, so holding an arrow doesn't load every picture.
    setTimeout(function () {
      if (token !== heroToken) return;
      var slow = setTimeout(swapText, 1500);
      prepareBackdrop(b, function (layerContent) {
        clearTimeout(slow);
        if (token !== heroToken) return;
        swapText();
        swapBackdrop(layerContent, immediate);
      });
    }, immediate ? 0 : 120);
    prefetchNext(item);
  }

  /* ---------- Backdrop crossfade ---------- */
  var bdFront = els.bdA, bdBack = els.bdB, bdShown = null;
  function backdropFor(item) {
    if (item.kind === "media" && item.backdrop) return { image: item.backdrop };
    if (item.kind === "connect") return { gradient: "radial-gradient(120% 90% at 75% 20%, #1f3a2c 0%, #0d0b0a 70%)" };
    var show = featuredShow(item);
    if (show && show.image) return { image: show.image };
    if (show && show.fanart) return { image: Simkl.image("fanart", show.fanart, "_medium") };
    var c = item.color || "#1d1a18";
    return { gradient: "radial-gradient(120% 90% at 75% 20%, " + c + " 0%, #0d0b0a 70%)" };
  }
  // Loads and decodes a picture; cb gets something ready to show.
  function prepareBackdrop(b, cb) {
    if (!b.image) return cb({ key: b.gradient, gradient: b.gradient });
    if (bdShown === b.image) return cb({ key: b.image, same: true });
    var img = new Image();
    img.alt = "";
    var ready = function () { cb({ key: b.image, img: img }); };
    img.onload = function () {
      if (img.decode) img.decode().then(ready, ready); else ready();
    };
    img.onerror = function () { cb({ key: "error", gradient: "radial-gradient(120% 90% at 75% 20%, #1d1a18 0%, #0d0b0a 70%)" }); };
    img.src = b.image;
  }
  var bdCleanup = null;
  function swapBackdrop(content, immediate) {
    if (content.same || content.key === bdShown) return;
    bdShown = content.key;
    var incoming = bdBack, outgoing = bdFront;
    clearTimeout(bdCleanup);
    // Fill the incoming layer, restart its drift, and fade it in above the old one.
    incoming.innerHTML = "";
    incoming.style.background = content.gradient || "";
    if (content.img) incoming.appendChild(content.img);
    incoming.classList.remove("drift", "show");
    void incoming.offsetWidth;
    incoming.classList.add("front", "drift", "show");
    outgoing.classList.remove("front");
    // The old layer keeps drifting under the new one, and is hidden once covered.
    bdCleanup = setTimeout(function () { outgoing.classList.remove("show", "drift"); outgoing.innerHTML = ""; }, immediate ? 0 : 800);
    bdFront = incoming; bdBack = outgoing;
  }
  // The next featured show's picture, fetched ahead so the rotation is instant.
  function prefetchNext(item) {
    if (!item || item.kind !== "app") return;
    var list = Featured.forApp(item.id);
    if (list.length < 2) return;
    var next = list[((featureAt[item.id] || 0) + 1) % list.length];
    var url = next.image || (next.fanart && Simkl.image("fanart", next.fanart, "_medium"));
    if (url) { var p = new Image(); p.src = url; }
  }

  /* ---------- Actions ---------- */
  var toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove("show"); }, 2200);
  }
  function activate() {
    var item = current();
    if (!item) return;
    rememberFocus(true);
    var done = function (err, res) {
      if (err) return toast("Couldn't open " + item.title);
      if (Glasshouse.preview) {
        toast(item.kind === "media" ? (Launch.player().titles ? "Would open in " + Launch.player().name + ": " + Launch.nuvioLink(item) : "Would open " + Launch.player().name) : "Would open " + item.title);
      }
    };
    if (item.kind === "connect") return openSignIn();
    if (item.kind === "media") Launch.media(item, done);
    else if (item.kind === "input") Launch.input(item, done);
    else Launch.app(item, done);
  }

  /* ---------- SIMKL sign-in ---------- */
  var signin = null;
  function openSignIn() {
    $("signinCode").textContent = "····-····";
    $("signinStatus").textContent = "Getting a code…";
    $("signin").classList.add("show");
    signin = Simkl.signIn(function (c) {
      $("signinCode").textContent = c.userCode;
      $("signinUrl").textContent = (c.url || "https://simkl.com/pin").replace(/^https?:\/\//, "");
      $("signinStatus").textContent = "Waiting for you to approve…";
    });
    signin.then(function () {
      $("signinStatus").textContent = "Connected. Loading your films and shows…";
      setTimeout(function () { closeSignIn(); refresh(true); }, 900);
    }, function (err) {
      if (!signin) return;
      var m = err && err.message;
      $("signinStatus").textContent = m === "expired" ? "The code expired. Press Back and try again."
        : m === "invalid_client" ? "This launcher's SIMKL app id isn't valid for sign-in."
        : "Couldn't reach SIMKL. Press Back and try again.";
    });
  }
  function closeSignIn() {
    if (signin && signin.cancel) signin.cancel();
    signin = null;
    $("signin").classList.remove("show");
  }

  /* ---------- Player switch (blue button) ---------- */
  function switchPlayer() {
    var p = Launch.nextPlayer();
    toast(p.titles ? "Titles open in " + p.name : "Titles open " + p.name + " (it can't open a title directly yet)");
    lastHeroKey = null;
    render(true);
  }
  /* ---------- Start-up app (red button, on an app) ---------- */
  // Red on an app makes it the one the TV opens when switched on (the HomeOS
  // helper does the opening); red on it again turns that off. The chosen app
  // wears a small power decal.
  var POWER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>';
  var previewStart = null;
  function startState() { return Glasshouse.preview ? previewStart : Launch.startsWith(); }
  function markStartApp() {
    var on = startState();
    Array.prototype.forEach.call(document.querySelectorAll(".tile.app.icon"), function (t) {
      t.classList.toggle("starts", !!on && t.dataset.app === on);
    });
  }
  Launch.onStartApp(markStartApp);
  function toggleStart() {
    var item = current();
    if (!item || item.kind !== "app" || startState() === undefined) return;
    var next = startState() === item.id ? null : item.id;
    var done = function (err) {
      if (err) return toast("Couldn't change that: the HomeOS helper isn't answering");
      toast(next ? item.title + " will open automatically when the TV starts" : "Automatic app opening disabled");
      markStartApp();
    };
    if (Glasshouse.preview) { previewStart = next; return done(null); }
    Launch.setStartsWith(next, done);
  }
  function playerHint() {
    var row = state.rows[state.r], item = current();
    var show = item && item.kind === "media";
    els.hint.textContent = show ? "Switch to " + (Launch.player().key === "nuvio" ? "Nuvio Legacy" : "Nuvio TV") : "";
    els.hintWrap.classList.toggle("hidden", !show);
  }

  /* ---------- Watch on iPlayer (yellow button) ---------- */
  // Works on SIMKL titles, and on the featured show when the BBC iPlayer app is focused.
  var iplayerTimer = null, iplayerFor = null, iplayerTarget = null, iplayerHit = null, featuredMedia = {}, cardFor = null;
  function iplayerTargetFor(item) {
    if (!item) return null;
    if (item.kind === "media") return item;
    if (item.kind === "app" && item.id === "bbc.iplayer.3.0") {
      var show = featuredShow(item);
      if (!show || show.source === "card") return null;
      var k = show.simkl || show.title;
      // One object per show, so lookups and the badge cache see the same title.
      if (!featuredMedia[k]) featuredMedia[k] = { kind: "media", type: "series", title: show.title, year: show.year, simkl: show.simkl, imdb: show.imdb };
      return featuredMedia[k];
    }
    return null;
  }
  function showIPlayer(item, target, hit) {
    if (item.kind === "media") badgeItem(item);
    iplayerFor = item; iplayerTarget = target; iplayerHit = hit;
    $("iplayerLabel").textContent = hit.label;
    els.iplayerWrap.classList.remove("hidden");
  }
  function iplayerHint(item) {
    clearTimeout(iplayerTimer);
    iplayerFor = iplayerTarget = iplayerHit = cardFor = null;
    els.iplayerWrap.classList.add("hidden");
    // An app card: yellow opens it in the app.
    var show = item && item.kind === "app" ? featuredShow(item) : null;
    // Nuvio's popular titles: yellow plays the title in Nuvio TV.
    if (show && show.source === "popular" && item.id === "space.nuvio.webos") {
      cardFor = { item: item, show: show };
      $("iplayerLabel").textContent = "Play in Nuvio";
      els.iplayerWrap.classList.remove("hidden");
      return;
    }
    if (show && show.source === "card") {
      cardFor = { item: item, show: show };
      $("iplayerLabel").textContent = "Watch on " + (Featured.name(item.id) || item.title);
      els.iplayerWrap.classList.remove("hidden");
      return;
    }
    var target = iplayerTargetFor(item);
    if (!target) return;
    var known = IPlayer.cached(target);
    if (known) return showIPlayer(item, target, known);
    if (known === false) return;
    // Not looked up yet: ask once focus has settled on it.
    iplayerTimer = setTimeout(function () {
      IPlayer.lookup(target, function (hit) {
        if (hit && current() === item && iplayerTargetFor(item) === target) showIPlayer(item, target, hit);
      });
    }, 600);
  }
  function watchOnIPlayer() {
    var item = current();
    rememberFocus(true);
    if (cardFor && cardFor.item === item && featuredShow(item) === cardFor.show && cardFor.show.source === "popular") {
      var pop = cardFor.show;
      toast("Opening " + pop.title + " in Nuvio");
      return Launch.openNuvio(pop, function (err) { if (err) toast("Couldn't open " + pop.title + " in Nuvio"); });
    }
    if (cardFor && cardFor.item === item && featuredShow(item) === cardFor.show) {
      var show = cardFor.show, app = Featured.name(item.id) || item.title;
      toast("Opening " + show.title + " on " + app);
      return Featured.openCard(show, function (err) { if (err) toast("Couldn't open " + show.title + " on " + app); });
    }
    if (!item || item !== iplayerFor || !iplayerHit || iplayerTargetFor(item) !== iplayerTarget) return;
    var target = iplayerTarget;
    toast("Opening " + target.title + " on BBC iPlayer");
    IPlayer.open(target, iplayerHit, function (err) { if (err) toast("Couldn't open " + target.title + " on iPlayer"); });
  }

  /* ---------- iPlayer badges on tiles ---------- */
  var IPLAYER_ICON = Glasshouse.iconUrl("bbc.iplayer.3.0");
  function badgeItem(item) {
    state.rows.forEach(function (rw) {
      rw.items.forEach(function (it, i) {
        if (it !== item && !(it.simkl && it.simkl === item.simkl)) return;
        var art = rw.tiles[i].querySelector(".art");
        if (!art || art.querySelector(".badge")) return;
        var b = document.createElement("div");
        b.className = "badge";
        if (IPLAYER_ICON) { var img = document.createElement("img"); img.src = IPLAYER_ICON; img.alt = "BBC iPlayer"; b.appendChild(img); }
        else { b.className += " text"; b.textContent = "iPlayer"; }
        art.appendChild(b);
        requestAnimationFrame(function () { b.classList.add("in"); });
      });
    });
  }
  // Looks every title up, one at a time and slowly, only while the launcher is on screen.
  var scanQueue = [], scanTimer = null;
  function scanBadges() {
    clearTimeout(scanTimer);
    var seen = {};
    scanQueue = [];
    state.rows.forEach(function (rw) {
      rw.items.forEach(function (it) {
        if (it.kind !== "media") return;
        var k = it.simkl || it.title;
        if (seen[k]) return;
        seen[k] = true;
        var c = IPlayer.cached(it);
        if (c) badgeItem(it);
        else if (c === null) scanQueue.push(it);
      });
    });
    scanNext();
  }
  function scanNext() {
    clearTimeout(scanTimer);
    if (!scanQueue.length) return;
    scanTimer = setTimeout(function () {
      if (state.covered) return;
      var it = scanQueue.shift();
      IPlayer.lookup(it, function (hit) { if (hit) badgeItem(it); scanNext(); });
    }, 400);
  }

  /* ---------- Keys ---------- */
  document.addEventListener("keydown", function (e) {
    var t0k = performance.now();
    try { onKey(e); } finally { if (BEACON) keyTimes.push(+(performance.now() - t0k).toFixed(1)); }
  });
  function onKey(e) {
    var now = Date.now();
    if (e.repeat && now - state.lastKey < 90) { e.preventDefault(); return; }
    state.lastKey = now;
    state.lastWasRepeat = !!e.repeat;
    launchedAt = 0;
    if (signin) {
      if (e.keyCode === KEY.BACK || e.keyCode === KEY.BACKSPACE || e.keyCode === KEY.ESC) closeSignIn();
      e.preventDefault();
      return;
    }
    switch (e.keyCode) {
      case KEY.LEFT: move(0, -1); break;
      case KEY.RIGHT: move(0, 1); break;
      case KEY.UP: move(-1, 0); break;
      case KEY.DOWN: move(1, 0); break;
      case KEY.OK: activate(); break;
      case KEY.BLUE: case KEY.B: switchPlayer(); break;
      case KEY.RED: case KEY.R: toggleStart(); break;
      case KEY.YELLOW: case KEY.Y: watchOnIPlayer(); break;
      case KEY.BACK: case KEY.BACKSPACE: case KEY.ESC: goHome(); break;
      default: return;
    }
    e.preventDefault();
  }

  /* ---------- Covered / home ---------- */
  // The launcher stays loaded behind every app, so while it's out of sight nothing
  // runs: no clock, no backdrop drift, no hero rotation, no badge lookups. On this
  // TV Glasshouse's onCovered doesn't fire, but the page's own visibility does.
  function setCovered(covered) {
    if (state.covered === covered) return;
    hlog("covered", { covered: covered, focus: focusNow() });
    state.covered = covered;
    document.body.classList.toggle("covered", covered);
    if (covered) {
      rememberFocus(); stopClock();
      clearInterval(featureTimer); featureTimer = null; heroApp = null;
      clearTimeout(scanTimer);
    } else {
      uncoveredAt = Date.now(); startClock(); refresh(net.down); scanNext(); Featured.refresh();
      lastHeroKey = null; render(true);   // restarts the hero's rotation if an app is focused
    }
  }
  Glasshouse.onCovered(setCovered);
  /* ---------- Keeping the lists fresh ---------- */
  // Nuvio tells SIMKL what you watched a little after the fact, so on coming back
  // the launcher asks SIMKL whether anything changed now, and a few times more
  // over the next couple of minutes; then every 3 minutes while it's on screen.
  var freshTimers = [];
  function checkFresh() {
    if (document.visibilityState === "hidden" || net.down) return;
    Sources.changed(function (yes) { hlog("fresh", { changed: yes }); if (yes) refresh(true); });
  }
  function onReturn() {
    freshTimers.forEach(clearTimeout);
    freshTimers = [1000, 20000, 60000, 150000].map(function (ms) { return setTimeout(checkFresh, ms); });
  }
  setInterval(checkFresh, 3 * 60 * 1000);
  document.addEventListener("visibilitychange", function () {
    hlog("visibility", { state: document.visibilityState });
    var hidden = document.visibilityState === "hidden";
    setCovered(hidden);
    if (!hidden) onReturn();
  });
  // Glasshouse calls this when Home is pressed with the launcher on screen, and
  // when the launcher is opened again from an app. Coming back from an app keeps
  // focus where it was; Home pressed on the launcher itself goes back to the start.
  Glasshouse.onHome(function () {
    var returning = launchedAt > 0 || state.covered || Date.now() - uncoveredAt < 2500;
    launchedAt = 0;
    hlog("onHome", { covered: state.covered, sinceUncover: Date.now() - uncoveredAt, returning: returning, focus: focusNow() });
    if (returning) { restoreFocus(savedFocus() || focusNow()); onReturn(); }
    else goHome();
  });
  Glasshouse.onChanged(function () { refresh(); });

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { measure(); render(true); }, 100);
  });

  /* ---------- When SIMKL can't be reached ---------- */
  // Typically the first seconds after waking from standby, before the Wi-Fi is
  // back. The lists on screen stay, and SIMKL is asked again when the TV says the
  // network is back, or after a calm backoff (5 s doubling to 5 min) while the
  // launcher is on screen. Pictures that couldn't load are fetched again then.
  var net = { down: false, tries: 0, timer: null };
  function netFailed(err) {
    hlog("netFailed", { err: err && err.message, tries: net.tries });
    net.down = true;
    clearTimeout(net.timer);
    var ms = Math.min(5000 * Math.pow(2, net.tries++), 300000);
    net.timer = setTimeout(netRetry, ms);
  }
  function netRetry() {
    clearTimeout(net.timer); net.timer = null;
    if (!net.down) return;
    if (state.covered) return;   // tried again on return (setCovered)
    refresh(true);
  }
  function netOk() {
    if (!net.down) return;
    hlog("netOk", { tries: net.tries });
    net.down = false; net.tries = 0;
    clearTimeout(net.timer); net.timer = null;
    // Tile pictures that failed: set them again (loaded ones come from the cache).
    var arts = Array.prototype.filter.call(document.querySelectorAll(".tile.media .art"), function (a) { return a.style.backgroundImage; });
    var bgs = arts.map(function (a) { var bg = a.style.backgroundImage; a.style.backgroundImage = "none"; return bg; });
    if (arts.length) getComputedStyle(arts[0]).backgroundImage;   // one style pass sees them cleared
    arts.forEach(function (a, i) { a.style.backgroundImage = bgs[i]; });
    if (bdShown === "error") { lastHeroKey = null; render(true); }
    Featured.refresh();
  }
  window.addEventListener("online", function () { if (net.down) { net.tries = 0; netRetry(); } });

  /* ---------- Load ---------- */
  var lastRefresh = 0, builtSig = null;
  function refresh(force) {
    if (!force && Date.now() - lastRefresh < 5 * 60 * 1000) return;
    lastRefresh = Date.now();
    var media = null, apps = null;
    var maybeBuild = function () {
      if (!media || !apps) return;
      // Same content as on screen: nothing to rebuild (most refreshes end here).
      var sig = JSON.stringify([media, apps]);
      if (sig === builtSig && state.rows.length) return;
      builtSig = sig;
      // Focus stays on the same item; on the first build, where it was before a reload.
      var keep = state.rows.length ? focusNow() : savedFocus();
      hlog("build", { first: !state.rows.length, keep: keep });
      var positions = {};
      state.rows.forEach(function (r) { positions[r.id] = r.items[r.i] ? itemKey(r.items[r.i]) : null; });
      build(media, apps);
      state.rows.forEach(function (r) {
        if (!positions[r.id]) return;
        for (var i = 0; i < r.items.length; i++) if (itemKey(r.items[i]) === positions[r.id]) { r.i = i; break; }
      });
      if (!restoreFocus(keep)) render(true);
    };
    Sources.media(function (err, m, fromCache) {
      if (err) netFailed(err); else if (!fromCache) netOk();
      if (!m) return;   // a failed fetch: what's on screen stays
      media = m; maybeBuild();
    });
    Sources.apps(function (err, a) { apps = a || { favourites: [], others: [], inputs: [] }; maybeBuild(); });
  }

  // Row heights depend on the font; measure again once it has loaded.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (state.rows.length) { measure(); render(true); } });

  startClock();
  refresh(true);
})();
