# Fab Shop Tycoon

A mobile web game about running a metal fabrication shop. Orders come in, steel
moves through the plasma table, press brake, MIG bay and paint booth, and you
ship before the deadline — or eat the late penalty.

Built as a plain HTML/CSS/JS PWA: no build step, no dependencies, installable to
a phone home screen, and playable offline once it has loaded.

**Live: https://fab-shop-tycoon.onrender.com** - deployed from this branch on
Render, redeploying automatically on every push.

## Play

```sh
npx http-server fab-shop -p 8080      # or any static server
```

Open `http://localhost:8080` on a phone (or a desktop browser in device mode).
To install it as an app: open it over HTTPS and use the browser's
"Add to Home Screen".

Opening `index.html` straight off the filesystem works too — you just lose the
offline service worker, which browsers only run over http/https.

## Mobile builds

The same files ship to the App Store and Google Play through Capacitor - see
[`store/README.md`](../store/README.md) for the full submission runbook. The
native projects live in `ios/` and `android/`; `npx cap sync` copies this
directory into both. `js/native.js` adapts the game to a native shell (splash,
status bar, Android back button) and no-ops in a browser.

## Deploy

The game is a static bundle - `fab-shop/` is the whole site, with no build
step. `node tools/verify-deploy.js` checks it before it ships (missing files,
root-absolute paths that break subpath hosting, a service worker precaching
something that no longer exists, an unparseable manifest, JS that does not
parse) and exits non-zero so a bad bundle never goes live.

| Target | What to do |
| --- | --- |
| **Netlify** | `netlify.toml` sets publish dir, build verification and cache headers. Connect the repo, or `netlify deploy --prod --dir=fab-shop`. |
| **Render** | `render.yaml` is a Blueprint for a static site. New -> Blueprint, point it at the repo. |
| **Anything else** | Copy `fab-shop/` to any static host. Relative paths throughout, so a subdirectory works fine. |

After a deploy, `node tools/smoke-live.js <url>` checks what the host actually
serves: every asset the page references returns 200, scripts and styles come
back with the right content type, and the manifest is served as JSON - a
manifest served as `binary/octet-stream` returns 200 but silently costs you
"Add to Home Screen".

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
- **Jobs route themselves** to the next machine they need as bays free up, or
  turn off **Auto-load** and do it yourself: `Load` puts a racked job on a
  machine, and ejecting a running job returns it to the rack with its progress
  intact, so an urgent job can take the bay.
- **A `?` on the shop floor** opens the manual, which is generated from
  `FAB.TUNE` - it quotes the numbers the simulation actually applies rather
  than a description that drifts out of date. Seven
  stations unlock as the shop levels: plasma table, press brake, MIG bay, grind
  and paint, then the tube laser, CNC mill and powder coat line.
- **Tap a running machine** when the orange marker crosses the green band. A
  perfect hit does about 4x the work of a mistimed one and raises the part's
  quality; sloppy taps drag quality down.
- **Quality sets your payout** (0.8x–1.25x) and your reputation, which in turn
  sets what the board pays you.
- **Hire operators** to work a machine unattended. They never sleep, but parts
  they run alone drift toward merely acceptable quality — automation trades
  margin for attention.
- **The night shift** runs while the app is closed: operators keep working the
  jobs you left on the floor. It is measured in in-game days, not real hours -
  an hour away buys about a day and a half of machine time, capped at six days -
  because a day here is 50 seconds, so eight real hours of output would be some
  300 days and would trivialise the game. The calendar deliberately does not
  advance while you are gone, so no overhead is billed and nothing goes late;
  otherwise being away would punish you rather than reward you. Nothing runs at
  all without hired operators, which is the point of hiring them.
- **Something turns up** most days: a machine throws a fault, the steel price
  jumps, an apprentice appears looking for hours, a regular calls in a favour.
  Each is a card with a choice, and the choices bite - a machine you decline to
  repair is genuinely down for two days, and jobs route around it.
- **Each day** (50 real seconds) bills rent, wages and power, then posts fresh
  work. Run out of cash and you take an emergency loan at the cost of
  reputation — the shop never closes.

- **Sell the shop** once you reach shop level 9, which is also when every
  machine has been unlocked. You bank blueprints for what that shop earned
  (`floor(sqrt(earned / 12000))`) and everything else resets. Blueprints buy
  permanent perks that apply to every shop afterwards, and each blueprint ever
  earned adds a passive 2% to pay — so spending them never sets you back.
  Simulated over six relocations, runs compress from 39 in-game days to 26.

Progress is saved to `localStorage` automatically. Saves written by 1.0.0 load
cleanly: the new stations are appended, prestige fields default, and lifetime
earnings seed the first relocation so existing work still counts.

## Layout

| File | What it holds |
| --- | --- |
| `js/data.js` | Tuning constants, stations, products, upgrade and perk definitions |
| `js/game.js` | Simulation: time, routing, taps, payouts, day close, save/load |
| `js/ui.js` | DOM rendering; reads state, never mutates it |
| `js/main.js` | Boot and frame loop |
| `sw.js` | Cache-first service worker for offline play |

Balance lives entirely in `FAB.TUNE` and the product table in `js/data.js`, so
retuning the economy does not touch game logic.
