import { createClient as createPlainClient } from "@supabase/supabase-js";
import { pushSecretMatches, sendPush, type PushTarget } from "@/lib/push";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/server";

// The database calls this (private.push in Supabase) to deliver phone
// notifications. Protected by the shared PUSH_SECRET.
export async function POST(request: Request) {
  const secret = request.headers.get("x-push-secret");
  if (!pushSecretMatches(secret)) return new Response("Forbidden", { status: 403 });

  let body: { tokens?: PushTarget[]; title?: string; body?: string; link?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const targets = (body.tokens ?? []).filter(
    (t): t is PushTarget =>
      typeof t?.token === "string" && t.token.length >= 20 && (t.platform === "android" || t.platform === "ios")
  );
  const link = typeof body.link === "string" && body.link.startsWith("/") ? body.link : "/";
  if (targets.length === 0) return Response.json({ sent: 0 });

  const invalid = await sendPush(targets, {
    title: String(body.title ?? "Anston").slice(0, 120),
    body: String(body.body ?? "").slice(0, 300),
    link,
  });

  if (invalid.length > 0) {
    const supabase = createPlainClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await supabase.rpc("forget_invalid_push_tokens", { p_secret: secret, p_tokens: invalid });
  }

  return Response.json({ sent: targets.length - invalid.length, invalid: invalid.length });
}
