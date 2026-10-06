# Shipping Fab Shop Tycoon to the App Store and Google Play

One codebase: the web game in `fab-shop/` is wrapped by Capacitor into the
native projects in `ios/` and `android/`. Nothing is duplicated - `npx cap sync`
copies the same files into both shells.

```
fab-shop/            the game (also the live web build)
capacitor.config.json  app id, name, splash and status bar behaviour
android/             generated Android project (committed, editable)
ios/                 generated Xcode project (committed, editable)
assets/src/          SVG sources for icons, splash and the feature graphic
store/               listing copy, compliance answers, generated store art
tools/               verification and asset generation scripts
```

## What is already done

- App ID `com.fabshoptycoon.game` on both platforms, version 1.0.0 / versionCode 10000.
- Portrait lock, dark splash and status bar, Android back button that saves and
  backgrounds instead of quitting mid-day.
- Every icon, splash and store image generated from `assets/src` (`npm run assets`).
- Store screenshots at the exact sizes both stores accept (`npm run shots`).
- Listing copy, data safety, content rating, privacy policy and review notes,
  with corvuscompanies6@gmail.com as the published support contact.
- Release signing wired into Gradle, and CI workflows for both stores.
- The Android release bundle (`app-release.aab`) has been built and verified.

## What still needs a human

These need accounts or money, and cannot be automated from here.

| Step | Where | Notes |
| --- | --- | --- |
| Google Play developer account | play.google.com/console | One-time 25 USD. |
| Apple Developer Program | developer.apple.com | 99 USD per year. Required even for a free app. |
| Create the upload keystore | local machine | See below. Losing it means you can never update the app. |
| Build and upload the iOS archive | GitHub Actions | The `ios-release` workflow, on GitHub's Mac. No Mac of your own needed. |
| Fill the store forms | both consoles | Answers are in `store/play/*.md` and `store/appstore/*.md`. |

## Android

### One-time: create the upload key

```sh
keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias upload
```

Keep `upload.jks` somewhere safe and out of the repo (`.gitignore` already
excludes `*.jks`). For local release builds create `keystore.properties` at the
repo root:

```properties
storeFile=/absolute/path/to/upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

### Build

```sh
npm ci
npm run verify          # the web bundle must be sound before it is packaged
npx cap sync android
cd android && ./gradlew bundleRelease
# -> android/app/build/outputs/bundle/release/app-release.aab
```

### Upload

Play Console -> Create app -> upload the `.aab` to the **Internal testing**
track first. Fill Data safety (`store/play/data-safety.md`), the content rating
questionnaire (`store/play/content-rating.md`), and the store listing from
`store/play/listing/en-US/`, with art from `store/play/`.

To automate it: add `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload.jks`),
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` and
`PLAY_SERVICE_ACCOUNT_JSON` as repository secrets, then run the
**Android release (Play)** workflow and pick a track.

## iOS

### Without a Mac (the normal route)

The **iOS release (App Store)** workflow builds on GitHub's macOS runner and
uploads straight to TestFlight. It uses Xcode's cloud-managed signing: the
App Store Connect API key is the only credential, and Xcode creates the
distribution certificate and the App Store profile itself. There is no `.p12`
or `.mobileprovision` to make or store.

1. App Store Connect -> Users and Access -> Integrations -> App Store Connect
   API -> **Team Keys** -> generate a key with the **Admin** role (cloud
   signing needs Admin to create the certificate). Download the `.p8` - Apple
   lets you download it once.
2. GitHub -> the repo -> Settings -> Secrets and variables -> Actions -> add:

   | Secret | Value |
   | --- | --- |
   | `APPLE_TEAM_ID` | Team ID, developer.apple.com -> Account -> Membership |
   | `APPSTORE_API_KEY_ID` | the key's Key ID |
   | `APPSTORE_API_ISSUER_ID` | the Issuer ID above the key list |
   | `APPSTORE_API_PRIVATE_KEY` | the whole `.p8` file, BEGIN and END lines included |

3. Actions -> **iOS release (App Store)** -> Run workflow (branch `main`).
   The build appears under TestFlight 10-30 minutes after the run finishes.

