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

These need accounts, money, or a Mac, and cannot be automated from here.

| Step | Where | Notes |
| --- | --- | --- |
| Google Play developer account | play.google.com/console | One-time 25 USD. |
| Apple Developer Program | developer.apple.com | 99 USD per year. Required even for a free app. |
| Create the upload keystore | local machine | See below. Losing it means you can never update the app. |
| Build and upload the iOS archive | a Mac with Xcode | Or let the `ios-release` workflow do it on a macOS runner. |
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

In App Store Connect: create the app, set App Privacy to **Data Not Collected**
(`store/appstore/app-privacy.md`), paste the listing from
`store/appstore/listing/en-US/`, upload screenshots from
`store/appstore/screenshots/`, and paste `store/appstore/review-notes.md` into
the review notes field.

To automate it: add `APPLE_CERTIFICATE_P12`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_PROVISIONING_PROFILE`, `APPLE_TEAM_ID`, `APPSTORE_API_KEY_ID`,
`APPSTORE_API_ISSUER_ID` and `APPSTORE_API_PRIVATE_KEY` as secrets, then run the
**iOS release (App Store)** workflow. Without those secrets the workflow still
compiles the app for the simulator, so the project is checked on every run.

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
