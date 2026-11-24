"use client";

import { allInCents } from "@/lib/fees";
import { useActionState, useEffect, useState } from "react";
import type { Dictionary } from "@/i18n/server";
import {
  makeOffer,
  messageSeller,
  placeBid,
  reportListing,
  requestReservation,
  type ListingActionState,
} from "../actions";

type Text = Dictionary["listing"];

const input = "w-full border rounded-lg px-3 py-2 bg-white";
const primary = "w-full bg-[#7A1E2B] text-white py-3 rounded-lg font-medium disabled:opacity-60";
const box = "border rounded-xl p-4 space-y-3";

function Feedback({ state, text, success }: { state: ListingActionState; text: Text; success: string }) {
  if (state.ok) return <p role="status" className="text-sm text-green-800 bg-green-50 rounded-lg p-2">{success}</p>;
  if (state.error) return <p role="alert" className="text-sm text-red-800 bg-red-50 rounded-lg p-2">{text.errors[state.error]}</p>;
  return null;
}

// Shows a time in the visitor's own time zone and language.
export function LocalTime({ iso, locale, withTime = true, utcDate = false }: { iso: string; locale: string; withTime?: boolean; utcDate?: boolean }) {
  const date = new Date(iso);
  // utcDate: a whole-day rental date, shown as the same calendar date everywhere.
  const formatted = date.toLocaleString(locale, {
    dateStyle: "medium",
    ...(utcDate ? { timeZone: "UTC" } : withTime ? { timeStyle: "short" } : {}),
  });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatted}
    </time>
  );
}

