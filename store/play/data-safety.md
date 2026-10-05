# Play Console - Data safety form

Answers for the Data safety section. They follow from the code: the game has no
network calls of its own, no analytics or ad SDKs, no accounts and no server.
Re-check this if that ever changes, because a false declaration is a policy
violation.

**In-app purchases do not change the answer.** Play defines collection as
"transmitting data from your app off a user's device". Payments go through
Google Play's billing system, which Play exempts when the app never sees the
payment details - and this one never does. The app does read which products
the signed-in account owns, but only to unlock them on the device: it keeps a
yes/no per product in local storage and never sends it anywhere. If a server
or receipt validation is ever added, **Purchase history** has to be declared.

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | N/A (no data collected) |
| Do you provide a way for users to request that their data be deleted? | N/A (no data collected); in-app **Reset shop** clears local progress |

**Data types collected:** none.
**Data types shared:** none.
**Third-party SDKs:** none. The only dependency is the Capacitor runtime, which
performs no data collection in this configuration.

Local save data (cash, level, reputation, upgrades, jobs) is written to the web
view's `localStorage` on the device. Play does not classify on-device-only
storage as collection, since it never leaves the device.

**Privacy policy URL:** https://fab-shop-tycoon.onrender.com/privacy.html
