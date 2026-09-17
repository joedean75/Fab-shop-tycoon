# Play Console - Data safety form

Answers for the Data safety section. They follow from the code: the game has no
network calls of its own, no SDKs, and no accounts. Re-check this if that ever
changes, because a false declaration is a policy violation.

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
