#!/bin/sh
# Takes a screenshot of whatever is on the TV and saves it in screenshots/.
#   TV_HOST=<tv-ip> scripts/screenshot.sh [name]
# Needs root ssh to the TV (key login). The TV captures at 1920x1080.
set -e
: "${TV_HOST:?Set TV_HOST to the TV address}"
cd "$(dirname "$0")/.."
mkdir -p screenshots
name="${1:-tv-$(date +%Y%m%d-%H%M%S)}"
out="screenshots/${name%.png}.png"
remote="/tmp/homeos-shot-$$.png"

# luna-send prints nothing to an ssh terminal, so it runs under node on the TV.
ssh -o ConnectTimeout=5 "root@$TV_HOST" node - <<EOF
var p = { path: "$remote", method: "DISPLAY", format: "PNG", width: 1920, height: 1080 };
require("child_process").execFile("/usr/bin/luna-send",
  ["-n", "1", "luna://com.webos.service.capture/executeOneShot", JSON.stringify(p)],
  { timeout: 10000 }, function (e, o) {
    var r = {}; try { r = JSON.parse(o); } catch (x) {}
    if (!r.returnValue) { console.error("capture failed: " + (o || e)); process.exit(1); }
  });
EOF
scp -q "root@$TV_HOST:$remote" "$out"
ssh -o ConnectTimeout=5 "root@$TV_HOST" "rm -f $remote"
echo "$out"
