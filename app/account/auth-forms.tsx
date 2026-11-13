"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  checkUsername,
  completeProfile,
  logIn,
  sendPasswordReset,
  signInWithGoogle,
  signUp,
  updatePassword,
  verifyPhoneCode,
  type AuthState,
} from "./actions";
import { normalizeUsername, passwordChecks, USERNAME_PATTERN } from "@/lib/auth-rules";
import type { Dictionary } from "@/i18n/server";

type Text = Dictionary["account"];

const input =
  "mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7A1E2B]/40";
const primary = "w-full bg-[#7A1E2B] text-white py-3 rounded-lg font-medium disabled:opacity-60";

function ErrorMessage({ state, text }: { state: AuthState; text: Text }) {
  if (!state.error) return null;
  return (
    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
      {text.errors[state.error]}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Log in / Sign up
// ---------------------------------------------------------------------------

type LegalLinks = { terms: string; privacy: string };

// "By continuing, you agree to Anston's Terms of Service and Privacy Policy."
function Agreement({ text, legal }: { text: Text; legal: LegalLinks }) {
  const parts = text.agree.split(/(\{terms\}|\{privacy\})/);
  return (
    <p className="text-xs text-gray-500 text-center mt-3">
      {parts.map((part, i) =>
        part === "{terms}" ? (
          <Link key={i} href="/terms" className="underline">{legal.terms}</Link>
        ) : part === "{privacy}" ? (
          <Link key={i} href="/privacy" className="underline">{legal.privacy}</Link>
        ) : (
          part
        ),
      )}
    </p>
  );
}

// The required "I agree" box on sign-up and on the finish-setup form.
function TermsCheckbox({ text, legal }: { text: Text; legal: LegalLinks }) {
  const parts = text.agreeBox.split(/(\{terms\}|\{privacy\})/);
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="terms" required className="w-4 h-4 mt-0.5 accent-[#7A1E2B]" />
      <span>
        {parts.map((part, i) =>
          part === "{terms}" ? (
            <Link key={i} href="/terms" target="_blank" className="underline text-[#7A1E2B]">{legal.terms}</Link>
          ) : part === "{privacy}" ? (
            <Link key={i} href="/privacy" target="_blank" className="underline text-[#7A1E2B]">{legal.privacy}</Link>
          ) : (
            part
          ),
        )}
      </span>
    </label>
  );
}

export default function AuthForms({ text, legal }: { text: Text; legal: LegalLinks }) {
  const [tab, setTab] = useState<"logIn" | "signUp">("logIn");
  const [logInState, logInAction, loggingIn] = useActionState(logIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, {});
  const [dismissed, setDismissed] = useState<AuthState | null>(null);

  // After signing up: "check your email" or "enter the code we texted".
  if (tab === "signUp" && dismissed !== signUpState) {
    if (signUpState.checkEmail) {
      return (
        <div className="border rounded-xl p-6 bg-green-50 border-green-200" role="status">
          <p className="font-medium mb-1" dir="ltr">✉️ {signUpState.values?.email}</p>
          <p className="text-gray-700">{text.checkEmail}</p>
          <button
            type="button"
            onClick={() => {
              setDismissed(signUpState);
              setTab("logIn");
            }}
            className="mt-4 text-[#7A1E2B] font-medium hover:underline"
          >
            {text.backToLogin}
          </button>
        </div>
      );
    }
    if (signUpState.verifyPhone) {
      return <PhoneCodeForm phone={signUpState.verifyPhone} text={text} />;
    }
  }

  return (
    <div className="border rounded-xl p-6">
      <div className="grid grid-cols-2 gap-2 mb-6 bg-gray-100 rounded-lg p-1" role="tablist">
        {(["logIn", "signUp"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={tab === m}
            onClick={() => setTab(m)}
            className={`py-2 rounded-md text-sm font-medium ${tab === m ? "bg-white shadow text-[#7A1E2B]" : "text-gray-600"}`}
          >
            {text[m]}
          </button>
        ))}
      </div>

      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-3 border rounded-lg py-3 font-medium hover:bg-gray-50"
        >
          <GoogleIcon />
          {text.google}
        </button>
      </form>
      <Agreement text={text} legal={legal} />

      <div className="flex items-center gap-3 my-5 text-sm text-gray-500">
        <span className="flex-1 border-t" />
        {text.or}
        <span className="flex-1 border-t" />
      </div>

      {tab === "logIn" ? (
        <form action={logInAction} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">{text.emailOrPhone}</span>
            <input
              type="text"
              name="login"
              required
              autoComplete="username"
              defaultValue={logInState.values?.login}
              dir="ltr"
              className={input}
            />
          </label>
          <label className="block">
            <span className="flex justify-between text-sm font-medium">
              {text.password}
              <Link href="/account/forgot-password" className="text-[#7A1E2B] font-normal hover:underline">
                {text.forgot}
              </Link>
            </span>
            <input type="password" name="password" required autoComplete="current-password" dir="ltr" className={input} />
          </label>
          <ErrorMessage state={logInState} text={text} />
          <button type="submit" disabled={loggingIn} className={primary}>
            {loggingIn ? text.working : text.logIn}
          </button>
        </form>
      ) : (
        <SignUpForm text={text} legal={legal} state={signUpState} action={signUpAction} pending={signingUp} />
      )}

      <p className="text-sm text-gray-600 mt-4 text-center">
        {tab === "logIn" ? text.noAccount : text.haveAccount}{" "}
        <button
          type="button"
          onClick={() => setTab(tab === "logIn" ? "signUp" : "logIn")}
          className="text-[#7A1E2B] font-medium hover:underline"
        >
          {tab === "logIn" ? text.signUp : text.logIn}
        </button>
      </p>
    </div>
  );
}

function SignUpForm({
  text,
  legal,
  state,
  action,
  pending,
}: {
  text: Text;
  legal: LegalLinks;
  state: AuthState;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [method, setMethod] = useState<"email" | "phone">(state.values?.method === "phone" ? "phone" : "email");
  const [usernameOk, setUsernameOk] = useState(false);
  const [passwordValid, setPasswordValid] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <UsernameField text={text} defaultValue={state.values?.username} onValidChange={setUsernameOk} />

      <fieldset>
        <legend className="text-sm font-medium mb-1">{text.signUpWith}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["email", "phone"] as const).map((m) => (
            <label
              key={m}
              className={`border rounded-lg py-2 text-center text-sm cursor-pointer ${
                method === m ? "border-[#7A1E2B] text-[#7A1E2B] font-medium bg-[#7A1E2B]/5" : "text-gray-600"
              }`}
            >
              <input
                type="radio"
                name="method"
                value={m}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="sr-only"
              />
              {m === "email" ? text.email : text.phone}
            </label>
          ))}
        </div>
      </fieldset>

      {method === "email" ? (
        <label className="block">
          <span className="text-sm font-medium">{text.email}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            defaultValue={state.values?.email}
            dir="ltr"
            className={input}
          />
          <span className="text-xs text-gray-500">{text.emailHint}</span>
        </label>
      ) : (
        <label className="block">
          <span className="text-sm font-medium">{text.phone}</span>
          <input
            type="tel"
            name="phone"
            required
            autoComplete="tel"
            placeholder="+1 713 555 0123"
            defaultValue={state.values?.phone}
            dir="ltr"
            className={input}
          />
          <span className="text-xs text-gray-500">{text.phoneHint}</span>
        </label>
      )}

      <PasswordFields text={text} onValidChange={setPasswordValid} />

      <label className="block">
        <span className="text-sm font-medium">{text.birthDate}</span>
        <input
          type="date"
          name="birthDate"
          required
          max={new Date().toISOString().slice(0, 10)}
          min="1900-01-01"
          defaultValue={state.values?.birthDate}
          dir="ltr"
          className={input}
        />
        <span className="text-xs text-gray-500">{text.ageNote}</span>
      </label>

      <TermsCheckbox text={text} legal={legal} />
      <ErrorMessage state={state} text={text} />
      <button type="submit" disabled={pending || !usernameOk || !passwordValid} className={primary}>
        {pending ? text.working : text.createAccount}
      </button>
    </form>
  );
}

