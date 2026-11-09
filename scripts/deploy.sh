#!/bin/sh
# Builds the launcher and uploads it to Glasshouse on the TV as the custom Home.
#   GLASSHOUSE_URL  e.g. http://192.168.1.50:8080
#   GLASSHOUSE_KEY  the dashboard's access key (the ?k= value), if one is set
# Keep the key in your shell, not in this repo.
set -eu
cd "$(dirname "$0")/.."
: "${GLASSHOUSE_URL:?set GLASSHOUSE_URL, e.g. http://192.168.1.50:8080}"
mkdir -p dist
rm -f dist/homeos-launcher.zip
(cd launcher && zip -qr ../dist/homeos-launcher.zip index.html css js fonts)
key=""
[ -n "${GLASSHOUSE_KEY:-}" ] && key="&k=$GLASSHOUSE_KEY"
curl -sS --fail --max-time 60 -X POST "$GLASSHOUSE_URL/api/home/launcher/upload?name=homeos-launcher.zip$key" \
  -H 'Content-Type: application/octet-stream' --data-binary @dist/homeos-launcher.zip >/dev/null
echo "Uploaded. Glasshouse swaps it in within a few seconds."
