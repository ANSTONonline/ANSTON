"use client";

import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import PhotoEditor from "./photo-editor";
import Link from "next/link";
import { DEFAULT_HOURS, WEEKDAYS } from "@/lib/availability";
import { startTransition, useActionState, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Dictionary } from "@/i18n/server";
import type { Category, DbMode } from "@/lib/catalog";
import { createBrowserSupabase } from "@/lib/supabase/client";
import {
  AUCTION_DAYS,
  CONDITIONS,
  CURRENCIES,
  RATE_UNITS,
  BOOST_OPTIONS, REFUND_DAYS,
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
export async function shrink(file: File, longest = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
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

// Rental available dates: rows of "from – to" (first and last nights).
// Sent as JSON in one hidden field.
function RentalDates({ text, initial }: { text: Text; initial: string }) {
  const [rows, setRows] = useState<{ from: string; to: string }[]>(() => {
    try {
      const list = JSON.parse(initial || "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });
  const set = (i: number, key: "from" | "to", value: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  return (
    <fieldset className="space-y-2">
      <legend className="block text-sm font-medium">{text.rentalDates}</legend>
      <p className="text-xs text-gray-500">{text.rentalDatesHelp}</p>
      {rows.map((row, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            {text.rentalFrom}
            <input type="date" value={row.from} onChange={(e) => set(i, "from", e.target.value)} required className="block mt-1 border rounded-lg px-3 py-2 bg-white" />
          </label>
          <label className="text-sm">
            {text.rentalTo}
            <input type="date" value={row.to} min={row.from || undefined} onChange={(e) => set(i, "to", e.target.value)} required className="block mt-1 border rounded-lg px-3 py-2 bg-white" />
          </label>
          <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="text-sm text-[#7A1E2B] hover:underline pb-2">
            {text.rentalRemove}
          </button>
        </div>
      ))}
      {rows.length < 20 && (
        <button type="button" onClick={() => setRows((r) => [...r, { from: "", to: "" }])} className="border border-[#7A1E2B] text-[#7A1E2B] rounded-lg px-3 py-1.5 text-sm">
          + {rows.length ? text.rentalAddMore : text.rentalAdd}
        </button>
      )}
      <input type="hidden" name="rental_dates" value={JSON.stringify(rows)} />
    </fieldset>
  );
}

// One photo tile: drag it to change the order; edit (crop, zoom, rotate) or remove it.
function PhotoTile({ photo, index, text, onEdit, onRemove }: {
  photo: Photo; index: number; text: Text; onEdit: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.path });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 touch-none select-none ${isDragging ? "z-10 ring-2 ring-[#7A1E2B] shadow-lg opacity-90" : ""}`}
      {...attributes}
      {...listeners}
      aria-label={text.photoPosition.replace("{n}", String(index + 1))}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="" draggable={false} className="w-full h-full object-cover pointer-events-none" />
      <input type="hidden" name="photo" value={photo.path} />
      {index === 0 && (
        <span className="absolute bottom-1 start-1 bg-[#7A1E2B] text-white text-[10px] px-1.5 py-0.5 rounded">{text.cover}</span>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={onEdit}
        className="absolute bottom-1 end-1 bg-white/90 rounded-full w-7 h-7 text-sm leading-none"
        aria-label={text.editPhoto}
        title={text.editPhoto}
      >
        ✏️
      </button>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        className="absolute top-1 end-1 bg-white/90 rounded-full w-6 h-6 text-sm leading-none"
        aria-label={text.removePhoto}
        title={text.removePhoto}
      >
        ×
      </button>
    </div>
  );
}

function Photos({ text, userId, initial = [] }: { text: Text; userId: string; initial?: Photo[] }) {
  const [photos, setPhotos] = useState<Photo[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Photo | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Drag with a mouse, a finger (press and hold briefly) or the keyboard.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function upload(blob: Blob, nameHint = "photo.jpg") {
    const ext = blob.type === "image/jpeg" ? "jpg" : (nameHint.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await createBrowserSupabase()
      .storage.from(BUCKET)
      .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
    return uploadError ? null : { path, url: URL.createObjectURL(blob) };
  }

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(false);
    const room = MAX_PHOTOS - photos.length;
    const added: Photo[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const done = await upload(await shrink(file), file.name);
      if (done) added.push(done);
      else setError(true);
    }
    setPhotos((current) => [...current, ...added]);
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Photos already on the listing are only deleted when the changes are
  // saved, so nothing is lost if the person leaves without saving.
  const forget = (path: string) => {
    if (!initial.some((p) => p.path === path)) void discardPhoto(path);
  };

  function remove(path: string) {
    setPhotos((current) => current.filter((p) => p.path !== path));
    forget(path);
  }

  // An edited photo is uploaded as a new file and takes the old one's place.
  async function saveEdit(blob: Blob) {
    if (!editing) return;
    const done = await upload(blob, "photo.jpg");
    if (!done) throw new Error("upload failed");
    const old = editing.path;
    setPhotos((current) => current.map((p) => (p.path === old ? done : p)));
    forget(old);
    setEditing(null);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setPhotos((current) => {
      const from = current.findIndex((p) => p.path === active.id);
      const to = current.findIndex((p) => p.path === over.id);
      return arrayMove(current, from, to);
    });
  }

  return (
    <div>
      <p className={label}>{text.photos}</p>
      <p className="text-xs text-gray-500 mb-3">{text.photosHint} {photos.length > 1 && text.dragToReorder}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={photos.map((p) => p.path)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {photos.map((p, i) => (
              <PhotoTile key={p.path} photo={p} index={i} text={text} onEdit={() => setEditing(p)} onRemove={() => remove(p.path)} />
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
        </SortableContext>
      </DndContext>
      {error && <p className="text-sm text-red-600 mt-2">{text.photoError}</p>}
      {editing && (
        <PhotoEditor src={editing.url} text={text} onCancel={() => setEditing(null)} onSave={saveEdit} />
      )}
    </div>
  );
}

// Country, state/region and city. The region menu always matches the chosen
// country, and cities in that region are suggested as the seller types.
function LocationFields({
  text,
  locale,
  countryCodes,
  initial,
}: {
  text: Text;
  locale: string;
  countryCodes: string[];
  initial: { country?: string; region?: string; city?: string };
}) {
  const [country, setCountry] = useState(initial.country || "US");
  const [region, setRegion] = useState(initial.region ?? "");
  const [regions, setRegions] = useState<{ country: string; list: { code: string; name: string }[] } | null>(null);
  const [cities, setCities] = useState<{ key: string; list: string[] }>({ key: "", list: [] });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/places?country=${country}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => !cancelled && setRegions({ country, list }))
      .catch(() => !cancelled && setRegions({ country, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [country]);

  const key = `${country}/${region}`;
  useEffect(() => {
    if (!region) return;
    let cancelled = false;
    fetch(`/api/places?country=${country}&region=${encodeURIComponent(region)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => !cancelled && setCities({ key, list }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [country, region, key]);

  // Country names come from the browser. The server's list can be worded a
  // little differently, so the first render uses codes and names follow.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const names = inBrowser ? regionNames(locale) : null;
  const countryName = (code: string) => names?.of(code) ?? code;
  const countries = [...countryCodes].sort((a, b) => countryName(a).localeCompare(countryName(b), locale));
  const regionList = regions?.country === country ? regions.list : null;

  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <div>
        <label className={label} htmlFor="country">{text.country}</label>
        <select
          id="country"
          name="country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setRegion("");
          }}
          className={input}
        >
          {countries.map((c) => (
            <option key={c} value={c}>{countryName(c)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="region">{text.region}</label>
        {regionList && regionList.length === 0 ? (
          <input id="region" disabled value="—" className={`${input} text-gray-400`} />
        ) : (
          <select
            id="region"
            name="region"
            required
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={!regionList}
            className={input}
          >
            <option value="">{text.chooseRegion}</option>
            {(regionList ?? []).map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className={label} htmlFor="city">{text.city}</label>
        <input id="city" name="city" maxLength={100} defaultValue={initial.city} list="city-options" autoComplete="off" className={input} />
        <datalist id="city-options">
          {(cities.key === key ? cities.list : []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

// Weekly hours for services: tick the days you work and set the hours.
export function AvailabilityFields({ text, locale, values }: { text: Text; locale: string; values: Record<string, string> }) {
  const editing = WEEKDAYS.some((d) => values[`avail_${d}_on`] !== undefined);
  const [on, setOn] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(
      WEEKDAYS.map((d) => [d, editing ? values[`avail_${d}_on`] === "on" : DEFAULT_HOURS.days.includes(d)]),
    ),
  );
  // The browser knows the seller's time zone; the server checks it.
  const timeZone = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "",
  );
  const dayName = (d: number) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + d)));
    } catch {
      return String(d);
    }
  };
  return (
    <div className="space-y-2">
      <p className={label}>{text.availability}</p>
      <p className="text-xs text-gray-500">{text.availabilityHelp}</p>
      <input type="hidden" name="time_zone" value={values.time_zone || timeZone} />
      <div className="space-y-2">
        {WEEKDAYS.map((d) => (
          <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 w-36">
              <input
                type="checkbox"
                name={`avail_${d}_on`}
                checked={on[d]}
                onChange={(e) => setOn({ ...on, [d]: e.target.checked })}
                className="w-4 h-4 accent-[#7A1E2B]"
              />
              <span suppressHydrationWarning>{dayName(d)}</span>
            </label>
            {on[d] ? (
              <>
                <input
                  type="time"
                  name={`avail_${d}_from`}
                  defaultValue={values[`avail_${d}_from`] ?? DEFAULT_HOURS.from}
                  required
                  aria-label={`${dayName(d)} ${text.from}`}
                  className="border rounded-lg px-2 py-1"
                />
                <span className="text-gray-500">–</span>
                <input
                  type="time"
                  name={`avail_${d}_to`}
                  defaultValue={values[`avail_${d}_to`] ?? DEFAULT_HOURS.to}
                  required
                  aria-label={`${dayName(d)} ${text.to}`}
                  className="border rounded-lg px-2 py-1"
                />
              </>
            ) : (
              <span className="text-gray-400">{text.closed}</span>
            )}
          </div>
        ))}
      </div>
      {(values.time_zone || timeZone) && (
        <p className="text-xs text-gray-500">{text.timeZoneNote.replace("{zone}", values.time_zone || timeZone)}</p>
      )}
    </div>
  );
}

export default function ListingForm({
  text,
  categories,
  userId,
  locale,
  countryCodes,
  editing,
  providerGender = null,
}: {
  text: Text;
  categories: Category[];
  userId: string;
  locale: string;
  countryCodes: string[];
  providerGender?: string | null;
  editing?: EditingListing;
}) {
  const submit = editing ? updateListing.bind(null, editing.listingId) : createListing;
  const [state, action, pending] = useActionState<SellState, FormData>(submit, {});
  const v = state.values ?? editing?.values ?? {};
  const auctionLocked = Boolean(editing?.auctionLocked);
  const [categoryId, setCategoryId] = useState(v.category ?? "");
  const [ships, setShips] = useState(v.ships === "on");
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
  const [refund, setRefund] = useState(v.refund ?? "");

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
                <div>
                  {money("sale_price", text.price)}
                  <p className="text-xs text-gray-500 mt-1">{text.priceAllInHint}</p>
                </div>
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
                <fieldset>
                  <legend className={label}>{text.per}</legend>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(["day", "week", "month", "hour"] as const).filter((u) => (RATE_UNITS as readonly string[]).includes(u)).map((u) => (
                      <label key={u} className="cursor-pointer">
                        <input type="radio" name="rental_unit" value={u} defaultChecked={(v.rental_unit ?? "day") === u} className="peer sr-only" />
                        <span className="inline-block border rounded-full px-4 py-2 text-sm peer-checked:bg-[#7A1E2B] peer-checked:text-white peer-checked:border-[#7A1E2B] peer-focus-visible:ring-2 peer-focus-visible:ring-[#7A1E2B]/40">
                          {text.units[u]}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{text.calendarHint}</p>
                </fieldset>
                <RentalDates text={text} initial={v.rental_dates ?? ""} />
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
                <div className="sm:col-span-2">
                  <AvailabilityFields text={text} locale={locale} values={v} />
                </div>
                <fieldset className="sm:col-span-2 space-y-1">
                  <legend className={label}>{text.providerGender}</legend>
                  <p className="text-xs text-gray-500">{text.providerGenderHelp}</p>
                  <div className="flex flex-wrap gap-4 pt-1">
                    {([["female", text.genderFemale], ["male", text.genderMale], ["", text.genderPreferNot]] as const).map(([value, name]) => (
                      <label key={name} className="flex items-center gap-2 text-sm">
                        <input type="radio" name="provider_gender" value={value} defaultChecked={(v.provider_gender ?? providerGender ?? "") === value} />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="sm:col-span-2 text-sm">
                  📷 <a href="/account/profile" target="_blank" rel="noopener" className="text-[#7A1E2B] underline">{text.addProfilePhoto}</a>
                  <span className="text-xs text-gray-500"> {text.addProfilePhotoHelp}</span>
                </p>
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

      {category && (
        <div className={section}>
          <h2 className="font-semibold">{text.refundTitle}</h2>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="refund"
              value="refundable"
              required
              checked={refund === "refundable"}
              onChange={() => setRefund("refundable")}
              className="w-4 h-4 mt-0.5 accent-[#7A1E2B]"
            />
            <span>
              <span className="font-medium">{text.refundable}</span>
              <span className="block text-gray-500">{text.refundableHint}</span>
            </span>
          </label>
          {refund === "refundable" && (
            <div className="ps-6">
              <label className={label} htmlFor="refund_days">{text.refundWithin}</label>
              <select id="refund_days" name="refund_days" defaultValue={v.refund_days ?? "7"} className={`${input} sm:w-48`}>
                {REFUND_DAYS.map((d) => (
                  <option key={d} value={d}>{text.days.replace("{n}", String(d))}</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="refund"
              value="non_refundable"
              checked={refund === "non_refundable"}
              onChange={() => setRefund("non_refundable")}
              className="w-4 h-4 mt-0.5 accent-[#7A1E2B]"
            />
            <span>
              <span className="font-medium">{text.nonRefundable}</span>
              <span className="block text-gray-500">{text.nonRefundableHint}</span>
            </span>
          </label>
        </div>
      )}

      {category && (
        <div className={section}>
          <h2 className="font-semibold">{text.boostTitle}</h2>
          <p className="text-sm text-gray-600">{text.boostHelp}</p>
          <select id="boost" name="boost" defaultValue={v.boost ?? "0"} className={`${input} sm:w-72`} aria-label={text.boostTitle}>
            <option value="0">{text.boostNone}</option>
            {BOOST_OPTIONS.map((bps) => (
              <option key={bps} value={bps}>{text.boostOption.replace("{n}", String(bps / 100))}</option>
            ))}
          </select>
        </div>
      )}

      <div className={section}>
        <h2 className="font-semibold">{text.location}</h2>
        <LocationFields
          text={text}
          locale={locale}
          countryCodes={countryCodes}
          initial={{ country: v.country, region: v.region, city: v.city }}
        />
        {category && !isService && (
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="local_pickup" defaultChecked={v.local_pickup ? v.local_pickup === "on" : true} className="w-4 h-4 accent-[#7A1E2B]" />
              {text.localPickup}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="ships"
                checked={ships}
                onChange={(e) => setShips(e.target.checked)}
                className="w-4 h-4 accent-[#7A1E2B]"
              />
              {text.ships}
            </label>
          </div>
        )}
        {category && !isService && ships && (
          <div className="sm:w-64">
            <label className={label} htmlFor="shipping_price">{text.shippingPrice}</label>
            <input
              id="shipping_price"
              name="shipping_price"
              inputMode="decimal"
              defaultValue={v.shipping_price ?? ""}
              placeholder="0.00"
              className={input}
            />
            <p className="text-xs text-gray-500 mt-1">{text.shippingPriceHelp}</p>
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
