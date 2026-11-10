---
name: simkl-api
description: Reference for the SIMKL API as HomeOS uses it — device sign-in (AUTH V2), sync lists (playback, watching with next episodes, plan to watch), change polling with /sync/activities, title details and recommendations, images, and the public trending lists with network names. Use when changing how HomeOS reads SIMKL (launcher/js/simkl.js, sources.js, featured.js) or debugging what Continue watching, Watchlist, Recommended or the trending heroes show.
---

# SIMKL in HomeOS

Code: `launcher/js/simkl.js` (auth, `get`, `detail`, `pool`, `image`), `launcher/js/sources.js` (rows),
`launcher/js/featured.js` (trending/popular heroes). Client id in `launcher/js/config.js` (public; a
"TV, devices & command line" app has no secret).

## Every request
`https://api.simkl.com<path>?client_id=…&app-name=homeos&app-version=…` (SIMKL asks for app-name and
app-version). Authed calls add `Authorization: Bearer <access>`. A 401 on an authed call means signed out.

## Sign-in (AUTH V2, device flow)
1. `POST /oauth2/device` (form: `client_id`, `scope=media:read`) → `device_code`, `user_code`, `verification_uri`, `interval`, `expires_in`.
2. Poll `POST /oauth2/token` (`grant_type=urn:ietf:params:oauth:grant-type:device_code`, `device_code`) every `interval`; `slow_down` adds 5 s; `expired_token`/`invalid_client` stop.
3. Refresh with `grant_type=refresh_token` when under a day from expiry; 400/401 on refresh = signed out.

## Lists
| Call | Use |
|---|---|
| `GET /sync/playback` | part-watched; `progress` 0–100 (≥90 counts as finished, as Nuvio does), `paused_at`, `episode {season, number, title}` |
| `GET /sync/all-items/shows/watching?next_watch_info=yes` (and `/anime/…`) | per show: `next_to_watch` ("S02E05"), `next_to_watch_info {title, date}`, `last_watched_at` |
| `GET /sync/all-items/all/plantowatch` | `{movies, shows, anime}`, each with `added_to_watchlist_at` |
| `GET /sync/activities` | `{all: <timestamp>, …}`: moves when anything in the account changes. Cheapest call; poll this, refetch lists only when it moves |

Continue watching rules (sources.js): next episode is **new** if `next_to_watch_info.date` is after
`last_watched_at`, else **next up**; skip episodes not aired yet; a paused session for the same
episode wins, moving past it drops it; newest first; drop anything untouched for 90 days; max 20.

## Details and recommendations
`GET /tv/<id>`, `/movies/<id>`, `/anime/<id>` (no auth): `title, year, overview, genres, runtime, poster,
fanart, ids {simkl, imdb, tmdb…}, users_recommendations[] {title, year, type, poster, fanart, ids}`.
HomeOS caches a slim copy 7 days in localStorage (`homeos.simkl.detail.*`, pruned after 30).

## Images
SIMKL gives paths like `12/3456abc`. URL: `https://simkl.in/{fanart|posters}/<path><size>.webp`, sizes
fanart `_medium` (1920) and `_w` (600), posters `_m`, `_w`. HomeOS fetches through `https://wsrv.nl/?url=…&q=85`.

## Public trending (no auth, CORS *)
`https://data.simkl.in/discover/trending/{tv|movies}/{today|week|month}_{100|500}.json`. Entries:
`title, release_date (display text), network ("BBC One", "Channel 4", "ITV1", "Netflix"…), status,
genres, overview, fanart, ratings.simkl.rating, ids {simkl_id, imdb, tmdb}`. The 500 lists are ~1.2 MB:
download them after start-up settles, retry once (big downloads are sometimes reset), and don't cache
an empty result for long.

## Gotchas
- Offline (TV just woke), every call fails: never treat failed calls as empty lists (see `fetchMedia(keepOld)`).
- `ids.simkl` vs trending's `ids.simkl_id`.
- Per-request `fetch` failures surface as `TypeError`, not HTTP errors.
