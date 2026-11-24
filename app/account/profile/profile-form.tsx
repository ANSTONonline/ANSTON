"use client";

import { useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { AVATAR_BUCKET, avatarUrl } from "@/lib/avatar";
import { shrink } from "@/app/sell/listing-form";
import { saveProfile } from "./actions";
import type { Dictionary } from "@/i18n/server";

// Profile photo (uploaded straight to storage, into the member's folder) and gender.
export function ProfileForm({
  userId, username, avatar, gender, text,
}: {
  userId: string; username: string; avatar: string | null; gender: string | null; text: Dictionary["profile"];
}) {
  const [path, setPath] = useState(avatar ?? "");
  const [preview, setPreview] = useState(avatar ? avatarUrl(avatar) : "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setFailed(false);
    const blob = await shrink(file, 600);
    const type = blob.type === "image/png" || blob.type === "image/webp" ? blob.type : "image/jpeg";
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const next = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createBrowserSupabase().storage.from(AVATAR_BUCKET).upload(next, blob, { contentType: type, upsert: false });
    setBusy(false);
    if (error) {
      setFailed(true);
      return;
    }
    setPath(next);
    setPreview(URL.createObjectURL(blob));
  }

  return (
    <form action={saveProfile} className="border rounded-xl p-6 space-y-6">
      <section className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="w-24 h-24 shrink-0 rounded-full object-cover bg-gray-100" />
        ) : (
          <span className="w-24 h-24 shrink-0 rounded-full bg-[#7A1E2B] text-white flex items-center justify-center text-4xl font-bold" aria-hidden="true">
            {username.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="space-y-2">
          <p className="font-medium">{text.photo}</p>
          <p className="text-xs text-gray-500">{text.photoHelp}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className="border border-[#7A1E2B] text-[#7A1E2B] rounded-lg px-3 py-1.5 text-sm">
              {busy ? text.uploading : preview ? text.changePhoto : text.addPhoto}
            </button>
            {preview && (
              <button type="button" onClick={() => { setPath(""); setPreview(""); }} className="text-sm text-gray-600 hover:underline">
                {text.removePhoto}
              </button>
            )}
          </div>
          {failed && <p role="alert" className="text-sm text-red-700">{text.uploadFailed}</p>}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
        </div>
      </section>
      <input type="hidden" name="avatar" value={path} />

      <fieldset className="space-y-2">
        <legend className="font-medium">{text.gender}</legend>
        <p className="text-xs text-gray-500">{text.genderHelp}</p>
        {([["female", text.female], ["male", text.male], ["", text.preferNot]] as const).map(([value, label]) => (
          <label key={label} className="flex items-center gap-2 text-sm">
            <input type="radio" name="gender" value={value} defaultChecked={(gender ?? "") === value} />
            {label}
          </label>
        ))}
      </fieldset>

      <button type="submit" disabled={busy} className="w-full bg-[#7A1E2B] text-white rounded-lg py-2 font-medium">{text.save}</button>
    </form>
  );
}
