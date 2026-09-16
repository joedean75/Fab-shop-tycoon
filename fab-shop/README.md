# Fab Shop Tycoon

A mobile web game about running a metal fabrication shop. Orders come in, steel
moves through the plasma table, press brake, MIG bay and paint booth, and you
ship before the deadline — or eat the late penalty.

Built as a plain HTML/CSS/JS PWA: no build step, no dependencies, installable to
a phone home screen, and playable offline once it has loaded.

## Play

```sh
npx http-server fab-shop -p 8080      # or any static server
```

Open `http://localhost:8080` on a phone (or a desktop browser in device mode).
To install it as an app: open it over HTTPS and use the browser's
"Add to Home Screen".

Opening `index.html` straight off the filesystem works too — you just lose the
offline service worker, which browsers only run over http/https.

## Deploy

The game is a static bundle - `fab-shop/` is the whole site, with no build
step. `node tools/verify-deploy.js` checks it before it ships (missing files,
root-absolute paths that break subpath hosting, a service worker precaching
something that no longer exists, an unparseable manifest, JS that does not
parse) and exits non-zero so a bad bundle never goes live.

| Target | What to do |
| --- | --- |
| **GitHub Pages** | Already wired: `.github/workflows/pages.yml` verifies and deploys on every push to `main` that touches the game. Enable it once under Settings -> Pages -> Source: **GitHub Actions**. Serves at `https://<user>.github.io/<repo>/`. |
| **Netlify** | `netlify.toml` sets publish dir, build verification and cache headers. Connect the repo, or `netlify deploy --prod --dir=fab-shop`. |
| **Render** | `render.yaml` is a Blueprint for a static site. New -> Blueprint, point it at the repo. |
| **Anything else** | Copy `fab-shop/` to any static host. Relative paths throughout, so a subdirectory works fine. |

Two host settings matter, and the configs above already set them: `sw.js` and
`index.html` must be served `Cache-Control: no-cache`, or installed players
stay pinned to an old build.

### Releasing a change

Bump `VERSION` in `fab-shop/sw.js`. That invalidates the old cache; the page
picks up the new worker, refreshes itself once, and saved games carry over.
Verified end to end: a redeploy swaps the cache, drops the stale one, and does
not loop the reload.

## How it plays

- **Take orders** from the board. Rush jobs pay ~45% more on a tighter deadline.
  Your Steel Rack limits how many jobs can be on the floor at once.
- **Jobs route themselves** to the next machine they need as bays free up.
- **Tap a running machine** when the orange marker crosses the green band. A
  perfect hit does about 4x the work of a mistimed one and raises the part's
  quality; sloppy taps drag quality down.
- **Quality sets your payout** (0.8x–1.25x) and your reputation, which in turn
  sets what the board pays you.
- **Hire operators** to work a machine unattended. They never sleep, but parts
  they run alone drift toward merely acceptable quality — automation trades
  margin for attention.
- **Each day** (50 real seconds) bills rent, wages and power, then posts fresh
  work. Run out of cash and you take an emergency loan at the cost of
  reputation — the shop never closes.

Progress is saved to `localStorage` automatically.

## Layout

| File | What it holds |
| --- | --- |
| `js/data.js` | Tuning constants, stations, products, upgrade definitions |
| `js/game.js` | Simulation: time, routing, taps, payouts, day close, save/load |
| `js/ui.js` | DOM rendering; reads state, never mutates it |
| `js/main.js` | Boot and frame loop |
| `sw.js` | Cache-first service worker for offline play |

Balance lives entirely in `FAB.TUNE` and the product table in `js/data.js`, so
retuning the economy does not touch game logic.
