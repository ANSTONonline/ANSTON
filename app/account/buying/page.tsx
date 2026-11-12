import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatPrice } from "@/lib/listings";
import { requireMember } from "@/lib/member";
import { periodBounds } from "@/lib/period";
import { answerOffer, answerReservation } from "../../listing/actions";
import { LocalTime } from "../../listing/[id]/listing-actions";

type Dashboard = Awaited<ReturnType<typeof getDictionary>>["dashboard"];

type BidRow = { listing_id: string; amount_cents: number; created_at: string; listing: { id: string; title: string; currency: string } | null };
type OfferRow = {
  id: string;
  amount_cents: number;
  status: keyof Dashboard["offerStatus"];
  created_at: string;
  listing: { id: string; title: string; currency: string } | null;
};
type RequestRow = {
  id: string;
  period: string;
  status: keyof Dashboard["requestStatus"];
  listing: { id: string; title: string } | null;
};

export default async function BuyingPage() {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const d = t.dashboard;
  const { supabase, user } = await requireMember();

  const [{ data: bidData }, { data: offerData }, { data: requestData }] = await Promise.all([
    supabase
      .from("bids")
      .select("listing_id, amount_cents, created_at, listing:listings ( id, title, currency )")
      .eq("bidder_id", user.id)
      .order("amount_cents", { ascending: false })
      .limit(200),
    supabase
      .from("offers")
      .select("id, amount_cents, status, created_at, listing:listings ( id, title, currency )")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("reservations")
      .select("id, period, status, listing:listings ( id, title )")
      .eq("renter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // My highest bid on each auction, and whether it's still the top bid.
  const mine = new Map<string, BidRow>();
  for (const b of (bidData ?? []) as unknown as BidRow[]) if (!mine.has(b.listing_id)) mine.set(b.listing_id, b);
  const top = new Map<string, number>();
  if (mine.size > 0) {
    const { data } = await supabase
      .from("bids")
      .select("listing_id, amount_cents")
      .in("listing_id", [...mine.keys()])
      .order("amount_cents", { ascending: false });
    for (const b of data ?? []) if (!top.has(b.listing_id)) top.set(b.listing_id, Number(b.amount_cents));
  }
  const offers = (offerData ?? []) as unknown as OfferRow[];
  const requests = (requestData ?? []) as unknown as RequestRow[];

  const empty = <p className="text-gray-500 text-sm">{d.none}</p>;

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-4xl mx-auto w-full space-y-10">
      <h1 className="text-3xl font-bold">{d.buyingTitle}</h1>

      <section>
        <h2 className="text-xl font-bold mb-3">{d.myBids}</h2>
        {mine.size === 0 ? empty : (
          <ul className="divide-y border rounded-xl">
            {[...mine.values()].map((b) => {
              const winning = top.get(b.listing_id) === Number(b.amount_cents);
              return (
                <li key={b.listing_id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {b.listing ? (
                      <Link href={`/listing/${b.listing.id}`} className="font-semibold hover:text-[#7A1E2B]">{b.listing.title}</Link>
                    ) : (
                      <p className="text-gray-500">{t.messages.listingGone}</p>
                    )}
                    <p className="text-sm text-gray-600">
                      {t.listing.yourBid}: <span dir="ltr">{formatPrice(Number(b.amount_cents), b.listing?.currency)}</span>
                    </p>
                  </div>
                  <span className={`text-sm font-medium ${winning ? "text-green-700" : "text-red-700"}`}>
                    {winning ? d.winning : d.outbid}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{d.myOffers}</h2>
        {offers.length === 0 ? empty : (
          <ul className="divide-y border rounded-xl">
            {offers.map((o) => (
              <li key={o.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {o.listing && (
                    <Link href={`/listing/${o.listing.id}`} className="font-semibold hover:text-[#7A1E2B]">{o.listing.title}</Link>
                  )}
                  <p className="text-sm text-gray-600">
                    <span dir="ltr">{formatPrice(o.amount_cents, o.listing?.currency)}</span> · {d.offerStatus[o.status]} ·{" "}
                    <LocalTime iso={o.created_at} locale={locale} withTime={false} />
                  </p>
                </div>
                {o.status === "pending" && (
                  <form action={answerOffer}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value="withdrawn" />
                    <button type="submit" className="border rounded-lg px-3 py-1.5 text-sm">{d.withdraw}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">{d.myRequests}</h2>
        {requests.length === 0 ? empty : (
          <ul className="divide-y border rounded-xl">
            {requests.map((r) => {
              const { start, end } = periodBounds(r.period);
              return (
                <li key={r.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {r.listing && (
                      <Link href={`/listing/${r.listing.id}`} className="font-semibold hover:text-[#7A1E2B]">{r.listing.title}</Link>
                    )}
                    <p className="text-sm text-gray-600">
                      <LocalTime iso={start} locale={locale} /> – <LocalTime iso={end} locale={locale} />
                    </p>
                    <p className="text-xs text-gray-500">{d.requestStatus[r.status]}</p>
                  </div>
                  {(r.status === "requested" || r.status === "confirmed") && (
                    <form action={answerReservation}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button type="submit" className="border rounded-lg px-3 py-1.5 text-sm">{d.cancel}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
