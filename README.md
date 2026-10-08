# projects

- [`fab-shop/`](fab-shop/) - Fab Shop Tycoon, a mobile web game about running a fabrication shop.
  Live at https://fab-shop-tycoon.onrender.com

Mobile builds for the App Store and Google Play are wrapped with Capacitor in
`ios/` and `android/`. **Step-by-step release guide: [`DEPLOY.md`](DEPLOY.md)**;
background and details in [`store/README.md`](store/README.md).

Fab Shop Toolkit, the shop calculators app, has moved to its own repository,
`joedean75/fab-shop-toolkit`, with its own release guide.

The game is deployed from `main` to Render (`render.yaml`); `netlify.toml` is
kept as an alternative host. `node tools/verify-deploy.js` checks the static
bundle before it ships, and `node tools/smoke-live.js <url>` checks what the
host actually serves afterwards.
