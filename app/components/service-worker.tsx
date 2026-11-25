"use client";

import { useEffect } from "react";

// Registers /sw.js so Anston can be installed as an app and show an
// offline page. Only runs in production so it never caches dev builds.
//
// Not used inside the Anston phone apps: they have their own offline screen,
// and on Android the service worker's requests don't carry the app's
// "AnstonApp" user agent, so the site couldn't tell it was in the app.
export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (navigator.userAgent.includes("AnstonApp")) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* installing the app is optional; ignore failures */
      });
  }, []);

  return null;
}
