"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState, useSyncExternalStore } from "react";
import type { Dictionary } from "@/i18n/server";
import type { Category, DbMode } from "@/lib/catalog";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  AUCTION_DAYS,
  CONDITIONS,
  COUNTRIES,
  CURRENCIES,
  RATE_UNITS,
  SESSION_MINUTES,
} from "@/lib/sell-options";
import { createListing, discardPhoto, updateListing, type SellState } from "./actions";

type Text = Dictionary["sell"];

const MAX_PHOTOS = 8;
const BUCKET = "listing-images";

const input = "w-full border rounded-lg px-3 py-2 bg-white";
const label = "block text-sm font-medium mb-1";
const section = "border rounded-xl p-5 space-y-4";

// Makes big phone photos smaller before uploading (longest side 1600px).
// If the browser can't read the image (some HEIC photos), the original is used.
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

type Photo = { path: string; url: string };

// Filled in when editing an existing listing.
export type EditingListing = {
  listingId: string;
  values: Record<string, string>; // form field values, as if typed
  photos: Photo[];
  auctionLocked: boolean; // the auction has bids, so it can't change
  auctionEndsAt: string | null;
};

const noSubscribe = () => () => {};

// Country names in the visitor's language, from the browser.
function regionNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    return null;
  }
}

function Photos({ text, userId, initial = [] }: { text: Text; userId: string; initial?: Photo[] }) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(false);
    const supabase = createBrowserSupabase();
    const room = MAX_PHOTOS - photos.length;
    const added: Photo[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const blob = await shrink(file);
      const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type || file.type, upsert: false });
      if (uploadError) {
        setError(true);
        continue;
      }
      added.push({ path, url: URL.createObjectURL(blob) });
    }
    setPhotos((current) => [...current, ...added]);
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  function remove(path: string) {
    setPhotos((current) => current.filter((p) => p.path !== path));
    // Photos already on the listing are only deleted when the changes are
    // saved, so nothing is lost if the person leaves without saving.
    if (!initial.some((p) => p.path === path)) void discardPhoto(path);
  }

  return (
    <div>
      <p className={label}>{text.photos}</p>
      <p className="text-xs text-gray-500 mb-3">{text.photosHint}</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {photos.map((p, i) => (
          <div key={p.path} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <input type="hidden" name="photo" value={p.path} />
            {i === 0 && (
              <span className="absolute bottom-1 start-1 bg-[#7A1E2B] text-white text-[10px] px-1.5 py-0.5 rounded">
                {text.cover}
              </span>
            )}
            <button
              type="button"
              onClick={() => remove(p.path)}
              className="absolute top-1 end-1 bg-white/90 rounded-full w-6 h-6 text-sm leading-none"
              aria-label={text.removePhoto}
              title={text.removePhoto}
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <label className="aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-sm text-gray-500 cursor-pointer hover:border-[#7A1E2B]">
            <span className="text-2xl" aria-hidden="true">📷</span>
            <span>{busy ? text.uploading : text.addPhotos}</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => add(e.target.files)}
            />
          </label>
        )}
      </div>
      {error && <p className="text-sm text-red-700 mt-2">{text.photoError}</p>}
    </div>
  );
}

