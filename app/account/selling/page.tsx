import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { findSellerListings } from "@/lib/catalog";
import { formatPrice, isFuture } from "@/lib/listings";
import { requireMember } from "@/lib/member";
import { periodBounds } from "@/lib/period";
import { priceLabel } from "@/lib/price-label";
import { answerOffer, answerReservation, deleteListing, setListingStatus } from "../../listing/actions";
import { ConfirmButton, LocalTime } from "../../listing/[id]/listing-actions";
import { openConversation } from "../../messages/actions";

type OfferRow = {
  id: string;
  amount_cents: number;
  message: string | null;
  status: keyof Awaited<ReturnType<typeof getDictionary>>["dashboard"]["offerStatus"];
  created_at: string;
  buyer_id: string;
  listing: { id: string; title: string; currency: string };
  buyer: { username: string | null } | null;
};

type RequestRow = {
  id: string;
  mode: string;
  period: string;
  status: keyof Awaited<ReturnType<typeof getDictionary>>["dashboard"]["requestStatus"];
  notes: string | null;
  renter_id: string;
  listing: { id: string; title: string };
  renter: { username: string | null } | null;
};

const small = "border rounded-lg px-3 py-1.5 text-sm bg-white";

function MessageButton({ listingId, buyerId, label }: { listingId: string; buyerId: string; label: string }) {
  return (
    <form action={openConversation}>
      <input type="hidden" name="listing" value={listingId} />
      <input type="hidden" name="buyer" value={buyerId} />
      <button type="submit" className={small}>💬 {label}</button>
    </form>
  );
}

function StatusButton({ action, id, status, label, className = small }: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  status: string;
  label: string;
  className?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={className}>{label}</button>
    </form>
  );
}

