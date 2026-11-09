# HomeOS

A cinematic home screen for a rooted LG webOS TV running [Glasshouse](https://rorygallagher2024.github.io/glasshouse/),
built around what you actually watch.

- **Continue watching** from [SIMKL](https://simkl.com): episodes you're part-way through, the next episode of
  shows you're watching, and new episodes of shows you'd caught up on. OK opens the title in
  [Nuvio](https://github.com/NuvioMedia/NuvioWeb) (or Nuvio Legacy, switched with the blue button).
- **Watchlist** and **Recommended for you**, also from SIMKL.
- **Your apps** as square icons. Each big media app's hero rotates through that app's own picks
  (the cards it publishes for LG's Home) or, failing that, shows trending on its network.
  Yellow opens the featured title in the app; for Nuvio, titles popular on SIMKL this week.
- **Watch on iPlayer**: SIMKL titles that are on BBC iPlayer get a badge, and yellow opens the
  exact episode (matched through the BBC's iBL catalogue).
- Full-screen backdrops with smooth crossfades, a time-of-day tint, and focus kept when you come
  back from an app.

Built for an LG C2 on webOS 24 (Chromium 108), so modern JavaScript and CSS are fine.

## Layout

| Path | What |
|---|---|
| `launcher/` | The launcher: a web page Glasshouse serves as the TV's Home |
| `launcher/js/config.js` | SIMKL client id (public; a "TV, devices & command line" app has no secret) |
| `tv-helper/` | A small service on the TV that opens titles in Nuvio and iPlayer, and app cards with their full launch parameters, which webOS won't let the launcher page do. See its README. |
| `scripts/deploy.sh` | Builds the launcher and uploads it to Glasshouse |

## Develop

Open the launcher in a browser with sample data:

```sh
python3 -m http.server 5173 --directory launcher
```

Arrow keys move, Enter is OK, Backspace is Back, `b` and `y` stand in for the blue and yellow
buttons. In the address, `?mock` uses sample films and shows instead of SIMKL, and `?many` adds
sample apps.

Debugging on the TV: set `DEBUG_BEACON` in `launcher/js/config.js` to a URL on your computer (for
example the dev server above, `http://<mac-ip>:5173/diag`). The launcher then reports focus and
visibility events, and every 10 seconds its frame rate, slow frames and key-handling times, as
requests in that server's log. Remove it again before committing.

## Performance notes

The C2 lays the page out at 1920x1080 but draws it at 4K (device pixel ratio 2). Measured on the
TV: key handling is around 1 ms, idle is a steady 60 fps (backdrop drift included), and constant
navigation drops a frame or two now and then as tiles and backdrops are redrawn at 4K. While an
app is on top the launcher pauses everything (clock, drift, hero rotation, lookups).

## Deploy

```sh
GLASSHOUSE_URL=http://<tv-ip>:8080 GLASSHOUSE_KEY=<dashboard key> scripts/deploy.sh
```

Then choose it on the dashboard's Home tab under Custom (once). Glasshouse 0.143 or later is needed.
Some features use Glasshouse settings: **Recommended** (app cards) and, as a fallback, **Search**.
