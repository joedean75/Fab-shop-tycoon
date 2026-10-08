# Deploying Fab Shop Tycoon, step by step

One codebase, three places it ships:

| Where | How it gets there | State |
| --- | --- | --- |
| Website - https://fab-shop-tycoon.onrender.com | Render builds every push to `main` | Live, automatic |
| Google Play | A signed `.aab` you upload in Play Console | App created, bundles uploaded |
| App Store | The **iOS release (App Store)** workflow builds on GitHub's Mac and uploads to TestFlight | Developer Program done; app not submitted yet |

No Mac and no Java needed on your side: everything below is in a web browser.
The words for every store form are already written in `store/` (details and
background: [`store/README.md`](store/README.md)).

Identity (permanent - both stores already know it):

- App name **Fab Shop Tycoon**, package / bundle ID **`com.fabshoptycoon.game`**
- In-app products: `com.fabshoptycoon.game.double_pay`, `.night_crew`, `.big_contract` (`store/products.json`)
- Support **corvuscompanies6@gmail.com**, privacy https://fab-shop-tycoon.onrender.com/privacy.html,
  support page https://fab-shop-tycoon.onrender.com/support.html

---

## 1. Website (Render) - nothing to do

Service `fab-shop-tycoon` builds `main` with `node tools/verify-deploy.js` and serves `fab-shop/`.
Merging to `main` deploys it within a couple of minutes. To check what is live:
`npm run smoke https://fab-shop-tycoon.onrender.com`.

## 2. GitHub secrets (once)

**github.com/joedean75/projects -> Settings -> Secrets and variables -> Actions -> New repository
secret.** Paste each value exactly.

| Secret | Value | Used by |
| --- | --- | --- |
| `APPLE_TEAM_ID` | developer.apple.com -> Account -> Membership details -> Team ID | iOS |
| `APPSTORE_API_KEY_ID` | App Store Connect -> Users and Access -> Integrations -> App Store Connect API -> Team Keys -> Key ID | iOS |
| `APPSTORE_API_ISSUER_ID` | Issuer ID above that key list | iOS |
| `APPSTORE_API_PRIVATE_KEY` | the whole `AuthKey_XXXX.p8`, BEGIN/END lines included | iOS |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | from step A1 | Android |
| `PLAY_SERVICE_ACCOUNT_JSON` | optional, step A5 | Android |

No API key yet: Team Keys -> **+** -> name "GitHub", access **Admin** (cloud signing needs Admin) ->
Generate -> **Download** (Apple allows it once - keep the file). The same key also serves the
toolkit repo.

## 3. Android - Google Play

### A. Move signing to a key you own - do this soon

Every game bundle so far was signed with an upload key that exists only in Claude's temporary
work container. When that container is recycled the key is gone, and Play rejects updates signed
with anything else. Replace it once with a key you keep:

1. **A1 - make the key:** repo -> **Actions** -> **Create Android upload key (run once)** -> Run
   workflow -> type `CREATE` -> Run. When green, open the run and download **upload-key**. Unzip.
2. **A2 - secrets:** add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, each the whole contents of the file with that name.
   Keep the zip somewhere private (password manager or private drive) and delete the artifact from
   the run page.
3. **A3 - tell Play:** Play Console -> Fab Shop Tycoon -> Test and release -> **App integrity** ->
   App signing -> **Request upload key reset** -> reason "I lost my upload key" (true, once the
   container goes) -> upload `upload_certificate.pem` from the zip -> Request.
4. **A4 - wait for the email.** Google approves, usually within a couple of days, and says from
   which date the new key is accepted. Until then, ask me and I will sign bundles with the old key
   while this session still has it.

### B. Upload a build (every release)

1. Actions -> **Android release (Play)** -> Run workflow -> branch `main`, track `none` -> Run
   (about 5 minutes). Download **fab-shop-release-aab** and unzip `app-release.aab`.
2. Play Console -> Test and release -> pick the track (**Closed testing** while you gather testers,
   **Production** once allowed) -> **Create new release** -> upload the `.aab` -> release notes from
   `store/play/whatsnew/whatsnew-en-US` -> Next -> Save -> **Send for review** on the Publishing
   overview page.

### C. Getting to production

A personal Play account made after 13 November 2023 needs a **closed test with at least 12 testers
opted in for 14 days in a row**, then Dashboard -> **Apply for production**. Testers: share the
closed-test opt-in link with co-workers, other shops, and friends with Android phones; each must
accept it and install the app from the Play link.

### D. In-app products (Play)

1. Settings -> **Payments profile**: create or link one (needed to sell anything).
2. Monetize with Play -> Products -> **One-time products** -> create the three products with the ids,
   names and descriptions in `store/products.json`, set prices (suggested 4.99 / 2.99 / 0.99) ->
   **Activate** each. (Play lets you create them only after a 1.6.0+ bundle is on any track.)