export default async function SellingPage() {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const d = t.dashboard;
  const { supabase, user } = await requireMember();

  const listings = await findSellerListings(locale, user.id);

  // Winners of ended auctions, so the seller can message them.
  const ended = listings.filter((l) => l.auction && l.auction.highestCents !== null && !isFuture(l.auction.endsAt));
  const winners = new Map<string, string>();
  if (ended.length > 0) {
    const { data: bids } = await supabase
      .from("bids")
      .select("listing_id, bidder_id, amount_cents, created_at")
      .in("listing_id", ended.map((l) => l.id))
      .order("amount_cents", { ascending: false })
      .order("created_at", { ascending: true });
    for (const b of bids ?? []) if (!winners.has(b.listing_id)) winners.set(b.listing_id, b.bidder_id);
  }

  const { data: offerData } = await supabase
    .from("offers")
    .select("id, amount_cents, message, status, created_at, buyer_id, listing:listings!inner ( id, title, currency, seller_id ), buyer:profiles!offers_buyer_id_fkey ( username )")
    .eq("listing.seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const offers = (offerData ?? []) as unknown as OfferRow[];

  const { data: requestData } = await supabase
    .from("reservations")
    .select("id, mode, period, status, notes, renter_id, listing:listings!inner ( id, title, seller_id ), renter:profiles!reservations_renter_id_fkey ( username )")
    .eq("listing.seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const requests = (requestData ?? []) as unknown as RequestRow[];

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-4xl mx-auto w-full space-y-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{d.sellingTitle}</h1>
        <Link href="/sell" className="bg-[#7A1E2B] text-white px-4 py-2 rounded-full text-sm whitespace-nowrap">
          {t.header.listItem}
        </Link>
      </div>

      <section>
        {listings.length === 0 ? (
          <p className="text-gray-600 border rounded-xl p-6 bg-gray-50">{d.noListings}</p>
        ) : (
          <ul className="divide-y border rounded-xl">
            {listings.map((l) => (
              <li key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-2xl shrink-0" aria-hidden="true">
                    {l.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.images[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      l.emoji
                    )}
                  </span>
                  <div className="min-w-0">
                    <Link href={`/listing/${l.id}`} className="font-semibold hover:text-[#7A1E2B] block truncate">{l.title}</Link>
                    <p className="text-sm text-gray-600">
                      <span dir="ltr">{priceLabel(l, t)}</span> ·{" "}
                      <span className={l.status === "active" ? "text-green-700" : "text-gray-500"}>
                        {t.listing.statuses[l.status as keyof typeof t.listing.statuses] ?? l.status}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/listing/${l.id}/edit`} className={small}>✏️ {t.listing.edit}</Link>
                  {winners.has(l.id) && (
                    <MessageButton listingId={l.id} buyerId={winners.get(l.id)!} label={d.messageWinner} />
                  )}
                  {l.status === "active" ? (
                    <StatusButton action={setListingStatus} id={l.id} status="paused" label={t.listing.pause} />
                  ) : (
                    <StatusButton action={setListingStatus} id={l.id} status="active" label={t.listing.activate} />
                  )}
                  {l.status !== "sold" && (
                    <StatusButton action={setListingStatus} id={l.id} status="sold" label={t.listing.markSold} />
                  )}
                  <form action={deleteListing}>
                    <input type="hidden" name="id" value={l.id} />
                    <ConfirmButton message={t.listing.deleteConfirm} className="border border-red-300 text-red-700 rounded-lg px-3 py-1.5 text-sm bg-white">
                      {t.listing.delete}
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{d.offersReceived}</h2>
        {offers.length === 0 ? (
          <p className="text-gray-500 text-sm">{d.none}</p>
        ) : (
          <ul className="divide-y border rounded-xl">
            {offers.map((o) => (
              <li key={o.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">
                    <span dir="ltr">{formatPrice(o.amount_cents, o.listing.currency)}</span>{" "}
                    <span className="font-normal text-gray-600">{d.from.replace("{username}", o.buyer?.username ?? "…")}</span>
                  </p>
                  <Link href={`/listing/${o.listing.id}`} className="text-sm text-gray-600 hover:underline">{o.listing.title}</Link>
                  {o.message && <p className="text-sm text-gray-700 mt-1">“{o.message}”</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {d.offerStatus[o.status]} · <LocalTime iso={o.created_at} locale={locale} />
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {o.status === "pending" && (
                    <>
                      <StatusButton action={answerOffer} id={o.id} status="accepted" label={d.accept} className="bg-[#7A1E2B] text-white rounded-lg px-3 py-1.5 text-sm" />
                      <StatusButton action={answerOffer} id={o.id} status="declined" label={d.decline} />
                    </>
                  )}
                  <MessageButton listingId={o.listing.id} buyerId={o.buyer_id} label={d.messageBuyer} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{d.requestsReceived}</h2>
        {requests.length === 0 ? (
          <p className="text-gray-500 text-sm">{d.none}</p>
        ) : (
          <ul className="divide-y border rounded-xl">
            {requests.map((r) => {
              const { start, end } = periodBounds(r.period);
              return (
                <li key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">
                      {d.from.replace("{username}", r.renter?.username ?? "…")}
                    </p>
                    <Link href={`/listing/${r.listing.id}`} className="text-sm text-gray-600 hover:underline">{r.listing.title}</Link>
                    <p className="text-sm text-gray-700">
                      <LocalTime iso={start} locale={locale} /> – <LocalTime iso={end} locale={locale} />
                    </p>
                    {r.notes && <p className="text-sm text-gray-700 mt-1">“{r.notes}”</p>}
                    <p className="text-xs text-gray-500 mt-1">{d.requestStatus[r.status]}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status === "requested" && (
                      <>
                        <StatusButton action={answerReservation} id={r.id} status="confirmed" label={d.confirm} className="bg-[#7A1E2B] text-white rounded-lg px-3 py-1.5 text-sm" />
                        <StatusButton action={answerReservation} id={r.id} status="cancelled" label={d.decline} />
                      </>
                    )}
                    {r.status === "confirmed" && (
                      <>
                        <StatusButton action={answerReservation} id={r.id} status="completed" label={d.complete} />
                        <StatusButton action={answerReservation} id={r.id} status="cancelled" label={d.cancel} />
                      </>
                    )}
                    <MessageButton listingId={r.listing.id} buyerId={r.renter_id} label={d.messageBuyer} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
