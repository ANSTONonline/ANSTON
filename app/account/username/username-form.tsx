"use client";

import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/server";
import { UsernameField } from "../auth-forms";
import { changeUsername, type ChangeUsernameState } from "./actions";

type Text = Dictionary["account"];

export default function ChangeUsernameForm({ text, locale }: { text: Text; locale: string }) {
  const [state, action, pending] = useActionState<ChangeUsernameState, FormData>(changeUsername, {});
  const [ok, setOk] = useState(false);
  const errorText =
    state.error === "usernameWait"
      ? text.usernameWait.replace("{date}", state.until ? new Date(state.until).toLocaleDateString(locale, { dateStyle: "long" }) : "")
      : state.error
        ? { usernameInvalid: text.errors.usernameInvalid, usernameTaken: text.errors.usernameTaken, usernameSame: text.usernameSame, generic: text.errors.generic }[state.error]
        : null;

  return (
    <form action={action} className="border rounded-xl p-6 space-y-4">
      <UsernameField text={text} defaultValue={state.value} onValidChange={setOk} label={text.usernameNew} />
      {errorText && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorText}
        </p>
      )}
      <button type="submit" disabled={pending || !ok} className="w-full bg-[#7A1E2B] text-white py-3 rounded-lg font-medium disabled:opacity-60">
        {pending ? text.working : text.save}
      </button>
    </form>
  );
}
