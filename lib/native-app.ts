import "server-only";
import { headers } from "next/headers";

// The Anston iPhone/Android apps add this to their browser user agent
// (see mobile/capacitor.config.ts), so the site can tell when it's
// running inside the app.
export const NATIVE_APP_UA = "AnstonApp";

export async function isNativeApp() {
  return ((await headers()).get("user-agent") ?? "").includes(NATIVE_APP_UA);
}