3. Settings -> **License testing**: add your testers' Google accounts so their test purchases are
   not charged.

### E. Optional - let GitHub upload for you

After the first manual upload: create a Google Cloud service account with a JSON key, enable the
**Google Play Android Developer API**, invite the service account in Play Console -> Users and
permissions with release permissions for Fab Shop Tycoon, and store the JSON as
`PLAY_SERVICE_ACCOUNT_JSON`. Then Run workflow with a track uploads directly.

## 4. iOS - App Store

### 4.1 Register the bundle ID (once)

developer.apple.com -> Account -> **Certificates, Identifiers & Profiles** -> Identifiers -> **+** ->
App IDs -> App -> Description `Fab Shop Tycoon`, Bundle ID **Explicit** `com.fabshoptycoon.game`,
tick **In-App Purchase** if it is not already ticked -> Continue -> Register.

### 4.2 Agreements, banking and tax (once - needed for in-app purchases)

App Store Connect -> **Business** -> sign the **Paid Apps Agreement**, add a bank account and fill in
the tax forms. Purchases stay unavailable until this shows **Active**.

### 4.3 Create the app record (once)

App Store Connect -> Apps -> **+** -> New App -> iOS, Name `Fab Shop Tycoon`, Primary language
English (U.S.), Bundle ID `com.fabshoptycoon.game`, SKU `fabshoptycoon`, Full access -> Create.

### 4.4 Build and upload

With the four Apple secrets in place: Actions -> **iOS release (App Store)** -> Run workflow (branch
`main`, "Upload to TestFlight" ticked). 15-25 minutes on GitHub's Mac, then 10-30 minutes of Apple
processing before it shows under **TestFlight**. Export compliance is pre-answered in the app.

### 4.5 In-app purchases (App Store)

The app -> **Monetization -> In-App Purchases** -> **+** for each product in `store/products.json`:
- Type: Non-Consumable for `double_pay` and `night_crew`, Consumable for `big_contract`
- Product ID exactly as listed, reference name = the name, price tier as suggested
- Localization: display name and description from the `name` and `apple_description` fields
- Review screenshot: `store/appstore/iap-review-screenshot.png`; review note: "Upgrades tab ->
  scroll to Store"

Test on your iPhone: Users and Access -> **Sandbox** -> add a tester with an email you control;
install the TestFlight build (TestFlight -> Internal Testing -> add yourself -> install the
TestFlight app) and buy with the sandbox account.

### 4.6 Listing and submission

1. **App Information**: subtitle from `store/appstore/listing/en-US/subtitle.txt`; Category
   **Games** -> Simulation (secondary Strategy); age rating questionnaire: **None** to everything
   (4+); content rights: no third-party content.
2. **Pricing and Availability**: Free.
3. **App Privacy**: privacy policy URL above -> **Data Not Collected** (`store/appstore/app-privacy.md`).
4. **iOS App 1.6.0** version page:
   - Screenshots: `store/appstore/screenshots/iphone-6.9/` and `ipad-12.9/`
   - Promotional text, description, keywords: `store/appstore/listing/en-US/`
   - Support and marketing URLs: `store/appstore/listing/en-US/urls.txt`
   - **Build**: pick the TestFlight build
   - **In-App Purchases and Subscriptions**: add all three (first submission only - they are
     reviewed with the app)
   - App Review Information: no sign-in; contact details; notes: paste `store/appstore/review-notes.md`
5. **Add for Review** -> **Submit for Review**. Usually 1-3 days.

## 5. Releasing an update (all three)

```sh
npm run version:set 1.7.0   # package.json, Android, Xcode, worker cache, in-game version
npm run check               # bundle, versions, listings
```

1. Commit and merge to `main` -> the website updates by itself.
2. GitHub -> Releases -> Draft a new release -> tag `v1.7.0` -> Publish. That runs both release
   workflows: iOS uploads to TestFlight; Android builds the `.aab` (section B to upload it).
3. App Store Connect -> **+** next to iOS App -> `1.7.0` -> pick the build -> Submit for Review.

Or just ask me: "release 1.7.0" and I will do steps 1-2.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Play: "uploaded with the wrong key" | The upload key reset (A3) is not active yet - wait for Google's date, or ask me for a bundle signed with the old key |
| Play: "Version code 10600 has already been used" | Bump the version (section 5) |
| Play: cannot create in-app products | Upload a 1.6.0+ bundle to any track first, and set up the payments profile |
| iOS run: "No suitable application records were found" | Step 4.3 missing, or a different bundle ID |
| iOS run: cannot create a certificate / cloud signing permission error | The API key needs the **Admin** role |
| iOS run builds for the simulator only | One of the four Apple secrets is missing or misnamed |
| iOS purchases show no price in TestFlight | Paid Apps Agreement not active, or a product ID differs from `store/products.json` |
