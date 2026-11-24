"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { AVATAR_BUCKET, avatarUrl } from "@/lib/avatar";
import { BUSINESS_TYPES, DOC_BUCKET, DOC_KINDS, type Business } from "@/lib/business";
import { AvailabilityFields, shrink } from "@/app/sell/listing-form";
import { addBusinessDocument, removeBusinessDocument, saveBusiness, type BusinessFormState } from "./actions";
import type { Dictionary } from "@/i18n/server";
import { WEEKDAYS, timeFromMinutes } from "@/lib/availability";

type T = Dictionary["business"];
const input = "w-full border rounded-lg px-3 py-2 bg-white";
const label = "block text-sm font-medium mb-1";
const section = "border rounded-xl p-5 space-y-4";

export function BusinessForm({
  business, userId, text, sellText, locale, countryCodes,
}: {
  business: Business | null; userId: string; text: T; sellText: Dictionary["sell"]; locale: string; countryCodes: string[];
}) {
  const [state, action, pending] = useActionState<BusinessFormState, FormData>(saveBusiness, {});
  const [logo, setLogo] = useState(business?.logo_path ?? "");
  const [logoPreview, setLogoPreview] = useState(business?.logo_path ? avatarUrl(business.logo_path) : "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const names = useMemo(() => new Intl.DisplayNames([locale], { type: "region" }), [locale]);
  const countries = useMemo(
    () => countryCodes.map((c) => ({ c, n: names.of(c) ?? c })).sort((a, b) => a.n.localeCompare(b.n, locale)),
    [countryCodes, names, locale],
  );

  // Existing hours as form values (all days present, so days off stay off).
  const hourValues: Record<string, string> = {};
  if (business) {
    for (const d of WEEKDAYS) {
      const w = business.hours?.[String(d)]?.[0];
      hourValues[`avail_${d}_on`] = w ? "on" : "";
      if (w) {
        hourValues[`avail_${d}_from`] = timeFromMinutes(w[0]);
        hourValues[`avail_${d}_to`] = timeFromMinutes(w[1]);
      }
    }
    if (business.time_zone) hourValues.time_zone = business.time_zone;
  }

  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const blob = await shrink(file, 600);
    const type = blob.type === "image/png" || blob.type === "image/webp" ? blob.type : "image/jpeg";
    const path = `${userId}/${crypto.randomUUID()}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`;
    const { error } = await createBrowserSupabase().storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: type, upsert: false });
    setUploading(false);
    if (!error) {
      setLogo(path);
      setLogoPreview(URL.createObjectURL(blob));
    }
  }

  return (
    <form action={action} className="space-y-6">
      <div className={section}>
        <h2 className="font-semibold">{text.basics}</h2>
        <div className="flex items-center gap-4">
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="" className="w-20 h-20 shrink-0 rounded-xl object-cover border" />
          ) : (
            <span className="w-20 h-20 shrink-0 rounded-xl border-2 border-dashed flex items-center justify-center text-3xl" aria-hidden="true">🏢</span>
          )}
          <div className="space-y-1">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="border border-[#7A1E2B] text-[#7A1E2B] rounded-lg px-3 py-1.5 text-sm">
              {uploading ? text.uploading : logoPreview ? text.changeLogo : text.addLogo}
            </button>
            <p className="text-xs text-gray-500">{text.logoHelp}</p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => chooseLogo(e.target.files?.[0])} />
          </div>
        </div>
        <input type="hidden" name="logo" value={logo} />
        <div>
          <label className={label} htmlFor="b-name">{text.name}</label>
          <input id="b-name" name="name" required maxLength={80} defaultValue={business?.name ?? ""} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="b-type">{text.type}</label>
          <select id="b-type" name="business_type" required defaultValue={business?.business_type ?? ""} className={input}>
            <option value="" disabled>{text.chooseType}</option>
            {BUSINESS_TYPES.map((k) => <option key={k} value={k}>{text.types[k]}</option>)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="b-about">{text.about}</label>
          <textarea id="b-about" name="about" rows={4} maxLength={3000} defaultValue={business?.about ?? ""} className={input} placeholder={text.aboutPlaceholder} />
        </div>
      </div>

      <div className={section}>
        <h2 className="font-semibold">{text.contact}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label} htmlFor="b-phone">{text.phone}</label><input id="b-phone" name="phone" type="tel" maxLength={40} defaultValue={business?.phone ?? ""} className={input} dir="ltr" /></div>
          <div><label className={label} htmlFor="b-email">{text.email}</label><input id="b-email" name="email" type="email" maxLength={200} defaultValue={business?.email ?? ""} className={input} dir="ltr" /></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="b-web">{text.website}</label><input id="b-web" name="website" maxLength={300} defaultValue={business?.website ?? ""} placeholder="https://" className={input} dir="ltr" /></div>
          <div className="sm:col-span-2"><label className={label} htmlFor="b-addr">{text.address}</label><input id="b-addr" name="address" maxLength={200} defaultValue={business?.address ?? ""} className={input} /></div>
          <div><label className={label} htmlFor="b-city">{text.city}</label><input id="b-city" name="city" maxLength={100} defaultValue={business?.city ?? ""} className={input} /></div>
          <div><label className={label} htmlFor="b-region">{text.region}</label><input id="b-region" name="region" maxLength={100} defaultValue={business?.region ?? ""} className={input} /></div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="b-country">{text.country}</label>
            <select id="b-country" name="country_code" defaultValue={business?.country_code ?? "US"} className={input}>
              {countries.map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className={section}>
        <h2 className="font-semibold">{text.hours}</h2>
        <p className="text-xs text-gray-500">{text.hoursHelp}</p>
        <AvailabilityFields text={sellText} locale={locale} values={hourValues} />
      </div>

      <div className={section}>
        <h2 className="font-semibold">🛡️ {text.legal}</h2>
        <p className="text-sm text-gray-600">{text.legalHelp}</p>
        <div><label className={label} htmlFor="b-legal">{text.legalName}</label><input id="b-legal" name="legal_name" required maxLength={160} defaultValue={business?.legal_name ?? ""} placeholder={text.legalNamePlaceholder} className={input} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label} htmlFor="b-rreg">{text.registrationRegion}</label><input id="b-rreg" name="registration_region" maxLength={100} defaultValue={business?.registration_region ?? ""} placeholder={text.registrationRegionPlaceholder} className={input} /></div>
          <div><label className={label} htmlFor="b-rnum">{text.registrationNumber}</label><input id="b-rnum" name="registration_number" maxLength={60} defaultValue={business?.registration_number ?? ""} className={input} dir="ltr" /></div>
        </div>
        {business?.status === "verified" && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">{text.reReviewNote}</p>}
      </div>

      {state.error && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{text.errors[state.error as keyof T["errors"]] ?? text.errors.generic}</p>}
      {state.saved && <p role="status" className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{text.saved}</p>}
      <button type="submit" disabled={pending || uploading} className="w-full bg-[#7A1E2B] text-white rounded-lg py-3 font-semibold">
        {business ? text.saveChanges : text.create}
      </button>
    </form>
  );
}