export function Gallery({ images, emoji, title }: { images: string[]; emoji: string; title: string }) {
  const [current, setCurrent] = useState(0);
  if (images.length === 0) {
    return (
      <div className="h-72 md:h-96 bg-gray-100 rounded-xl flex items-center justify-center text-8xl">
        <span aria-hidden="true">{emoji}</span>
      </div>
    );
  }
  return (
    <div>
      <div className="h-72 md:h-96 bg-gray-100 rounded-xl overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[current]} alt={title} className="w-full h-full object-contain" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setCurrent(i)}
              className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 ${i === current ? "border-[#7A1E2B]" : "border-transparent"}`}
              aria-label={`${i + 1} / ${images.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BidForm({
  listingId,
  minAmount,
  minLabel,
  text,
}: {
  listingId: string;
  minAmount: number; // in cents
  minLabel: string;
  text: Text;
}) {
  const [state, action, pending] = useActionState(placeBid.bind(null, listingId), {});
  return (
    <form action={action} className={box}>
      <label className="block text-sm font-medium" htmlFor="bid-amount">{text.yourBid}</label>
      <input
        id="bid-amount"
        name="amount"
        type="number"
        min={(minAmount / 100).toFixed(2)}
        step="0.01"
        required
        className={input}
        dir="ltr"
      />
      <p className="text-xs text-gray-500">{text.minBid.replace("{amount}", minLabel)}</p>
      <Feedback state={state} text={text} success={text.bidPlaced} />
      <button type="submit" disabled={pending} className={primary}>{text.placeBid}</button>
    </form>
  );
}

export function OfferForm({ listingId, text, currency = "USD", locale = "en" }: { listingId: string; text: Text; currency?: string; locale?: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  // What the buyer pays if accepted: the offer with Anston's fee included.
  const offerCents = Math.round(Number(amount) * 100);
  const payCents = Number.isFinite(offerCents) && offerCents > 0 ? allInCents(offerCents) : 0;
  const [state, action, pending] = useActionState(makeOffer.bind(null, listingId), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full border border-[#7A1E2B] text-[#7A1E2B] py-3 rounded-lg font-medium">
        {text.makeOffer}
      </button>
    );
  }
  return (
    <form action={action} className={box}>
      <p className="font-medium">{text.offerTitle}</p>
      <label className="block text-sm" htmlFor="offer-amount">{text.offerAmount}</label>
      <input id="offer-amount" name="amount" type="number" min="0.01" step="0.01" required className={input} dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
      {payCents > 0 && (
        <p className="text-xs text-gray-600">
          {text.offerYouPay.replace("{amount}", new Intl.NumberFormat(locale, { style: "currency", currency }).format(payCents / 100))}
        </p>
      )}
      <label className="block text-sm" htmlFor="offer-message">{text.offerMessage}</label>
      <textarea id="offer-message" name="message" rows={2} maxLength={1000} className={input} />
      <Feedback state={state} text={text} success={text.offerSent} />
      {!state.ok && <button type="submit" disabled={pending} className={primary}>{text.sendOffer}</button>}
    </form>
  );
}

// Turns the datetime-local value (the visitor's local time) into an ISO time.
function withIsoTimes(fd: FormData) {
  for (const key of ["start", "end"]) {
    const value = fd.get(key);
    if (typeof value === "string" && value) fd.set(key, new Date(value).toISOString());
  }
  return fd;
}

// Day picker plus the open times on that day, fetched from the server. The
// chosen time goes in a hidden "start" field.
function SlotPicker({ listingId, text, locale, today, lastDay }: {
  listingId: string;
  text: Text;
  locale: string;
  today: string;
  lastDay: string;
}) {
  const [date, setDate] = useState("");
  const [loaded, setLoaded] = useState<{ date: string; slots: string[] } | null>(null);
  const [chosen, setChosen] = useState("");

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetch(`/api/listings/${listingId}/slots?date=${date}`)
      .then((r) => (r.ok ? r.json() : { slots: [] }))
      .then((d: { slots: string[] }) => !cancelled && setLoaded({ date, slots: d.slots ?? [] }))
      .catch(() => !cancelled && setLoaded({ date, slots: [] }));
    return () => {
      cancelled = true;
    };
  }, [date, listingId]);

  const slots = loaded?.date === date ? loaded.slots : null;
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm" htmlFor="booking-date">{text.chooseDay}</label>
        <input
          id="booking-date"
          type="date"
          min={today}
          max={lastDay}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setChosen("");
          }}
          required
          className={input}
        />
      </div>
      {date && (
        <fieldset>
          <legend className="block text-sm mb-1">{text.chooseTime}</legend>
          {slots === null ? (
            <p className="text-sm text-gray-500">{text.loadingTimes}</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-gray-500">{text.noTimes}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((iso) => (
                <label key={iso} className="cursor-pointer">
                  <input
                    type="radio"
                    name="slot"
                    value={iso}
                    checked={chosen === iso}
                    onChange={() => setChosen(iso)}
                    required
                    className="sr-only peer"
                  />
                  <span className="block border rounded-lg px-3 py-1.5 text-sm peer-checked:bg-[#7A1E2B] peer-checked:text-white peer-checked:border-[#7A1E2B] peer-focus-visible:outline peer-focus-visible:outline-2">
                    {timeLabel(iso)}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1">{text.yourTimeZone}</p>
        </fieldset>
      )}
      <input type="hidden" name="start" value={chosen} />
    </div>
  );
}

export function ReserveForm({
  listingId,
  mode,
  text,
  note,
  slots,
}: {
  listingId: string;
  mode: "rental" | "booking";
  text: Text;
  note?: string;
  // Services with weekly hours: pick from open times instead of typing a date.
  slots?: { locale: string; today: string; lastDay: string };
}) {
  const [state, action, pending] = useActionState(requestReservation.bind(null, listingId, mode), {});
  return (
    <form action={(fd) => action(withIsoTimes(fd))} className={box}>
      <p className="font-medium">{mode === "rental" ? text.rentTitle : text.bookTitle}</p>
      <div className={mode === "rental" ? "grid sm:grid-cols-2 gap-3" : ""}>
        {slots ? (
          <SlotPicker listingId={listingId} text={text} {...slots} />
        ) : (
        <div>
          <label className="block text-sm" htmlFor={`${mode}-start`}>{mode === "rental" ? text.start : text.when}</label>
          <input id={`${mode}-start`} name="start" type="datetime-local" required className={input} />
        </div>
        )}
        {mode === "rental" && (
          <div>
            <label className="block text-sm" htmlFor="rental-end">{text.end}</label>
            <input id="rental-end" name="end" type="datetime-local" required className={input} />
          </div>
        )}
      </div>
      {note && <p className="text-xs text-gray-500">{note}</p>}
      <label className="block text-sm" htmlFor={`${mode}-notes`}>{text.notes}</label>
      <textarea id={`${mode}-notes`} name="notes" rows={2} maxLength={1000} className={input} />
      <Feedback state={state} text={text} success={text.requestSent} />
      {!state.ok && (
        <button type="submit" disabled={pending} className={primary}>
          {mode === "rental" ? text.rentNow : text.bookNow}
        </button>
      )}
    </form>
  );
}

export function MessageForm({ listingId, text }: { listingId: string; text: Text }) {
  const [state, action, pending] = useActionState(messageSeller.bind(null, listingId), {});
  return (
    <form action={action} className={box}>
      <label className="block font-medium" htmlFor="message-body">{text.contactTitle}</label>
      <textarea
        id="message-body"
        name="body"
        rows={3}
        required
        maxLength={5000}
        placeholder={text.messagePlaceholder}
        className={input}
      />
      <Feedback state={state} text={text} success="" />
      <button type="submit" disabled={pending} className="w-full border border-[#7A1E2B] text-[#7A1E2B] py-2 rounded-lg font-medium">
        {text.send}
      </button>
    </form>
  );
}

export function ReportForm({ listingId, text }: { listingId: string; text: Text }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reportListing.bind(null, listingId), {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-gray-500 hover:underline">
        🚩 {text.report}
      </button>
    );
  }
  return (
    <form action={action} className={box}>
      <p className="font-medium text-sm">{text.reportTitle}</p>
      <label className="block text-sm" htmlFor="report-reason">{text.reportReason}</label>
      <select id="report-reason" name="reason" required className={input}>
        {(Object.keys(text.reasons) as (keyof Text["reasons"])[]).map((r) => (
          <option key={r} value={r}>{text.reasons[r]}</option>
        ))}
      </select>
      <label className="block text-sm" htmlFor="report-details">{text.reportDetails}</label>
      <textarea id="report-details" name="details" rows={2} maxLength={2000} className={input} />
      <Feedback state={state} text={text} success={text.reportSent} />
      {!state.ok && (
        <button type="submit" disabled={pending} className="w-full border py-2 rounded-lg text-sm">
          {text.report}
        </button>
      )}
    </form>
  );
}