Each run uploads as build `<versionCode>.<run number>` (1.6.0 run 14 is
`10600.14`), so re-running never collides with a build Apple already has.
Pushing a `v*` tag runs it too.

The archive is built unsigned and signed at export. Signing the archive would
need a development profile, which Apple only issues to a team with a
registered iPhone; distribution signing has no such rule.

### With a Mac

Requires macOS and Xcode; the rest of this repo does not.

```sh
npm ci
npm run verify
npx cap sync ios
npx cap open ios        # or: open ios/App/App.xcodeproj
```

Capacitor 8 manages iOS dependencies with Swift Package Manager, so there is no
Podfile and no `.xcworkspace` - Xcode resolves the packages in
`ios/App/CapApp-SPM` on first open.

In Xcode: select the **App** target -> Signing & Capabilities -> pick your team.
The bundle identifier is already `com.fabshoptycoon.game`. Product -> Archive,
then distribute to App Store Connect.

In App Store Connect: create the app, set up the in-app purchases (above), set App Privacy to **Data Not Collected**
(`store/appstore/app-privacy.md`), paste the listing from
`store/appstore/listing/en-US/`, upload screenshots from
`store/appstore/screenshots/`, and paste `store/appstore/review-notes.md` into
the review notes field.

Without the four secrets the release workflow still compiles the app for the
simulator, so the project is checked on every run.

## In-app purchases

Three products, defined once in `store/products.json` (ids, types, names,
descriptions, suggested prices) and sold by `fab-shop/js/store.js` through
`@capgo/native-purchases` - StoreKit 2 on iOS, Play Billing on Android. There
is no server and no RevenueCat-style account: the stores are the record of
what was bought, and the game re-reads it on every launch.

| Id | Apple type | Play | Suggested |
| --- | --- | --- | --- |
| `com.fabshoptycoon.game.double_pay` | Non-Consumable | one-time, never consumed | $4.99 |
| `com.fabshoptycoon.game.night_crew` | Non-Consumable | one-time, never consumed | $2.99 |
| `com.fabshoptycoon.game.big_contract` | Consumable | one-time, consumed by the app | $0.99 |

Before anything can be sold:

- **Apple** - sign the **Paid Apps Agreement** and fill in banking and tax
  (App Store Connect -> Business). Create the three products under the app's
  **Monetization -> In-App Purchases**, each with a review screenshot of the
  store panel, then attach them to the version you submit. Test with a
  **Sandbox** account (Users and Access -> Sandbox) on a TestFlight build.
- **Google** - set up a **payments profile**, upload a 1.6.0+ bundle to any
  track (Play will not let you create products until a build with the
  BILLING permission exists), then create the three one-time products. Add
  your testers under **License testing** so their purchases are not charged.

`npm run check:store` fails if a product id in `products.json` does not match
what the game requests - a one-character mismatch otherwise shows up only as a
store panel with no price on it.

Purchases are stored outside the save (`fabshop.entitlements.v1`), so **Reset
shop** and selling up never remove them; **Restore purchases** under the store
re-reads them from the account.

## Releasing a new version

```sh
npm run version:set 1.1.0   # package.json, gradle, Xcode and the worker cache
npm run assets              # only if the art changed
npm run shots               # only if the UI changed
npm run check:store         # listing limits and screenshot sizes
git commit -am "Release 1.1.0" && git tag v1.1.0 && git push --tags
```

Tagging `v*` triggers both release workflows. `versionCode` is derived from the
semver (`major*10000 + minor*100 + patch`), so it always increases - Play
rejects a build whose versionCode did not.

## Checks

| Command | What it catches |
| --- | --- |
| `npm run verify` | Broken web bundle: missing files, bad manifest, unparseable JS. |
| `npm run smoke <url>` | A deployed site serving the wrong thing (status, content types). |
| `npm run check:store` | Listing text over a store's character limit, wrong screenshot sizes, unfilled placeholders. |
| `node tools/set-version.js --check` | Version drift between web, Android and iOS. |
