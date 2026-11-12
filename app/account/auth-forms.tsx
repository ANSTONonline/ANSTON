"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "./actions";

type Text = {
  email: string;
  password: string;
  name: string;
  passwordHint: string;
  signIn: string;
  signUp: string;
  noAccount: string;
  haveAccount: string;
  checkEmail: string;
  working: string;
  errors: Record<NonNullable<AuthState["error"]>, string>;
};

// Sign in and Create account forms, with a switch between them.
export default function AuthForms({ text }: { text: Text }) {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [signInState, signInAction, signingIn] = useActionState(signIn, {});
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, {});
  // After "Check your email", the person can go back to the forms; this
  // remembers which result they dismissed so the forms show again.
  const [dismissed, setDismissed] = useState<AuthState | null>(null);
  const state = mode === "signIn" ? signInState : signUpState;
  const pending = mode === "signIn" ? signingIn : signingUp;

  if (mode === "signUp" && signUpState.checkEmail && dismissed !== signUpState) {
    return (
      <div className="border rounded-xl p-6 bg-green-50 border-green-200" role="status">
        <p className="font-medium mb-1" dir="ltr">✉️ {signUpState.email}</p>
        <p className="text-gray-700">{text.checkEmail}</p>
        <button
          type="button"
          onClick={() => {
            setDismissed(signUpState);
            setMode("signIn");
          }}
          className="mt-4 text-[#7A1E2B] font-medium hover:underline">
          {text.signIn}
        </button>
      </div>
    );
  }

  const input = "mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#7A1E2B]/40";

  return (
    <div className="border rounded-xl p-6">
      <div className="grid grid-cols-2 gap-2 mb-6 bg-gray-100 rounded-lg p-1" role="tablist">
        {(["signIn", "signUp"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`py-2 rounded-md text-sm font-medium ${mode === m ? "bg-white shadow text-[#7A1E2B]" : "text-gray-600"}`}
          >
            {text[m]}
          </button>
        ))}
      </div>

      <form key={mode} action={mode === "signIn" ? signInAction : signUpAction} className="space-y-4">
        {mode === "signUp" && (
          <label className="block">
            <span className="text-sm font-medium">{text.name}</span>
            <input type="text" name="name" autoComplete="name" maxLength={80} className={input} />
          </label>
        )}
        <label className="block">
          <span className="text-sm font-medium">{text.email}</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            defaultValue={state.email}
            dir="ltr"
            className={input}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{text.password}</span>
          <input
            type="password"
            name="password"
            required
            minLength={mode === "signUp" ? 8 : undefined}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            dir="ltr"
            className={input}
          />
          {mode === "signUp" && <span className="text-xs text-gray-500">{text.passwordHint}</span>}
        </label>

        {state.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
            {text.errors[state.error]}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-[#7A1E2B] text-white py-3 rounded-lg font-medium disabled:opacity-60"
        >
          {pending ? text.working : text[mode]}
        </button>
      </form>

      <p className="text-sm text-gray-600 mt-4 text-center">
        {mode === "signIn" ? text.noAccount : text.haveAccount}{" "}
        <button
          type="button"
          onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
          className="text-[#7A1E2B] font-medium hover:underline"
        >
          {mode === "signIn" ? text.signUp : text.signIn}
        </button>
      </p>
    </div>
  );
}