// A submit button that asks "Are you sure?" first.
export function ConfirmButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rental calendar: for rentals priced per day, week or month. Taken dates are
// greyed out; the renter taps a start and end date (per day) or a start date
// and how many weeks/months. Dates are plain calendar dates ("YYYY-MM-DD").
// ---------------------------------------------------------------------------
const DAY_MS = 86400000;
const toDate = (s: string) => new Date(`${s}T12:00:00.000Z`);
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => fmtDate(new Date(toDate(s).getTime() + n * DAY_MS));
const addUnits = (s: string, unit: "week" | "month", n: number) => {
  const d = toDate(s);
  if (unit === "week") d.setUTCDate(d.getUTCDate() + 7 * n);
  else {
    // Jan 31 + 1 month = Feb 28 (not Mar 3): stay in the target month.
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate()));
  }
  return fmtDate(d);
};

export function RentalCalendar({
  listingId,
  unit,
  rateCents,
  currency,
  depositCents,
  busy,
  today,
  locale,
  text,
  unitName,
  available = [],
}: {
  listingId: string;
  unit: "day" | "week" | "month";
  available?: { from: string; to: string }[];
  rateCents: number;
  currency: string;
  depositCents?: number | null;
  busy: { start: string; end: string }[];
  today: string;
  locale: string;
  text: Text;
  unitName: string;
}) {
  const [state, action, pending] = useActionState(requestReservation.bind(null, listingId, "rental"), {});
  // Open on the first month the place is available.
  const firstOpen = available.map((r) => (r.from > today ? r.from : today)).filter((d, i) => available[i].to >= today).sort()[0];
  const [cursor, setCursor] = useState(() => (firstOpen ?? today).slice(0, 7)); // "YYYY-MM"
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [count, setCount] = useState(1);

  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  const longDate = (s: string) => toDate(s).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });

  // A night is taken if a live reservation covers noon UTC of that date, or
  // the seller didn't list it as available.
  const open = (s: string) => available.length === 0 || available.some((r) => r.from <= s && s <= r.to);
  const taken = (s: string) => {
    if (!open(s)) return true;
    const t = toDate(s).getTime();
    return busy.some((b) => new Date(b.start).getTime() <= t && t < new Date(b.end).getTime());
  };
  const rangeFree = (from: string, to: string) => {
    for (let d = from; d < to; d = addDays(d, 1)) if (taken(d)) return false;
    return true;
  };

  const finish = unit === "day" ? end : start ? addUnits(start, unit, count) : null;
  const units = unit === "day" ? (start && end ? Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY_MS) : 0) : start ? count : 0;
  const free = start && finish ? rangeFree(start, finish) : true;
  const ready = Boolean(start && finish && units > 0 && free);

  const pick = (d: string) => {
    if (unit !== "day") {
      setStart(d);
      return;
    }
    if (!start || end || d <= start) {
      setStart(d);
      setEnd(null);
    } else if (rangeFree(start, d)) {
      setEnd(d);
    }
  };

  // Month grid
  const [y, m] = cursor.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const lead = first.getUTCDay();
  const monthLabel = first.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2023, 0, 1 + i, 12)).toLocaleDateString(locale, { weekday: "narrow", timeZone: "UTC" }),
  );
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
    setCursor(fmtDate(d).slice(0, 7));
  };
  const canGoBack = cursor > today.slice(0, 7);
  const lastMonth = addDays(today, 395).slice(0, 7);

  return (
    <form action={action} className={box}>
      <p className="font-medium">{text.rentTitle}</p>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={!canGoBack} aria-label={text.calPrev} className="px-3 py-1 rounded-lg border disabled:opacity-30">‹</button>
        <p className="font-semibold capitalize">{monthLabel}</p>
        <button type="button" onClick={() => shift(1)} disabled={cursor >= lastMonth} aria-label={text.calNext} className="px-3 py-1 rounded-lg border disabled:opacity-30">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500" aria-hidden="true">
        {weekdays.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = `${cursor}-${String(i + 1).padStart(2, "0")}`;
          const past = d < today;
          const isTaken = taken(d);
          // A taken night can still be the last day (you leave that morning).
          const canEndHere = unit === "day" && start && !end && d > start && rangeFree(start, d);
          const isEdge = d === start || d === finish;
          const disabled = !isEdge && (past || (isTaken && !canEndHere));
          const inside = start && finish && d > start && d < finish;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => pick(d)}
              aria-pressed={isEdge}
              aria-label={`${longDate(d)}${isTaken ? ` (${text.calBooked})` : ""}`}
              className={`aspect-square rounded-lg ${
                isEdge ? "bg-[#7A1E2B] text-white font-semibold" : inside ? "bg-[#7A1E2B]/15" : "hover:bg-gray-100"
              } ${disabled ? "text-gray-300 cursor-not-allowed hover:bg-transparent" : ""} ${isTaken && !isEdge && open(d) ? "line-through" : ""}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">
        <span className="line-through">12</span> = {text.calBooked}
      </p>

      {unit !== "day" && (
        <label className="block text-sm">
          {text.calLength}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${input} mt-1`}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} × {unitName}</option>
            ))}
          </select>
        </label>
      )}

      <div className="text-sm bg-gray-50 rounded-lg p-3 space-y-1">
        {!start ? (
          <p>{text.calPickStart}</p>
        ) : unit === "day" && !end ? (
          <p><span className="text-gray-500">{text.calStart}:</span> {longDate(start)} · {text.calPickEnd}</p>
        ) : (
          <>
            <p><span className="text-gray-500">{text.calStart}:</span> {longDate(start)}</p>
            {finish && <p><span className="text-gray-500">{text.calEnd}:</span> {longDate(finish)}</p>}
            {free ? (
              <p className="font-semibold pt-1">
                {units} × {money(rateCents)}/{unitName} = {money(units * rateCents)}
              </p>
            ) : (
              <p role="alert" className="text-red-700">{text.calTaken}</p>
            )}
          </>
        )}
        {depositCents ? <p className="text-xs text-gray-600">{text.deposit.replace("{amount}", money(depositCents))}</p> : null}
      </div>
      {start && (
        <button type="button" onClick={() => { setStart(null); setEnd(null); }} className="text-sm text-[#7A1E2B] hover:underline">
          {text.calClear}
        </button>
      )}

      <input type="hidden" name="start_date" value={start ?? ""} />
      <input type="hidden" name="end_date" value={unit === "day" ? end ?? "" : ""} />
      <input type="hidden" name="count" value={String(count)} />
      <label className="block text-sm" htmlFor="rental-notes">{text.notes}</label>
      <textarea id="rental-notes" name="notes" rows={2} maxLength={1000} className={input} />
      <Feedback state={state} text={text} success={text.requestSent} />
      {!state.ok && (
        <button type="submit" disabled={pending || !ready} className={primary}>
          {text.rentNow}
        </button>
      )}
    </form>
  );
}
