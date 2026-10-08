# Notes for App Review

No sign-in is required. The game opens straight into playable state, and all
content is available immediately.

**How to see the core loop in under a minute**

1. Open the app. It starts on the **Floor** tab with an empty shop.
2. Tap **Orders** in the bottom bar and press **Take** on any job.
3. Return to **Floor**. The job loads into the Plasma Table and a timing bar
   appears under it.
4. Tap the machine card when the orange marker is inside the green band. Each
   well-timed tap advances the work and raises the part's quality.
5. The job routes itself to the next machine it needs, and pays out when it
   finishes. A day lasts about 50 seconds, after which a summary appears.

**Things reviewers often ask about this app**

- **In-app purchases** are under **Upgrades -> Store** (scroll to the bottom of
  the Upgrades tab). Two non-consumables and one consumable, all optional:
  - `com.fabshoptycoon.game.double_pay` - Union Contract (non-consumable)
  - `com.fabshoptycoon.game.night_crew` - Night Crew (non-consumable)
  - `com.fabshoptycoon.game.big_contract` - Big Contract (consumable)

  **Restore purchases** is directly beneath them. Buying the Union Contract
  visibly doubles the pay on every order already on the board; the Big
  Contract adds cash at once. Nothing in the game is locked behind a purchase.
- There is no advertising and there are no subscriptions.
- There are no accounts, logins, or servers. Apart from StoreKit, the app makes
  no network requests; the game runs from files bundled in the app and works in
  airplane mode.
- The only stored data is local game progress, cleared by the **Reset shop**
  button under the Upgrades tab.
- The app is portrait-only by design and opts out of iPad multitasking
  (`UIRequiresFullScreen`).

Demo account: not applicable.
