# projects

- [`fab-shop/`](fab-shop/) - Fab Shop Tycoon, a mobile web game about running a fabrication shop.
  Live at https://fab-shop-tycoon.onrender.com

Mobile builds for the App Store and Google Play are wrapped with Capacitor in
`ios/` and `android/`; see [`store/README.md`](store/README.md) to submit.

Deploy configs live at the repo root (`netlify.toml`, `render.yaml`,
`.github/workflows/pages.yml`); `node tools/verify-deploy.js` checks the static
bundle before it ships.
