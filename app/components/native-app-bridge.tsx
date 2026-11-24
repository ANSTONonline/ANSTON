"use client";

import { useEffect } from "react";

type AppPlugin = {
  addListener: (
    event: "appUrlOpen" | "backButton",
    cb: (e: { url?: string; canGoBack?: boolean }) => void
  ) => Promise<{ remove: () => void }>;
  exitApp: () => void;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { App?: AppPlugin } };

// Only does anything inside the Anston iPhone/Android app (Capacitor injects
// window.Capacitor there). On the website it's a no-op.
export default function NativeAppBridge() {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    const App = cap?.Plugins?.App;
    if (!cap?.isNativePlatform?.() || !App) return;

    const subs: Promise<{ remove: () => void }>[] = [];

    // A myanston.com link was tapped (email confirmation, shared listing...):
    // open that page inside the app.
    subs.push(
      App.addListener("appUrlOpen", ({ url }) => {
        if (!url) return;
        try {
          const u = new URL(url);
          if (u.hostname === "myanston.com" || u.hostname === "www.myanston.com") {
            window.location.href = u.pathname + u.search + u.hash;
          }
        } catch {
          /* ignore bad links */
        }
      })
    );

    // Android back button: go back a page, or close the app on the first page.
    subs.push(
      App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else App.exitApp();
      })
    );

    return () => subs.forEach((s) => s.then((h) => h.remove()));
  }, []);

  return null;
}