// Username box that checks, as you type, whether the name is free.
export function UsernameField({
  text,
  defaultValue = "",
  onValidChange,
  label,
}: {
  text: Text;
  defaultValue?: string;
  onValidChange: (ok: boolean) => void;
  label?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  // The last answer from the server, for the name it was about.
  const [checked, setChecked] = useState<{ name: string; result: "available" | "taken" | "invalid" } | null>(null);

  const name = normalizeUsername(value);
  const formatOk = USERNAME_PATTERN.test(name);
  const status: "idle" | "checking" | "available" | "taken" | "invalid" = !name
    ? "idle"
    : !formatOk
      ? "invalid"
      : checked?.name === name
        ? checked.result
        : "checking";

  // Ask the server whether the name is free, a moment after typing stops.
  useEffect(() => {
    if (!formatOk) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkUsername(name);
      if (!cancelled) setChecked({ name, result });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, formatOk]);

  useEffect(() => {
    onValidChange(status === "available");
  }, [status, onValidChange]);

  const message = {
    idle: { text: text.usernameHint, color: "text-gray-500" },
    checking: { text: text.usernameChecking, color: "text-gray-500" },
    available: { text: `✓ ${text.usernameAvailable}`, color: "text-green-700" },
    taken: { text: `✗ ${text.errors.usernameTaken}`, color: "text-red-700" },
    invalid: { text: text.errors.usernameInvalid, color: "text-red-700" },
  }[status];

  return (
    <label className="block">
      <span className="text-sm font-medium">{label ?? text.username}</span>
      <div className="relative" dir="ltr">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 mt-0.5 text-gray-400">@</span>
        <input
          type="text"
          name="username"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={30}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\s/g, ""))}
          aria-describedby="username-status"
          className={`${input} pl-7`}
        />
      </div>
      <span id="username-status" className={`text-xs ${message.color}`} aria-live="polite">
        {message.text}
      </span>
    </label>
  );
}

