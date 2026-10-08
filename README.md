# Fab Shop Tycoon

A mobile game about running a metal fabrication shop: take orders, cut, bend,
weld and ship before the deadline. One plain HTML/CSS/JS game shipped three
ways:

- **Web:** https://fab-shop-tycoon.onrender.com
- **Android:** Google Play, package `com.fabshoptycoon.game`
- **iOS:** App Store, bundle ID `com.fabshoptycoon.game`

**How to ship each one, step by step: [`DEPLOY.md`](DEPLOY.md)**; background
and details in [`store/README.md`](store/README.md).

```
fab-shop/            the game - also exactly what the website serves
android/  ios/       Capacitor native projects (committed, editable)
capacitor.config.json  app id, name, splash and status bar
assets/src/          SVG sources for icons, splash and the Play feature graphic
store/               listing copy, privacy answers, review notes, screenshots, products
tools/               checks, version sync, icon and screenshot generators
.github/workflows/   native build checks, Play and TestFlight releases
render.yaml          the website on Render (netlify.toml is an alternative host)
```

`npm run check` verifies the web bundle, version sync and store listings;
`npm run smoke <url>` checks what a host actually serves.

The sister app, Fab Shop Toolkit (shop calculators, bend simulator, nester and
quotes), lives in `joedean75/fab-shop-toolkit`.
