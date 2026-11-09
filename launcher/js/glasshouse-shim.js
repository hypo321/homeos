/* A stand-in for window.Glasshouse when the launcher is opened somewhere
   Glasshouse is not serving it (a plain local preview). On the TV, or when
   opened from http://<tv>:<port>/home/launcher/, the real one is used. */
(function () {
  if (window.Glasshouse) return;

  var apps = [
    { id: "com.webos.app.livetv", title: "Live TV", icon: null, hidden: false, folder: false },
    { id: "youtube.leanback.v4", title: "YouTube", icon: null, hidden: false, folder: false },
    { id: "bbc.iplayer.3.0", title: "BBC iPlayer", icon: null, hidden: false, folder: false },
    { id: "com.webos.app.lgchannels", title: "LG Channels", icon: null, hidden: true, folder: false },
    { id: "space.nuvio.webos", title: "Nuvio", icon: null, hidden: false, folder: false },
    { id: "com.channel4.ondemand", title: "Channel 4", icon: null, hidden: false, folder: false },
    { id: "netflix", title: "Netflix", icon: null, hidden: false, folder: false },
    { id: "amazon", title: "Prime Video", icon: null, hidden: false, folder: false },
    { id: "com.disney.disneyplus-prod", title: "Disney+", icon: null, hidden: false, folder: false },
    { id: "com.webos.app.browser", title: "Web Browser", icon: null, hidden: false, folder: true },
    { id: "com.webos.app.photovideo", title: "Gallery", icon: null, hidden: false, folder: true }
  ];
  var inputs = [
    { id: "HDMI_1", title: "Apple TV", port: 1, tuner: false, unused: false, hidden: false },
    { id: "HDMI_2", title: "PlayStation 5", port: 2, tuner: false, unused: false, hidden: false },
    { id: "HDMI_3", title: "HDMI 3", port: 3, tuner: false, unused: true, hidden: true }
  ];
  // ?many in the preview's address: extra sample apps, to try scrolling.
  if (/[?&]many\b/.test(location.search)) {
    for (var n = 1; n <= 16; n++) apps.push({ id: "sample." + n, title: "Sample App " + n, icon: null, hidden: false, folder: false });
  }
  var coveredFns = [], homeFns = [];

  window.Glasshouse = {
    version: 1,
    preview: true,
    catalogue: function (cb) { setTimeout(function () { cb(null, { apps: apps, inputs: inputs }); }, 30); },
    channels: function (cb) { setTimeout(function () { cb(null, []); }, 30); },
    open: function (kind, id, cb) {
      console.log("[preview] open", kind, id);
      if (cb) cb(null, { preview: true });
    },
    lgHome: function (cb) { console.log("[preview] lgHome"); if (cb) cb(null); },
    iconUrl: function () { return null; },
    onCovered: function (fn) { coveredFns.push(fn); },
    isCovered: function () { return false; },
    onHome: function (fn) { homeFns.push(fn); },
    onChanged: function () {},
    _simulateCovered: function (v) { coveredFns.forEach(function (f) { f(v); }); },
    _simulateHome: function () { homeFns.forEach(function (f) { f(); }); }
  };
})();