// New password + confirm, with the rules ticked off as you type.
function PasswordFields({
  text,
  onValidChange,
  newLabel,
}: {
  text: Text;
  onValidChange: (ok: boolean) => void;
  newLabel?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const checks = passwordChecks(password);
  const matches = confirm.length > 0 && confirm === password;

  useEffect(() => {
    onValidChange(checks.length && checks.upper && checks.lower && matches);
  }, [checks.length, checks.upper, checks.lower, matches, onValidChange]);

  const rule = (ok: boolean, label: string) => (
    <li className={ok ? "text-green-700" : "text-gray-500"}>
      {ok ? "✓" : "○"} {label}
    </li>
  );

  return (
    <>
      <label className="block">
        <span className="text-sm font-medium">{newLabel ?? text.password}</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
          className={input}
        />
        <ul className="text-xs mt-1 space-y-0.5" aria-live="polite">
          {rule(checks.length, text.ruleLength)}
          {rule(checks.upper, text.ruleUpper)}
          {rule(checks.lower, text.ruleLower)}
        </ul>
      </label>
      <label className="block">
        <span className="text-sm font-medium">{text.confirmPassword}</span>
        <input
          type="password"
          name="confirm"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          dir="ltr"
          className={input}
        />
        {confirm.length > 0 && !matches && <span className="text-xs text-red-700">{text.errors.mismatch}</span>}
      </label>
    </>
  );
}

// The 6-digit code texted to a new phone account.
function PhoneCodeForm({ phone, text }: { phone: string; text: Text }) {
  const [state, action, pending] = useActionState(verifyPhoneCode, { verifyPhone: phone });
  return (
    <form action={action} className="border rounded-xl p-6 space-y-4">
      <h2 className="text-xl font-semibold">{text.codeTitle}</h2>
      <p className="text-gray-700">
        {text.codeSent.split("{phone}")[0]}
        <span dir="ltr" className="font-medium">{phone}</span>
        {text.codeSent.split("{phone}")[1]}
      </p>
      <input type="hidden" name="phone" value={phone} />
      <label className="block">
        <span className="text-sm font-medium">{text.code}</span>
        <input
          type="text"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,8}"
          maxLength={8}
          dir="ltr"
          className={`${input} tracking-[0.4em] text-center text-lg`}
        />
      </label>
      <ErrorMessage state={state} text={text} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? text.working : text.verify}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Forgot password, new password, finish setting up
// ---------------------------------------------------------------------------

export function ForgotPasswordForm({ text }: { text: Text }) {
  const [state, action, pending] = useActionState(sendPasswordReset, {});
  if (state.resetSent) {
    return (
      <div className="border rounded-xl p-6 bg-green-50 border-green-200" role="status">
        <p className="text-gray-700">{text.resetSent}</p>
        <Link href="/account" className="inline-block mt-4 text-[#7A1E2B] font-medium hover:underline">
          {text.backToLogin}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="border rounded-xl p-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">{text.email}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          defaultValue={state.values?.email}
          dir="ltr"
          className={input}
        />
      </label>
      <ErrorMessage state={state} text={text} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? text.working : text.sendLink}
      </button>
      <p className="text-sm text-center">
        <Link href="/account" className="text-[#7A1E2B] hover:underline">
          {text.backToLogin}
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ text }: { text: Text }) {
  const [state, action, pending] = useActionState(updatePassword, {});
  const [valid, setValid] = useState(false);
  return (
    <form action={action} className="border rounded-xl p-6 space-y-4">
      <PasswordFields text={text} onValidChange={setValid} newLabel={text.newPassword} />
      <ErrorMessage state={state} text={text} />
      <button type="submit" disabled={pending || !valid} className={primary}>
        {pending ? text.working : text.savePassword}
      </button>
    </form>
  );
}

export function FinishProfileForm({
  text,
  needsUsername,
  needsAge,
  needsTerms,
  legal,
}: {
  text: Text;
  needsUsername: boolean;
  needsAge: boolean;
  needsTerms: boolean;
  legal: LegalLinks;
}) {
  const [state, action, pending] = useActionState(completeProfile, {});
  const [usernameOk, setUsernameOk] = useState(!needsUsername);
  return (
    <form action={action} className="border rounded-xl p-6 space-y-4">
      {needsUsername && <UsernameField text={text} defaultValue={state.values?.username} onValidChange={setUsernameOk} />}
      {needsAge && (
        <label className="block">
          <span className="text-sm font-medium">{text.birthDate}</span>
          <input
            type="date"
            name="birthDate"
            required
            max={new Date().toISOString().slice(0, 10)}
            min="1900-01-01"
            defaultValue={state.values?.birthDate}
            dir="ltr"
            className={input}
          />
          <span className="text-xs text-gray-500">{text.ageNote}</span>
        </label>
      )}
      {needsTerms && <TermsCheckbox text={text} legal={legal} />}
      <ErrorMessage state={state} text={text} />
      <button type="submit" disabled={pending || !usernameOk} className={primary}>
        {pending ? text.working : text.continue}
      </button>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