export default function ListingForm({
  text,
  categories,
  userId,
  locale,
  editing,
}: {
  text: Text;
  categories: Category[];
  userId: string;
  locale: string;
  editing?: EditingListing;
}) {
  const submit = editing ? updateListing.bind(null, editing.listingId) : createListing;
  const [state, action, pending] = useActionState<SellState, FormData>(submit, {});
  const v = state.values ?? editing?.values ?? {};
  const auctionLocked = Boolean(editing?.auctionLocked);
  const [categoryId, setCategoryId] = useState(v.category ?? "");
  const category = categories.find((c) => String(c.id) === categoryId);
  const allowed = category?.allowedModes ?? [];
  const isFood = category?.slug === "food";
  const isService = allowed.length === 1 && allowed[0] === "booking";

  // Which ways to offer are ticked. Defaults to the first one the category allows.
  const [picked, setPicked] = useState<Partial<Record<DbMode, boolean>>>(() => {
    const initial: Partial<Record<DbMode, boolean>> = {};
    for (const m of ["sale", "auction", "rental", "booking"] as DbMode[]) if (v[`mode_${m}`] === "on") initial[m] = true;
    return initial;
  });
  const isPicked = (m: DbMode) => allowed.includes(m) && Boolean(picked[m]);

  // Country names come from the browser. The server's list can be worded a
  // little differently, so the first render uses codes and names follow.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const names = inBrowser ? regionNames(locale) : null;
  const countryName = (code: string) => names?.of(code) ?? code;
  const countries = [...COUNTRIES].sort((a, b) => countryName(a).localeCompare(countryName(b), locale));

  const mainCategories = categories.filter((c) => c.parentId === null && c.slug !== "services");
  const services = categories.filter((c) => c.parentId !== null);
  const errorText = state.error ? text.errors[state.error] : null;

  const modeBox = (m: DbMode, title: string, children: React.ReactNode) =>
    allowed.includes(m) && (
      <div className="border rounded-lg p-4">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            name={`mode_${m}`}
            checked={isPicked(m)}
            disabled={m === "auction" && auctionLocked}
            onChange={(e) => setPicked((p) => ({ ...p, [m]: e.target.checked }))}
            className="w-4 h-4 accent-[#7A1E2B]"
          />
          {title}
        </label>
        {m === "auction" && auctionLocked && <p className="text-xs text-gray-500 mt-2">{text.auctionLocked}</p>}
        {isPicked(m) && (
          <fieldset disabled={m === "auction" && auctionLocked} className="grid sm:grid-cols-2 gap-3 mt-3 disabled:opacity-60">
            {children}
          </fieldset>
        )}
      </div>
    );

  const money = (name: string, labelText: string, required = true) => (
    <div>
      <label className={label} htmlFor={name}>{labelText}</label>
      <input
        id={name}
        name={name}
        type="number"
        min="0.01"
        step="0.01"
        inputMode="decimal"
        required={required}
        defaultValue={v[name]}
        className={input}
        dir="ltr"
      />
    </div>
  );

  return (
    <form
      className="space-y-6 text-start"
      // Submitted by hand (not with the form's action prop) so the browser
      // keeps everything typed if the server sends back an error.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      {errorText && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          {errorText}
        </p>
      )}

      <div className={section}>
        <div>
          <label className={label} htmlFor="category">{text.category}</label>
          <select
            id="category"
            name="category"
            required
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              const first = categories.find((c) => String(c.id) === e.target.value)?.allowedModes[0];
              setPicked(first ? { [first]: true } : {});
            }}
            className={input}
          >
            <option value="">{text.chooseCategory}</option>
            {mainCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
            {services.length > 0 && (
              <optgroup label={text.servicesGroup}>
                {services.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="title">{text.titleLabel}</label>
          <input id="title" name="title" required minLength={3} maxLength={140} defaultValue={v.title} className={input} />
          <p className="text-xs text-gray-500 mt-1">{text.titleHint}</p>
        </div>
        <div>
          <label className={label} htmlFor="description">{text.description}</label>
          <textarea
            id="description"
            name="description"
            rows={5}
            maxLength={10000}
            defaultValue={v.description}
            className={input}
          />
          <p className="text-xs text-gray-500 mt-1">{text.descriptionHint}</p>
        </div>
        {category && !isService && !isFood && (
          <div>
            <label className={label} htmlFor="condition">{text.condition}</label>
            <select id="condition" name="condition" defaultValue={v.condition ?? "good"} className={input}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{text.conditions[c]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={section}>
        <Photos text={text} userId={userId} initial={editing?.photos} />
      </div>

      <div className={section}>
        <div>
          <h2 className="font-semibold">{text.waysTitle}</h2>
          <p className="text-xs text-gray-500">{category ? text.waysHint : text.pickCategoryFirst}</p>
        </div>
        {category && (
          <>
            <div>
              <label className={label} htmlFor="currency">{text.currency}</label>
              <select id="currency" name="currency" defaultValue={v.currency ?? "USD"} className={`${input} sm:w-40`} dir="ltr">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {modeBox(
              "sale",
              text.sale,
              <>
                {money("sale_price", text.price)}
                <div>
                  <label className={label} htmlFor="quantity">{text.quantity}</label>
                  <input id="quantity" name="quantity" type="number" min="1" max="10000" defaultValue={v.quantity ?? "1"} className={input} dir="ltr" />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="sale_offers" defaultChecked={v.sale_offers === "on"} className="w-4 h-4 accent-[#7A1E2B]" />
                  {text.acceptOffers}
                </label>
              </>,
            )}
            {modeBox(
              "auction",
              text.auction,
              <>
                {money("auction_start", text.startPrice)}
                {money("auction_buy_now", text.buyNow, false)}
                <div>
                  <label className={label} htmlFor="auction_days">{text.duration}</label>
                  <select id="auction_days" name="auction_days" defaultValue={v.auction_days ?? "7"} className={input}>
                    {editing?.auctionEndsAt && (
                      <option value="keep">
                        {text.keepEnd.replace("{date}", new Date(editing.auctionEndsAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }))}
                      </option>
                    )}
                    {AUCTION_DAYS.map((d) => (
                      <option key={d} value={d}>{d === 1 ? text.day1 : text.days.replace("{n}", String(d))}</option>
                    ))}
                  </select>
                </div>
              </>,
            )}
            {modeBox(
              "rental",
              text.rental,
              <>
                {money("rental_rate", text.rate)}
                <div>
                  <label className={label} htmlFor="rental_unit">{text.per}</label>
                  <select id="rental_unit" name="rental_unit" defaultValue={v.rental_unit ?? "day"} className={input}>
                    {RATE_UNITS.map((u) => (
                      <option key={u} value={u}>{text.units[u]}</option>
                    ))}
                  </select>
                </div>
                {money("rental_deposit", text.deposit, false)}
              </>,
            )}
            {modeBox(
              "booking",
              text.booking,
              <>
                {money("booking_price", text.sessionPrice)}
                <div>
                  <label className={label} htmlFor="booking_minutes">{text.sessionLength}</label>
                  <select id="booking_minutes" name="booking_minutes" defaultValue={v.booking_minutes ?? "60"} className={input}>
                    {SESSION_MINUTES.map((m) => (
                      <option key={m} value={m}>{text.minutes.replace("{n}", String(m))}</option>
                    ))}
                  </select>
                </div>
              </>,
            )}
          </>
        )}
      </div>

      {isFood && (
        <div className={section}>
          <h2 className="font-semibold">{text.foodTitle}</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="homemade" defaultChecked={v.homemade === "on"} className="w-4 h-4 accent-[#7A1E2B]" />
            {text.homemade}
          </label>
          <div>
            <label className={label} htmlFor="allergens">{text.allergens}</label>
            <input id="allergens" name="allergens" maxLength={300} defaultValue={v.allergens} className={input} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="food_rules" required defaultChecked={v.food_rules === "on"} className="w-4 h-4 mt-0.5 accent-[#7A1E2B]" />
            {text.foodRules}
          </label>
        </div>
      )}

      <div className={section}>
        <h2 className="font-semibold">{text.location}</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="city">{text.city}</label>
            <input id="city" name="city" maxLength={100} defaultValue={v.city} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="region">{text.region}</label>
            <input id="region" name="region" maxLength={100} defaultValue={v.region} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="country">{text.country}</label>
            <select id="country" name="country" defaultValue={v.country ?? "US"} className={input}>
              {countries.map((c) => (
                <option key={c} value={c}>{countryName(c)}</option>
              ))}
            </select>
          </div>
        </div>
        {category && !isService && (
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="local_pickup" defaultChecked={v.local_pickup ? v.local_pickup === "on" : true} className="w-4 h-4 accent-[#7A1E2B]" />
              {text.localPickup}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="ships" defaultChecked={v.ships === "on"} className="w-4 h-4 accent-[#7A1E2B]" />
              {text.ships}
            </label>
          </div>
        )}
        {category?.requiresLicense && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="license_confirm" required defaultChecked={v.license_confirm === "on"} className="w-4 h-4 mt-0.5 accent-[#7A1E2B]" />
            {text.licenseConfirm}
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || !category}
        className="w-full bg-[#7A1E2B] text-white py-3 rounded-lg font-medium disabled:opacity-60"
      >
        {editing ? (pending ? text.saving : text.saveChanges) : pending ? text.publishing : text.publish}
      </button>
      {editing && (
        <Link href={`/listing/${editing.listingId}`} className="block text-center text-sm text-gray-600 hover:underline">
          {text.cancel}
        </Link>
      )}
    </form>
  );
}
