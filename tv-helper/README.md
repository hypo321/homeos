# HomeOS link helper (Nuvio and BBC iPlayer)

webOS ignores service calls from the HomeOS launcher page, so it can't launch Nuvio
with a title. This helper does it for the launcher.

- `nuvio-link.js` → `/var/lib/homeos/nuvio-link.js` on the TV
- `60-homeos` → `/var/lib/webosbrew/init.d/60-homeos` (starts it at boot)

It listens on `127.0.0.1:8097` only (not reachable from the network) and only accepts:

- `POST /open {"link":"nuvio://imdb|tmdb/movie|series/<id>"}` → Nuvio (`space.nuvio.webos`), as `contentTarget`
- `POST /open {"app":"iplayer","pid":"<8-char BBC episode id>"}` → BBC iPlayer (`bbc.iplayer.3.0`), closed first, then
  launched with the playback link LG's catalogue uses (`…/tap/iplayer?deeplink=tv/playback/urn:bbc:iplayer:episode:<pid>…`)

- `POST /open {"app":"card","card":"<16-hex id>"}` → a card one of the TV's apps publishes for LG's Home right now
  (`applicationmanager/getAllContents`; id = first 16 hex of md5(appId + "\n" + contentId), as Glasshouse makes it).
  The app is closed, then launched with the card's own `launchParam` (Freeview Play apps need its
  `contentType: application/vnd.dvb.ait+xml`), or `{contentTarget}` when the card has none.

- `GET /settings`, `POST /settings {"startApp":"space.nuvio.webos"|"space.nuvio.native.legacy"|null}` →
  **Start with Nuvio**, saved in `/var/lib/homeos/settings.json`. The launcher's red button on a Nuvio app
  changes it.

**Start with Nuvio:** the helper follows the TV's power state (`tvpower/power/getPowerState`, subscribed).
When the TV comes on from standby (Suspend or Active Standby to Active), or has just started, and
`power/getPowerOnReason` says it was switched on by hand (`remoteKey` or `localKey`, not an HDMI
device over CEC, a cast or a timer), it waits for Home and then opens the chosen app, but only if Home
is on screen: not when the TV came on into an app or input, and not when just the screen was off and on.

Log: `/tmp/homeos-nuvio-link.log`.

## Install / update
```
scp nuvio-link.js root@<tv-ip>:/var/lib/homeos/nuvio-link.js
scp 60-homeos root@<tv-ip>:/var/lib/webosbrew/init.d/60-homeos
ssh root@<tv-ip> 'chmod 755 /var/lib/webosbrew/init.d/60-homeos; kill $(pgrep -f "node /var/lib/homeos/[n]uvio-link.js"); /var/lib/webosbrew/init.d/60-homeos'
```

## Remove
```
ssh root@<tv-ip> 'rm /var/lib/webosbrew/init.d/60-homeos; rm -r /var/lib/homeos; kill $(pgrep -f "node /var/lib/homeos/[n]uvio-link.js")'
```
Without it, titles open on Nuvio's home screen, and iPlayer titles open at S1 E1 through Glasshouse's search.
