# Anston mobile apps (iPhone + Android)

The apps are a native shell (Capacitor) that loads **https://myanston.com**.
Anything you deploy to Vercel shows up in the apps right away. You only need a
new store release when something in this `mobile/` folder changes (icon, name,
permissions, plugins).

- App ID / bundle ID: `com.myanston.app`
- App name: Anston
- Inside the app, the site's user agent contains `AnstonApp` (see `lib/native-app.ts`).
  Google sign-in is hidden there: Google blocks it in app web views, and Apple
  would then require Sign in with Apple too.
- Stripe Checkout and Stripe payout setup stay inside the app. Other websites
  open in the phone's browser.
- Links to myanston.com (email confirmations, shared listings) open in the app
  once the two `/.well-known/` files are switched on (step 5).

## Before you submit: things Apple and Google require

1. **Delete account in the app.** Apple rejects apps that let people sign up
   but not delete their account. Anston doesn't have this yet.
2. **Privacy Policy URL:** https://myanston.com/privacy
3. **Support URL:** https://myanston.com/faq (or a contact page), plus support@myanston.com
4. **A test account** for the reviewers (email + password) with a listing or two.
5. **Screenshots:** iPhone 6.9" and Android phone. Take them from the simulator or your phone.

## 1. Accounts (one time)

| | Cost | Notes |
|---|---|---|
| D-U-N-S number | Free | Needed to enroll as **Anston LLC**. Request it at https://developer.apple.com/enroll/duns-lookup/ (takes a few days up to ~2 weeks). |
| Apple Developer Program | $99/year | Enroll as an Organization with the D-U-N-S number and your LLC's details. |
| Google Play Console | $25 once | Choose an Organization account. Google asks for the D-U-N-S number too. |

## 2. Install the tools

```bash
cd mobile
npm install
npx cap sync
```

- **iPhone:** you need a Mac with Xcode (free from the Mac App Store).
- **Android:** Android Studio (free, works on Windows/Mac/Linux). Or skip it:
  the GitHub Action `.github/workflows/android.yml` builds the Android app in
  the cloud. Download the result from the run's **Artifacts** section.

## 3. iPhone → App Store

1. `npm run open:ios` opens the project in Xcode.
2. Click **App** → **Signing & Capabilities** → choose your team (Anston LLC).
   Xcode creates the App ID and turns on Associated Domains automatically.
3. Pick **Any iOS Device**, then **Product → Archive**.
4. In the Organizer window: **Distribute App → App Store Connect → Upload**.
5. At https://appstoreconnect.apple.com create the app (bundle ID `com.myanston.app`).
   Category: Shopping. Fill in the description, screenshots, privacy details
   ("Data used to track you": none; collected: contact info, user content,
   purchases, identifiers), then **Submit for Review**.

No Mac? Codemagic (https://codemagic.io) or Ionic Appflow can build and upload iOS apps from the cloud.

## 4. Android → Google Play

1. Create an upload key (keep this file and its passwords safe and backed up; you need them for every update):
   ```bash
   keytool -genkey -v -keystore anston-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias anston
   ```
2. Either build in Android Studio (`npm run open:android` → **Build → Generate Signed App Bundle**),
   or add the keystore as GitHub secrets (listed at the top of
   `.github/workflows/android.yml`) and download `anston-release-aab` from the Action.
3. In Play Console: **Create app** → upload the `.aab` to **Internal testing** first.
   Google requires new personal accounts to run a closed test; organization accounts usually skip that.
4. Fill in the store listing, content rating, data safety and target audience, then send it to **Production**.

## 5. Make myanston.com links open in the app

In Vercel → Settings → Environment Variables, add these, then redeploy:

- `APPLE_TEAM_ID`: Apple Developer → Membership → Team ID
- `ANDROID_CERT_SHA256`: Play Console → Test and release → App integrity → **App signing key certificate** SHA-256

Check: https://www.myanston.com/.well-known/apple-app-site-association and
https://www.myanston.com/.well-known/assetlinks.json should show JSON.
Links must use **www.myanston.com** to open the app (Apple and Android can’t verify
myanston.com because it redirects to www).

## Updating the app later

- Website changes: just deploy to Vercel. Nothing to do here.
- New icon: replace the images in `mobile/assets/` and run `npm run icons`.
- Any change in `mobile/`: bump the version (Xcode: Version/Build; Android:
  `versionCode`/`versionName` in `android/app/build.gradle`), run `npx cap sync`, and upload again.
