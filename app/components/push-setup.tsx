"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { forgetPushToken, isSignedIn, registerPushToken } from "../push-actions";

type Text = { title: string; body: string; turnOn: string; notNow: string };

type Handle = { remove: () => void };
type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (plugin: string, method: string, options?: object) => Promise<Record<string, unknown>>;
  addListener?: (plugin: string, event: string, cb: (data: Record<string, unknown>) => void) => Handle;
};

const TOKEN_KEY = "anston.pushToken";
const DISMISSED_KEY = "anston.pushPromptDismissed";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000; // ask again after 2 weeks

function cap(): CapacitorBridge | null {
  const c = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return c?.isNativePlatform?.() && c.nativePromise && c.addListener ? c : null;
}

function storage(key: string, value?: string | null) {
  try {
    if (value === undefined) return window.localStorage.getItem(key);
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return null;
}

// Phone notifications inside the Anston iPhone/Android app. Does nothing on
// the website. Asks permission with a small banner (only when signed in),
// saves the phone's token, and opens the right page when a notification is tapped.
export default function PushSetup({ text }: { text: Text }) {
  const router = useRouter();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const c = cap();
    if (!c) return;
    const platform = c.getPlatform?.() === "ios" ? "ios" : "android";
    const handles: Handle[] = [];

    // Tapped a notification: open its page.
    handles.push(
      c.addListener!("PushNotifications", "pushNotificationActionPerformed", (action) => {
        const data = (action.notification as { data?: { link?: unknown } } | undefined)?.data;
        const link = typeof data?.link === "string" && data.link.startsWith("/") ? data.link : null;
        if (link) router.push(link);
      })
    );

    // Got this phone's token: save it for the signed-in member, or forget it
    // if nobody is signed in any more.
    handles.push(
      c.addListener!("PushNotifications", "registration", async (data) => {
        const token = typeof data.value === "string" ? data.value : "";
        if (!token) return;
        const result = await registerPushToken(token, platform);
        if (result === "saved") storage(TOKEN_KEY, token);
        if (result === "signed_out") {
          await forgetPushToken(token);
          storage(TOKEN_KEY, null);
        }
      })
    );

    (async () => {
      try {
        // Android builds without Firebase set up can't register (it would crash).
        if (platform === "android") {
          const info = await c.nativePromise!("AnstonApp", "info").catch(() => null);
          if (!info?.pushReady) return;
        }
        const perm = await c.nativePromise!("PushNotifications", "checkPermissions");
        const signedIn = await isSignedIn();

        if (!signedIn) {
          const old = storage(TOKEN_KEY);
          if (old) {
            await forgetPushToken(old);
            storage(TOKEN_KEY, null);
          }
          return;
        }
        if (perm.receive === "granted") {
          await c.nativePromise!("PushNotifications", "register");
        } else if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          const dismissed = Number(storage(DISMISSED_KEY) ?? 0);
          if (Date.now() - dismissed > DISMISS_FOR_MS) setShowPrompt(true);
        }
      } catch {
        /* notifications are optional */
      }
    })();

    return () => handles.forEach((h) => h.remove());
  }, [router]);

  async function turnOn() {
    setShowPrompt(false);
    const c = cap();
    if (!c) return;
    try {
      const perm = await c.nativePromise!("PushNotifications", "requestPermissions");
      if (perm.receive === "granted") await c.nativePromise!("PushNotifications", "register");
      else storage(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  function notNow() {
    setShowPrompt(false);
    storage(DISMISSED_KEY, String(Date.now()));
  }

  if (!showPrompt) return null;
  return (
    <div
      role="dialog"
      aria-labelledby="push-prompt-title"
      className="fixed inset-x-3 bottom-3 z-50 rounded-xl border bg-white p-4 shadow-lg sm:inset-x-auto sm:end-4 sm:w-96"
    >
      <p id="push-prompt-title" className="font-semibold">{text.title}</p>
      <p className="mt-1 text-sm text-gray-600">{text.body}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={turnOn} className="flex-1 rounded-lg bg-[#7A1E2B] py-2 font-medium text-white">
          {text.turnOn}
        </button>
        <button onClick={notNow} className="flex-1 rounded-lg border py-2 font-medium">
          {text.notNow}
        </button>
      </div>
    </div>
  );
}
