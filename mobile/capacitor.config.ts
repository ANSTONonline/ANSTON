import type { CapacitorConfig } from "@capacitor/cli";

// The Anston app loads the live site (www.myanston.com) inside a native shell,
// so every update you deploy to Vercel shows up in the app right away —
// no new App Store / Google Play release needed for website changes.
const config: CapacitorConfig = {
  appId: "com.myanston.app",
  appName: "Anston",
  // Shown only if myanston.com can't be reached (no internet).
  webDir: "www",
  server: {
    // www is the main address (myanston.com redirects to it).
    url: "https://www.myanston.com",
    errorPath: "index.html",
    // Pages that stay inside the app. Any other site (Instagram, tracking
    // links, etc.) opens in the phone's browser instead.
    allowNavigation: [
      "myanston.com",
      "www.myanston.com",
      "checkout.stripe.com",
      "connect.stripe.com",
      "*.stripe.com",
      "*.stripe.network",
    ],
  },
  // Lets the site know it's running inside the app (see lib/native-app.ts).
  appendUserAgent: "AnstonApp",
  backgroundColor: "#ffffff",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#ffffff",
      overlaysWebView: false,
    },
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