// Proof documents: uploaded straight to the owner's private folder.
export function BusinessDocuments({
  userId, docs, text,
}: {
  userId: string; docs: { id: string; kind: string; file_name: string }[]; text: T;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<string>("registration");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setFailed(false);
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z]/g, "");
    const path = `${userId}/${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
    const { error } = await createBrowserSupabase().storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
    if (error) {
      setFailed(true);
      setBusy(false);
      return;
    }
    const res = await addBusinessDocument(kind, path, file.name);
    setBusy(false);
    if (res.error) setFailed(true);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div className={section}>
      <h2 className="font-semibold">📄 {text.documents}</h2>
      <p className="text-sm text-gray-600">{text.documentsHelp}</p>
      <ul className="text-sm text-gray-700 list-disc ps-5 space-y-1">
        <li>{text.docExamples.registration}</li>
        <li>{text.docExamples.ein_letter}</li>
        <li>{text.docExamples.license}</li>
      </ul>
      {docs.length > 0 && (
        <ul className="divide-y border rounded-lg">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <span className="min-w-0 truncate">📎 {d.file_name || "document"} <span className="text-gray-500">· {text.docKinds[d.kind as keyof T["docKinds"]]}</span></span>
              <form action={removeBusinessDocument}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="text-[#7A1E2B] hover:underline">{text.remove}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          {text.docKind}
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="block mt-1 border rounded-lg px-3 py-2 bg-white">
            {DOC_KINDS.map((k) => <option key={k} value={k}>{text.docKinds[k]}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="border border-[#7A1E2B] text-[#7A1E2B] rounded-lg px-4 py-2 text-sm">
          {busy ? text.uploading : `+ ${text.uploadDoc}`}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {failed && <p role="alert" className="text-sm text-red-700">{text.uploadFailed}</p>}
      <p className="text-xs text-gray-500">🔒 {text.privateNote}</p>
    </div>
  );
}
