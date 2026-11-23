"use client";

import { useEffect } from "react";

// Registers /sw.js so Anston can be installed as an app and show an
// offline page. Only runs in production so it never caches dev builds.
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* installing the app is optional; ignore failures */
      });
  }, []);

  return null;
}
