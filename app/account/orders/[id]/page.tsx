import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatPrice } from "@/lib/listings";
import { requireMember } from "@/lib/member";
import { CARRIERS, orderSteps, trackingUrl, type OrderStatus } from "@/lib/orders";
import { ConfirmButton, LocalTime } from "../../../listing/[id]/listing-actions";
import { openConversation } from "../../../messages/actions";
import { confirmReceived, leaveReview, markShipped } from "../actions";
import StarPicker from "./star-picker";
import { StatusBadge } from "../status-badge";
import { recordPayment } from "@/lib/checkout";
import { paymentsConfigured } from "@/lib/stripe";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type Order = {
  id: string;
  mode: string;
  status: OrderStatus;
  quantity: number;
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  service_fee_cents: number;
  total_cents: number;
  carrier: string | null;
  tracking_number: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  ship_to: { name?: string | null; address?: Record<string, string | null> | null } | null;
  stripe_account_id: string | null;
  stripe_checkout_session_id: string | null;
  buyer_id: string;
  seller_id: string;
  listing: { id: string; title: string } | null;
  buyer: { username: string | null } | null;
  seller: { username: string | null } | null;
};

export default async function OrderPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const member = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const o = t.orders;
  const flags = await searchParams;

  // Row Level Security only returns the order to its buyer, its seller, or an admin.
  const { data, error } = await member.supabase
    .from("orders")
    .select(
      `id, mode, status, quantity, currency, subtotal_cents, shipping_cents, tax_cents, service_fee_cents, total_cents,
       carrier, tracking_number, created_at, paid_at, shipped_at, delivered_at, completed_at, buyer_id, seller_id,
       ship_to, stripe_account_id, stripe_checkout_session_id,
       listing:listings ( id, title ),
       buyer:profiles!orders_buyer_id_fkey ( username ),
       seller:profiles!orders_seller_id_fkey ( username )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("order", error.message);
  let order = data as unknown as Order | null;
  if (!order) notFound();

  // Back from Stripe Checkout: confirm the payment with Stripe and record it.
  const sessionId = typeof flags.session_id === "string" ? flags.session_id : "";
  if (sessionId && order.status === "pending_payment" && order.buyer_id === member.user.id && order.stripe_account_id
      && sessionId === order.stripe_checkout_session_id && paymentsConfigured()) {
    try {
      if (await recordPayment(member.supabase, order.id, sessionId, order.stripe_account_id)) {
        // A different query on purpose: Next.js reuses identical requests within one page load.
        const { data: fresh } = await member.supabase
          .from("orders")
          .select("status, paid_at, ship_to")
          .eq("id", order.id)
          .single();
        if (fresh) order = { ...order, ...(fresh as Pick<Order, "status" | "paid_at" | "ship_to">) };
      }
    } catch (e) {
      console.error("recordPayment", e instanceof Error ? e.message : e);
    }
  }

  const isSeller = order.seller_id === member.user.id;
  const isBuyer = order.buyer_id === member.user.id;
  const { ships, steps } = orderSteps(order.mode, order.status);
  const trackLink = trackingUrl(order.carrier, order.tracking_number);
  const money = (cents: number) => <span dir="ltr">{formatPrice(cents, order.currency)}</span>;
  const dated = (template: string, iso: string) => {
    const [before, after] = template.split("{date}");
    return <>{before}<LocalTime iso={iso} locale={locale} withTime={false} />{after}</>;
  };
  const stepDates: Record<string, string | null> = {
    ordered: order.created_at,
    paid: order.paid_at,
    shipped: order.shipped_at,
    delivered: order.delivered_at,
    completed: order.completed_at,
  };
  const canShip = isSeller && ships && (order.status === "paid" || order.status === "fulfilled");
  const canReview = isBuyer && (order.status === "fulfilled" || order.status === "completed");
  const { data: myReview } = canReview
    ? await member.supabase
        .from("reviews")
        .select("rating, comment")
        .eq("order_id", order.id)
        .eq("reviewer_id", member.user.id)
        .maybeSingle()
    : { data: null };
  const r = t.reviews;

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-2xl mx-auto w-full">
      <Link href={isSeller ? "/account/orders?view=sales" : "/account/orders"} className="text-sm text-gray-600 hover:underline">
        {o.back}
      </Link>
      <div className="flex items-start justify-between gap-3 mt-3 mb-6">
        <h1 className="text-3xl font-bold">{o.orderTitle}</h1>
        <StatusBadge status={order.status} label={o.status[order.status]} />
      </div>

      {sessionId && order.status === "paid" && isBuyer && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">🎉 {t.checkout.paidThanks}</p>}
      {sessionId && order.status === "pending_payment" && isBuyer && <p role="status" className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm">{t.checkout.paymentPending}</p>}
      {flags.shipped && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{o.shippedSaved}</p>}
      {flags.received && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{o.receivedSaved}</p>}
      {flags.reviewed && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{r.thanks}</p>}
      {flags.error && <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{o.error}</p>}

      {/* Progress tracker */}
      <ol className="flex items-start mb-8" aria-label={o.tracking}>
        {steps.map((step, i) => (
          <li key={step.key} className="flex-1 flex flex-col items-center text-center relative">
            {i > 0 && (
              <span className={`absolute top-3 end-1/2 w-full h-0.5 ${step.done ? "bg-[#7A1E2B]" : "bg-gray-200"}`} aria-hidden />
            )}
            <span
              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step.done ? "bg-[#7A1E2B] text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <span className={`text-xs mt-2 ${step.done ? "font-medium" : "text-gray-500"}`}>{o.steps[step.key]}</span>
            {step.done && stepDates[step.key] && (
              <span className="text-[11px] text-gray-500"><LocalTime iso={stepDates[step.key]!} locale={locale} withTime={false} /></span>
            )}
          </li>
        ))}
      </ol>

      <div className="border rounded-xl p-5 space-y-3 mb-4">
        {order.listing ? (
          <Link href={`/listing/${order.listing.id}`} className="font-semibold text-[#7A1E2B] hover:underline break-words">
            {order.listing.title}
          </Link>
        ) : (
          <p className="font-semibold">—</p>
        )}
        <p className="text-sm text-gray-600">{dated(o.placed, order.created_at)}</p>
        <p className="text-sm">
          {o.seller}: <span dir="ltr">@{order.seller?.username ?? "—"}</span> · {o.buyer}: <span dir="ltr">@{order.buyer?.username ?? "—"}</span>
        </p>
        <dl className="text-sm border-t pt-3 space-y-1">
          <div className="flex justify-between"><dt>{o.subtotal}</dt><dd>{money(order.subtotal_cents)}</dd></div>
          {order.service_fee_cents > 0 && <div className="flex justify-between"><dt>{t.checkout.serviceFeePlain}</dt><dd>{money(order.service_fee_cents)}</dd></div>}
          {order.shipping_cents > 0 && <div className="flex justify-between"><dt>{o.shipping}</dt><dd>{money(order.shipping_cents)}</dd></div>}
          {order.tax_cents > 0 && <div className="flex justify-between"><dt>{o.tax}</dt><dd>{money(order.tax_cents)}</dd></div>}
          <div className="flex justify-between font-semibold border-t pt-2"><dt>{o.total}</dt><dd>{money(order.total_cents)}</dd></div>
        </dl>
      </div>

      {order.ship_to?.address && (isSeller || isBuyer) && (
        <div className="border rounded-xl p-5 mb-4 text-sm">
          <h2 className="font-semibold mb-2">📦 {t.checkout.shipTo}</h2>
          <address className="not-italic leading-relaxed" dir="ltr">
            {order.ship_to.name && <>{order.ship_to.name}<br /></>}
            {[order.ship_to.address.line1, order.ship_to.address.line2].filter(Boolean).join(", ")}<br />
            {[order.ship_to.address.city, order.ship_to.address.state, order.ship_to.address.postal_code].filter(Boolean).join(", ")}<br />
            {order.ship_to.address.country}
          </address>
        </div>
      )}

      <div className="border rounded-xl p-5 space-y-3 mb-4">
        <h2 className="font-semibold">{o.tracking}</h2>
        {!ships ? (
          <p className="text-sm text-gray-600">{o.noShipping}</p>
        ) : order.tracking_number ? (
          <div className="text-sm space-y-1">
            <p>{o.carrier}: {order.carrier === "Other" ? o.other : order.carrier}</p>
            <p>{o.trackingNumber}: <span dir="ltr" className="font-mono">{order.tracking_number}</span></p>
            {order.shipped_at && <p className="text-gray-600">{dated(o.shippedOn, order.shipped_at)}</p>}
            {order.delivered_at && <p className="text-gray-600">{dated(o.deliveredOn, order.delivered_at)}</p>}
            {trackLink && (
              <a href={trackLink} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 bg-[#7A1E2B] text-white rounded-lg px-4 py-2">
                {o.trackPackage} ↗
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-600">{order.shipped_at ? dated(o.shippedOn, order.shipped_at) : o.noTracking}</p>
        )}

        {canShip && (
          <form action={markShipped} className="border-t pt-4 space-y-3">
            <input type="hidden" name="id" value={order.id} />
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                {o.carrier}
                <select name="carrier" defaultValue={order.carrier ?? "USPS"} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white">
                  {CARRIERS.map((c) => <option key={c} value={c}>{c === "Other" ? o.other : c}</option>)}
                </select>
              </label>
              <label className="text-sm">
                {o.trackingNumber}
                <input name="tracking" defaultValue={order.tracking_number ?? ""} maxLength={100} dir="ltr" className="mt-1 w-full border rounded-lg px-3 py-2" />
              </label>
            </div>
            <button type="submit" className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm">
              {order.status === "fulfilled" ? o.updateTracking : o.addTracking}
            </button>
          </form>
        )}

        {isBuyer && order.status === "fulfilled" && (
          <form action={confirmReceived} className="border-t pt-4">
            <input type="hidden" name="id" value={order.id} />
            <ConfirmButton message={o.confirmReceivedAsk} className="bg-green-700 text-white rounded-lg px-4 py-2 text-sm">
              {o.confirmReceived}
            </ConfirmButton>
          </form>
        )}
      </div>

      {canReview && (
        <div className="border rounded-xl p-5 space-y-3 mb-4">
          <h2 className="font-semibold">{myReview ? r.yours : r.leaveTitle}</h2>
          {myReview ? (
            <div>
              <p className="text-amber-500 text-lg" aria-label={r.stars.replace("{n}", String(myReview.rating))}>
                {"★".repeat(myReview.rating)}<span className="text-gray-300">{"★".repeat(5 - myReview.rating)}</span>
              </p>
              {myReview.comment && <p className="text-sm text-gray-700 whitespace-pre-line mt-1">{myReview.comment}</p>}
            </div>
          ) : (
            <form action={leaveReview} className="space-y-3">
              <input type="hidden" name="id" value={order.id} />
              <StarPicker label={r.rating} starsLabel={r.stars} />
              <label className="block text-sm">
                {r.comment}
                <textarea name="comment" maxLength={2000} rows={3} className="mt-1 w-full border rounded-lg px-3 py-2" />
              </label>
              <button type="submit" className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm">{r.submit}</button>
            </form>
          )}
          {order.seller?.username && (
            <Link href={`/seller/${order.seller.username}`} className="text-sm text-[#7A1E2B] hover:underline">{t.seller.viewProfile}</Link>
          )}
        </div>
      )}

      {order.listing && (isBuyer || isSeller) && (
        <form action={openConversation}>
          <input type="hidden" name="listing" value={order.listing.id} />
          {isSeller && <input type="hidden" name="buyer" value={order.buyer_id} />}
          <button type="submit" className="border rounded-lg px-4 py-2 text-sm">
            💬 {isSeller ? o.messageBuyer : o.messageSeller}
          </button>
        </form>
      )}
    </main>
  );
}
