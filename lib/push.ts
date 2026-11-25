import "server-only";
import { createSign, createPrivateKey, sign as cryptoSign, timingSafeEqual } from "node:crypto";
import http2 from "node:http2";

// Sends phone notifications to the Anston apps:
//   Android → Firebase Cloud Messaging (FCM)
//   iPhone  → Apple Push Notification service (APNs)
//
// Vercel environment variables:
//   PUSH_SECRET           same value as the 'push_secret' Vault secret in Supabase
//   FCM_SERVICE_ACCOUNT   the Firebase service-account JSON (whole file contents)
//   APNS_KEY              Apple .p8 key contents (-----BEGIN PRIVATE KEY----- ...)
//   APNS_KEY_ID           the key's 10-character ID
//   APNS_TEAM_ID          Apple Developer Team ID
//   APNS_SANDBOX          "true" only while testing builds run from Xcode

export type PushTarget = { token: string; platform: "android" | "ios" };
export type PushMessage = { title: string; body: string; link: string };

const BUNDLE_ID = "com.myanston.app";

export function pushSecretMatches(given: string | null) {
  const expected = process.env.PUSH_SECRET ?? "";
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

// ---------------------------------------------------------------------------
// Android (FCM HTTP v1)
// ---------------------------------------------------------------------------
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let fcmToken: { value: string; expires: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    if (!raw) return null;
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

async function fcmAccessToken(sa: ServiceAccount) {
  if (fcmToken && fcmToken.expires > Date.now() + 60_000) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${signer.sign(sa.private_key).toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`FCM auth failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  fcmToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return fcmToken.value;
}

// Returns the tokens Firebase says are no longer valid.
async function sendAndroid(tokens: string[], msg: PushMessage): Promise<string[]> {
  const sa = serviceAccount();
  if (!sa || tokens.length === 0) return [];
  const access = await fcmAccessToken(sa);
  const invalid: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data: { link: msg.link },
            android: { priority: "high", notification: { color: "#7A1E2B", sound: "default" } },
          },
        }),
      });
      if (res.status === 404 || res.status === 400) {
        const text = await res.text();
        if (text.includes("UNREGISTERED") || text.includes("INVALID_ARGUMENT")) invalid.push(token);
      }
    })
  );
  return invalid;
}

// ---------------------------------------------------------------------------
// iPhone (APNs, token-based auth over HTTP/2)
// ---------------------------------------------------------------------------
let apnsJwt: { value: string; issued: number } | null = null;

function apnsAuth() {
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!key || !keyId || !teamId) return null;
  // Apple wants a new token at most every 20-60 minutes.
  if (apnsJwt && Date.now() - apnsJwt.issued < 40 * 60_000) return apnsJwt.value;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signature = cryptoSign("sha256", Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(key.replace(/\\n/g, "\n")),
    dsaEncoding: "ieee-p1363",
  });
  apnsJwt = { value: `${header}.${claims}.${b64url(signature)}`, issued: Date.now() };
  return apnsJwt.value;
}

async function sendIos(tokens: string[], msg: PushMessage): Promise<string[]> {
  const jwt = apnsAuth();
  if (!jwt || tokens.length === 0) return [];
  const host = process.env.APNS_SANDBOX === "true" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const payload = JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default" }, link: msg.link });
  const client = http2.connect(host);
  const invalid: string[] = [];
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const req = client.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              authorization: `bearer ${jwt}`,
              "apns-topic": BUNDLE_ID,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "content-type": "application/json",
            });
            let status = 0;
            let body = "";
            req.on("response", (h) => (status = Number(h[":status"])));
            req.on("data", (c) => (body += c));
            req.on("end", () => {
              if (status === 410 || (status === 400 && body.includes("BadDeviceToken"))) invalid.push(token);
              resolve();
            });
            req.on("error", () => resolve());
            req.setTimeout(10_000, () => {
              req.close();
              resolve();
            });
            req.end(payload);
          })
      )
    );
  } finally {
    client.close();
  }
  return invalid;
}

export async function sendPush(targets: PushTarget[], msg: PushMessage) {
  const android = targets.filter((t) => t.platform === "android").map((t) => t.token);
  const ios = targets.filter((t) => t.platform === "ios").map((t) => t.token);
  const results = await Promise.allSettled([sendAndroid(android, msg), sendIos(ios, msg)]);
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
