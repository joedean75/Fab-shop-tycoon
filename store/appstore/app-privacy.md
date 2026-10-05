# App Store Connect - App Privacy

Select **"Data Not Collected"** for the app. Nothing else needs configuring.

| Section | Answer |
| --- | --- |
| Data collected from this app | **None** |
| Data linked to the user | None |
| Data used to track the user | None |
| Third-party analytics or advertising SDKs | None |

The game saves progress to the device's local web-view storage and makes no
network requests of its own. In-app purchases go through StoreKit: Apple takes
the payment, and the app only learns on the device which products the account
owns, which it never transmits. Apple's definition of collecting data is
sending it off the device, so the answer stays **Data Not Collected**. If a
server or receipt validation is ever added, declare **Purchases**. There is no account system, no identifiers are
generated or read, and the App Tracking Transparency prompt is not required.

**Privacy policy URL:** https://fab-shop-tycoon.onrender.com/privacy.html

## Age rating questionnaire

Answer **None** to every content category. Expected result: **4+**.
The game contains no violence, no simulated gambling, no user-generated
content and no ads. In-app purchases are not part of the age rating; App
Store Connect lists them on the product page automatically once the products
are attached to a version.

## Export compliance

`ITSAppUsesNonExemptEncryption` is already set to `false` in `ios/App/App/Info.plist`,
so uploads will not prompt for an export-compliance answer. The app uses no
encryption beyond the platform's own HTTPS.
