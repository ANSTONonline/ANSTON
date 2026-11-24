"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Dictionary } from "@/i18n/server";
import { deleteAccount, type DeleteAccountState } from "./actions";

type Text = Dictionary["deleteAccount"];

export default function DeleteAccountForm({ text }: { text: Text }) {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {});
  const [typed, setTyped] = useState("");
  const ready = typed.trim().toUpperCase() === "DELETE";

  return (
    <form action={action} className="border border-red-200 rounded-xl p-6 space-y-4">
      <label className="block text-sm font-medium">
        {text.confirmLabel}
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          placeholder="DELETE"
          className="mt-2 w-full border rounded-lg px-3 py-2 font-mono tracking-widest"
        />
      </label>

      {state.error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error === "confirm" && text.errorConfirm}
          {state.error === "generic" && text.errorGeneric}
          {state.error === "openOrders" && (
            <>
              {text.errorOpenOrders}{" "}
              <Link href="/account/orders" className="underline font-medium">{text.goToOrders}</Link>
            </>
          )}
          {state.error === "heldMoney" && (
            <>
              {text.errorHeldMoney}{" "}
              <Link href="/account/payouts" className="underline font-medium">{text.goToPayouts}</Link>
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !ready}
        className="w-full bg-red-700 text-white py-3 rounded-lg font-medium disabled:opacity-50"
      >
        {pending ? text.deleting : text.button}
      </button>
    </form>
  );
}
