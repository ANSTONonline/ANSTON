"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";
import {
  MIN_AGE,
  USERNAME_PATTERN,
  ageFrom,
  normalizePhone,
  normalizeUsername,
  passwordOk,
} from "@/lib/auth-rules";

export type AuthErrorCode =
  | "invalid"
  | "notConfirmed"
  | "exists"
  | "weakPassword"
  | "passwordRules"
  | "mismatch"
  | "usernameTaken"
  | "usernameInvalid"
  | "underage"
  | "birthDate"
  | "phoneInvalid"
  | "phoneUnavailable"
  | "codeInvalid"
  | "rateLimit"
  | "generic";

export type AuthState = {
  error?: AuthErrorCode;
  checkEmail?: boolean;
  verifyPhone?: string; // phone number waiting for its SMS code
  resetSent?: boolean;
  values?: Record<string, string>; // what the person typed, to refill the form
};

// Turns Supabase's error codes into the messages we show (translated on the page).
function toCode(error: { code?: string; message?: string; status?: number }): AuthErrorCode {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || message.includes("invalid login")) return "invalid";
  if (code === "email_not_confirmed" || code === "phone_not_confirmed" || message.includes("not confirmed")) return "notConfirmed";
  if (code === "user_already_exists" || code === "email_exists" || code === "phone_exists" || message.includes("already registered")) return "exists";
  if (code === "weak_password" || message.includes("password should")) return "passwordRules";
  if (code === "phone_provider_disabled" || code === "sms_send_failed" || message.includes("sms") || message.includes("phone provider")) return "phoneUnavailable";
  if (code === "otp_expired" || code === "invalid_otp" || message.includes("token has expired") || message.includes("otp")) return "codeInvalid";
  if (code.includes("rate_limit") || error.status === 429) return "rateLimit";
  return "generic";
}

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.myanston.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

// Used by the sign-up form while the person types a username.
export async function checkUsername(raw: string): Promise<"available" | "taken" | "invalid"> {
  const username = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(username)) return "invalid";
  if (!supabaseConfigured()) return "available";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("username_available", { p_username: username });
  if (error) return "available"; // let sign-up decide rather than block the form
  return data ? "available" : "taken";
}

export async function logIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const login = field(formData, "login");
  const password = String(formData.get("password") ?? "");
  const values = { login };
  if (!supabaseConfigured()) return { error: "generic", values };
  const supabase = await createClient();

  let result;
  if (login.includes("@")) {
    result = await supabase.auth.signInWithPassword({ email: login, password });
  } else {
    const phone = normalizePhone(login);
    if (!phone) return { error: "phoneInvalid", values };
    result = await supabase.auth.signInWithPassword({ phone, password });
  }
  if (result.error) return { error: toCode(result.error), values };
  redirect("/account");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const username = normalizeUsername(field(formData, "username"));
  const method = field(formData, "method") === "phone" ? "phone" : "email";
  const email = field(formData, "email");
  const phoneRaw = field(formData, "phone");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const birthDate = field(formData, "birthDate");
  const values = { username, method, email, phone: phoneRaw, birthDate };

  if (!supabaseConfigured()) return { error: "generic", values };
  if (!USERNAME_PATTERN.test(username)) return { error: "usernameInvalid", values };
  if ((await checkUsername(username)) === "taken") return { error: "usernameTaken", values };
  if (!passwordOk(password)) return { error: "passwordRules", values };
  if (password !== confirm) return { error: "mismatch", values };
  const age = ageFrom(birthDate);
  if (age === null || age > 120) return { error: "birthDate", values };
  if (age < MIN_AGE) return { error: "underage", values };

  const supabase = await createClient();
  const data = { username, age_confirmed: true };

  if (method === "phone") {
    const phone = normalizePhone(phoneRaw);
    if (!phone) return { error: "phoneInvalid", values };
    const { data: res, error } = await supabase.auth.signUp({ phone, password, options: { data } });
    if (error) return { error: toCode(error), values };
    if (res.session) redirect("/account");
    return { verifyPhone: phone, values };
  }

  const { data: res, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data, emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/account` },
  });
  if (error) return { error: toCode(error), values };
  // Supabase hides whether an email is already registered: such sign-ups come
  // back with no identities.
  if (res.user && res.user.identities?.length === 0) return { error: "exists", values };
  if (res.session) redirect("/account");
  return { checkEmail: true, values };
}

// Checks the 6-digit code texted to a new phone account.
export async function verifyPhoneCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const phone = field(formData, "phone");
  const token = field(formData, "code").replace(/\s/g, "");
  if (!supabaseConfigured()) return { error: "generic", verifyPhone: phone };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) return { error: toCode(error) === "generic" ? "codeInvalid" : toCode(error), verifyPhone: phone };
  redirect("/account?confirmed=1");
}

export async function sendPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email");
  if (!supabaseConfigured()) return { error: "generic", values: { email } };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/account/reset-password`,
  });
  if (error && toCode(error) === "rateLimit") return { error: "rateLimit", values: { email } };
  // Always say the same thing, so nobody can find out which emails have accounts.
  return { resetSent: true, values: { email } };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!passwordOk(password)) return { error: "passwordRules" };
  if (password !== confirm) return { error: "mismatch" };
  if (!supabaseConfigured()) return { error: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: toCode(error) };
  redirect("/account?passwordUpdated=1");
}

// Username and age for accounts that don't have them yet (for example after
// signing in with Google).
export async function completeProfile(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const username = normalizeUsername(field(formData, "username"));
  const birthDate = field(formData, "birthDate");
  const values = { username, birthDate };
  if (!supabaseConfigured()) return { error: "generic", values };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/account");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, age_confirmed_at")
    .eq("id", auth.user.id)
    .maybeSingle();

  const update: { username?: string; age_confirmed_at?: string } = {};
  if (!profile?.username) {
    if (!USERNAME_PATTERN.test(username)) return { error: "usernameInvalid", values };
    if ((await checkUsername(username)) === "taken") return { error: "usernameTaken", values };
    update.username = username;
  }
  if (!profile?.age_confirmed_at) {
    const age = ageFrom(birthDate);
    if (age === null || age > 120) return { error: "birthDate", values };
    if (age < MIN_AGE) return { error: "underage", values };
    update.age_confirmed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", auth.user.id);
  if (error) return { error: error.code === "23505" ? "usernameTaken" : "generic", values };
  redirect("/account");
}

export async function signInWithGoogle() {
  if (!supabaseConfigured()) redirect("/account?error=google");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/confirm?next=/account` },
  });
  if (error || !data.url) redirect("/account?error=google");
  redirect(data.url);
}

export async function signOut() {
  if (supabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/account");
}
