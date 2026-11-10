---
name: uk-streaming-deeplinks
description: How HomeOS opens a specific title or episode in TV apps on the LG webOS TV — Nuvio links, BBC iPlayer episodes found through the BBC's iBL catalogue (with SIMKL episode mapping), LG Home app cards (Channel 4, ITVX, Channel 5, Disney+, Prime Video, YouTube) with their full launch parameters, and the HomeOS helper that performs the launches. Use when adding or debugging "open this title in app X", the yellow button, iPlayer badges, or app-card heroes.
---

# Deep links on the TV

The launcher page can't launch apps with parameters (webOS ignores its `PalmServiceBridge` calls), so
launches go through the **HomeOS helper** (`tv-helper/nuvio-link.js`, `127.0.0.1:8097`, see its README).
It calls `luna://com.webos.applicationManager/launch {id, params}`. Fallbacks go through Glasshouse.

## Nuvio TV (`space.nuvio.webos`)
- Link: `nuvio://imdb/{movie|series}/tt…` or `nuvio://tmdb/{movie|series}/<id>`, launched as `params.contentTarget`.
- Helper: `POST /open {"link":"nuvio://…"}` (regex-checked). Launcher: `Launch.media` / `Launch.openNuvio` (`launcher/js/launch.js`).
- **Nuvio Legacy** (`space.nuvio.native.legacy`) ignores launch params on webOS (deep links are Android-only so far): open it as an app.

## BBC iPlayer (`bbc.iplayer.3.0`)
- Find: `https://ibl.api.bbc.co.uk/ibl/v1/new-search?q=<title>&rights=tv&availability=available&lang=en` (CORS *). Match the title exactly (normalised: lowercase, `&`→`and`, punctuation stripped). A film is a `type: "episode"` hit; a series is `type: "programme"`.
- Episodes: `/programmes/<pid>/episodes?rights=tv&availability=available&per_page=200&lang=en`. Subtitles read `Series 2: 3. Title` / `Series 1: Episode 3` → SIMKL `S2 E3`.
- Reject a same-named older show: if the oldest iPlayer episode is more than a year before the SIMKL title's year (Ghosts UK vs US).
- Open: helper `POST /open {"app":"iplayer","pid":"<8 chars>"}` closes iPlayer (it ignores links when already running) and launches with
  `contentTarget: https://www.live.bbctvapps.co.uk/tap/iplayer?deeplink=tv/playback/urn:bbc:iplayer:episode:<pid>&campaign=catalogue&medium=referral&origin=search&partner=com.lg`.
- Fallback without the helper: Glasshouse `POST /api/home/search {query}` then `/api/home/search/open {id, app}` (opens the series at S1 E1).
- Code: `launcher/js/iplayer.js` (`resolve`, `lookup` with a 1-day cache `homeos.iplayer2.*`, `open`).

## LG Home app cards (Channel 4, ITVX, Channel 5, Disney+, Prime Video, YouTube…)
- Apps publish "cards" for LG's Home: `luna://com.webos.service.applicationmanager/getAllContents`. Glasshouse lists them in `GET /api/home/catalogue` → `recommended` (when its Recommended setting is on), each with an `id`, `app`, `title`, `image`.
- Card id = first 16 hex chars of `md5(appId + "\n" + contentId)` (as Glasshouse makes it).
- Open: helper `POST /open {"app":"card","card":"<16 hex>"}` finds the card, closes the app, and launches with the card's **full `launchParam`**. Freeview Play apps (`com.fvp.ch4`, `com.fvp.itv`, `demand5`) need it all, including `contentType: application/vnd.dvb.ait+xml`; passing only `contentTarget` gives "Error Code 200". Fallback: Glasshouse `POST /api/home/open {kind:"rec", id}`.
- Big images: ask each image service for 1920 px (`featured.js` `bigImage`): Freeview `w=1920`, Disney `scale?width=1920&format=jpeg&quality=85`, Amazon `._UR1920,1080_`, YouTube `maxresdefault`.
- There's no known way to look up a *specific* Channel 4/ITVX/Channel 5 programme by id outside these cards.

## Testing
- On the TV: `tv helper POST /open '{"app":"iplayer","pid":"m0031lsj"}'`, then `tv foreground` and `tv screenshot` (lg-tv-ops skill). Helper log: `tv logs helper`.
- The helper rate-limits launches to one per 800 ms and only accepts the shapes above.
