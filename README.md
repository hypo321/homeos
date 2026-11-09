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
buttons, and `?many` in the address adds sample apps.

## Deploy

```sh
GLASSHOUSE_URL=http://<tv-ip>:8080 GLASSHOUSE_KEY=<dashboard key> scripts/deploy.sh
```

Then choose it on the dashboard's Home tab under Custom (once). Glasshouse 0.143 or later is needed.
Some features use Glasshouse settings: **Recommended** (app cards) and, as a fallback, **Search**.
