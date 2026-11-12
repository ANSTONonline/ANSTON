import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

// Links in Anston's emails ("Confirm your email", "Reset your password") and
// the return from Google sign-in land here, then go on to `next`.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only ever send people to a page on this site.
  const nextParam = type === "recovery" ? "/account/reset-password" : searchParams.get("next") ?? "/account";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/account";

  if (supabaseConfigured()) {
    const supabase = await createClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) {
        const welcome = type === "signup" || type === "email" ? `${next}${next.includes("?") ? "&" : "?"}confirmed=1` : next;
        return NextResponse.redirect(`${origin}${welcome}`);
      }
    }
  }
  // Google sends ?error=... when someone cancels or the provider is off.
  if (searchParams.get("error")) return NextResponse.redirect(`${origin}/account?error=google`);
  return NextResponse.redirect(`${origin}/account?error=link`);
}
