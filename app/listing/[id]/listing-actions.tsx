"use client";

import { useActionState, useState } from "react";
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
export function LocalTime({ iso, locale, withTime = true }: { iso: string; locale: string; withTime?: boolean }) {
  const date = new Date(iso);
  const formatted = date.toLocaleString(locale, {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
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

export function OfferForm({ listingId, text }: { listingId: string; text: Text }) {
  const [open, setOpen] = useState(false);
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
      <input id="offer-amount" name="amount" type="number" min="0.01" step="0.01" required className={input} dir="ltr" />
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

export function ReserveForm({
  listingId,
  mode,
  text,
  note,
}: {
  listingId: string;
  mode: "rental" | "booking";
  text: Text;
  note?: string;
}) {
  const [state, action, pending] = useActionState(requestReservation.bind(null, listingId, mode), {});
  return (
    <form action={(fd) => action(withIsoTimes(fd))} className={box}>
      <p className="font-medium">{mode === "rental" ? text.rentTitle : text.bookTitle}</p>
      <div className={mode === "rental" ? "grid sm:grid-cols-2 gap-3" : ""}>
        <div>
          <label className="block text-sm" htmlFor={`${mode}-start`}>{mode === "rental" ? text.start : text.when}</label>
          <input id={`${mode}-start`} name="start" type="datetime-local" required className={input} />
        </div>
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
