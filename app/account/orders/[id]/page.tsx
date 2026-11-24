import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatPrice } from "@/lib/listings";
import { requireMember } from "@/lib/member";
import { CARRIERS, orderSteps, trackingUrl, type OrderStatus } from "@/lib/orders";
import { ConfirmButton, LocalTime } from "../../../listing/[id]/listing-actions";
import { openConversation } from "../../../messages/actions";
import { approveRefund, confirmReceived, declineRefund, leaveReview, markShipped, requestRefund } from "../actions";
import StarPicker from "./star-picker";
import { StatusBadge } from "../status-badge";
import { recordPayment } from "@/lib/checkout";
import { paymentsConfigured } from "@/lib/stripe";
import { getShipment, labelsConfigured, toCents, type Rate } from "@/lib/shippo";
import { buyShippingLabel, getLabelRates } from "../label-actions";

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
  payout_status: "none" | "held" | "sent" | "refunded";
  shippo_shipment_id: string | null;
  label_url: string | null;
  label_service: string | null;
  label_cost_cents: number;
  stripe_checkout_session_id: string | null;
  buyer_id: string;
  seller_id: string;
  listing: { id: string; title: string } | null;
  buyer: { username: string | null } | null;
  seller: { username: string | null } | null;
};

// Is this moment still before the given time? (Checked once per request.)
function stillBefore(iso: string) {
  return Date.now() < new Date(iso).getTime();
}

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
       ship_to, payout_status, stripe_checkout_session_id, shippo_shipment_id, label_url, label_service, label_cost_cents,
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
  if (sessionId && order.status === "pending_payment" && order.buyer_id === member.user.id
      && sessionId === order.stripe_checkout_session_id && paymentsConfigured()) {
    try {
      if (await recordPayment(member.supabase, order.id, sessionId)) {
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
  const isAdmin = Boolean(member.profile?.is_admin);

  // Refunds: buyers can ask within 7 days of paying; sellers' money is sent
  // 7 days after the purchase unless a request is open.
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const refundUntil = order.paid_at ? new Date(new Date(order.paid_at).getTime() + WEEK).toISOString() : null;
  const { data: refundRow } = await member.supabase
    .from("refund_requests")
    .select("id, reason, details, status")
    .eq("order_id", order.id)
    .maybeSingle();
  const refund = refundRow as { id: string; reason: keyof typeof o.refundReasons; details: string; status: "open" | "approved" | "declined" } | null;
  const canRequestRefund = isBuyer && !refund && refundUntil && stillBefore(refundUntil)
    && ["paid", "fulfilled", "completed"].includes(order.status) && order.payout_status !== "sent";
  // Shipping labels: for paid orders that ship, while the seller's money is
  // still held (the label's cost comes out of it).
  const L = o.label;
  const canBuyLabel = isSeller && labelsConfigured() && order.status === "paid" && Boolean(order.ship_to?.address)
    && !order.label_url && order.payout_status === "held" && order.currency.toLowerCase() === "usd" && !refund;
  type From = { name?: string; street1?: string; street2?: string; city?: string; state?: string; zip?: string; phone?: string };
  let shipFrom: From = {};
  let rates: Rate[] = [];
  let ratesError = false;
  if (canBuyLabel) {
    const { data: saved } = await member.supabase.from("ship_from_addresses").select("address").eq("user_id", member.user.id).maybeSingle();
    shipFrom = (saved?.address as From) ?? {};
    if (flags.label === "rates" && order.shippo_shipment_id) {
      try {
        const { data: budget } = await member.supabase.rpc("label_budget", { p_order: order.id });
        const shipment = await getShipment(order.shippo_shipment_id);
        rates = (shipment.rates ?? [])
          .filter((r) => r.currency.toUpperCase() === "USD" && (typeof budget !== "number" || toCents(r.amount) <= budget))
          .sort((a, b) => Number(a.amount) - Number(b.amount));
      } catch (e) {
        console.error("shippo rates", e instanceof Error ? e.message : e);
        ratesError = true;
      }
    }
  }
  let sellerReady = false;
  if (isSeller && order.payout_status === "held") {
    const { data: acct } = await member.supabase.from("payout_accounts").select("charges_enabled").eq("user_id", member.user.id).maybeSingle();
    sellerReady = Boolean(acct?.charges_enabled);
  }
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
      {isSeller && order.payout_status === "held" && !sellerReady && (
        <Link href="/account/payouts" className="block mb-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm hover:bg-amber-100">
          💰 {o.payoutHeld} <span className="underline font-medium">{t.payouts.title}</span>
        </Link>
      )}
      {isSeller && order.payout_status === "held" && sellerReady && refundUntil && refund?.status !== "open" && (
        <p className="mb-4 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-sm">💰 {dated(o.payoutOn, refundUntil)}</p>
      )}
      {flags.refund === "requested" && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{o.refundSent}</p>}
      {flags.refund === "approved" && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{o.refundDone}</p>}
      {flags.refund === "declined" && <p role="status" className="mb-4 bg-gray-50 border border-gray-200 text-gray-800 rounded-lg p-3 text-sm">{o.refundClosed}</p>}

      {/* Refund request: what the buyer sees */}
      {isBuyer && refund && (
        <p className={`mb-4 rounded-lg p-3 text-sm border ${refund.status === "approved" ? "bg-green-50 border-green-200 text-green-800" : refund.status === "declined" ? "bg-gray-50 border-gray-200 text-gray-800" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
          ↩️ {refund.status === "open" ? o.refundRequested : refund.status === "approved" ? o.refundApproved : o.refundDeclined}
        </p>
      )}
      {/* Refund request: the seller (or an admin) decides */}
      {(isSeller || isAdmin) && refund?.status === "open" && (
        <section className="mb-6 border-2 border-amber-300 bg-amber-50 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-amber-900">↩️ {o.refundSellerTitle}</h2>
          <p className="text-sm"><span className="font-medium">{o.refundReason}:</span> {o.refundReasons[refund.reason]}</p>
          {refund.details && <p className="text-sm text-gray-700 whitespace-pre-line">{refund.details}</p>}
          <p className="text-xs text-gray-600">{o.refundNote}</p>
          <div className="flex flex-wrap gap-2">
            <form action={approveRefund}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="request" value={refund.id} />
              <ConfirmButton message={o.refundApproveAsk} className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm font-medium">
                {o.refundApprove}
              </ConfirmButton>
            </form>
            <form action={declineRefund}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="request" value={refund.id} />
              <button type="submit" className="border rounded-lg px-4 py-2 text-sm bg-white">{o.refundDecline}</button>
            </form>
          </div>
        </section>
      )}
      {isSeller && order.payout_status === "sent" && (
        <p className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">💸 {o.payoutSent}</p>
      )}
      {flags.shipped && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{o.shippedSaved}</p>}
      {flags.received && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{o.receivedSaved}</p>}
      {flags.reviewed && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{r.thanks}</p>}
      {flags.error && (
        <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {flags.error === "window" ? o.refundWindowClosed : flags.error === "label" ? L.error : o.error}
          {flags.error === "label" && typeof flags.detail === "string" && <span className="block mt-1 text-xs">{flags.detail}</span>}
        </p>
      )}
      {flags.label === "bought" && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">🏷️ {L.bought}</p>}

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

        {isSeller && order.label_url && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-sm">🏷️ {L.labelInfo.replace("{service}", order.label_service ?? "").replace("{price}", formatPrice(order.label_cost_cents, "USD"))}</p>
            <a href={order.label_url} target="_blank" rel="noopener noreferrer" className="inline-block bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm">🖨️ {L.print} ↗</a>
            <p className="text-xs text-gray-500">{L.costNote}</p>
          </div>
        )}

        {canBuyLabel && (
          <div id="ship-label" className="border-t pt-4 space-y-3 scroll-mt-24">
            <h3 className="font-semibold">📦 {L.title}</h3>
            <p className="text-sm text-gray-600">{L.intro}</p>
            {flags.label === "rates" && order.shippo_shipment_id && !ratesError ? (
              rates.length > 0 ? (
                <form action={buyShippingLabel} className="space-y-2">
                  <input type="hidden" name="id" value={order.id} />
                  <p className="text-sm font-medium">{L.chooseRate}</p>
                  {rates.map((r, i) => (
                    <label key={r.object_id} className="flex items-center gap-3 border rounded-lg p-3 text-sm cursor-pointer has-[:checked]:border-[#7A1E2B] has-[:checked]:bg-[#7A1E2B]/5">
                      <input type="radio" name="rate" value={r.object_id} defaultChecked={i === 0} required />
                      <span className="flex-1">
                        <span className="font-medium">{r.provider}</span> · {r.servicelevel?.name}
                        {r.estimated_days ? <span className="block text-xs text-gray-500">{L.days.replace("{n}", String(r.estimated_days))}</span> : null}
                      </span>
                      <span className="font-semibold">{formatPrice(toCents(r.amount), "USD")}</span>
                    </label>
                  ))}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <ConfirmButton message={L.buyAsk} className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm font-medium">{L.buy}</ConfirmButton>
                    <Link href={`/account/orders/${order.id}`} className="text-sm text-[#7A1E2B] hover:underline">{L.change}</Link>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-amber-800">{L.noRates} <Link href={`/account/orders/${order.id}`} className="underline">{L.change}</Link></p>
              )
            ) : (
              <form action={getLabelRates} className="space-y-3">
                <input type="hidden" name="id" value={order.id} />
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{L.from}</legend>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <label className="text-sm">{L.name}<input name="name" required maxLength={100} defaultValue={shipFrom.name ?? ""} autoComplete="name" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm">{L.phone}<input name="phone" type="tel" required maxLength={30} defaultValue={shipFrom.phone ?? ""} autoComplete="tel" dir="ltr" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm sm:col-span-2">{L.street}<input name="street1" required maxLength={100} defaultValue={shipFrom.street1 ?? ""} autoComplete="address-line1" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm sm:col-span-2">{L.street2}<input name="street2" maxLength={100} defaultValue={shipFrom.street2 ?? ""} autoComplete="address-line2" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm">{L.city}<input name="city" required maxLength={100} defaultValue={shipFrom.city ?? ""} autoComplete="address-level2" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-sm">{L.state}<input name="state" required maxLength={30} defaultValue={shipFrom.state ?? ""} autoComplete="address-level1" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                      <label className="text-sm">{L.zip}<input name="zip" required maxLength={20} defaultValue={shipFrom.zip ?? ""} autoComplete="postal-code" dir="ltr" className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    </div>
                  </div>
                </fieldset>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{L.package}</legend>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <label className="text-sm">{L.lb}<input name="lb" type="number" min="0" max="150" step="1" defaultValue="0" required className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm">{L.oz}<input name="oz" type="number" min="0" max="15.9" step="0.1" defaultValue="8" required className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm">{L.length}<input name="length" type="number" min="0.1" max="150" step="0.1" required className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm">{L.width}<input name="width" type="number" min="0.1" max="150" step="0.1" required className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                    <label className="text-sm">{L.height}<input name="height" type="number" min="0.1" max="150" step="0.1" required className="mt-1 w-full border rounded-lg px-3 py-2" /></label>
                  </div>
                </fieldset>
                <button type="submit" className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm font-medium">{L.seeRates}</button>
              </form>
            )}
            <p className="text-xs text-gray-500 pt-2">{L.or}</p>
          </div>
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

      {canRequestRefund && refundUntil && (
        <details className="mb-6 border rounded-xl p-5">
          <summary className="font-semibold cursor-pointer">↩️ {o.refundTitle}</summary>
          <form action={requestRefund} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={order.id} />
            <p className="text-sm text-gray-600">{dated(o.refundUntil, refundUntil)}</p>
            <label className="block text-sm">
              <span className="block font-medium mb-1">{o.refundReason}</span>
              <select name="reason" required className="w-full border rounded-lg px-3 py-2 bg-white">
                {(Object.keys(o.refundReasons) as (keyof typeof o.refundReasons)[]).map((k) => (
                  <option key={k} value={k}>{o.refundReasons[k]}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block font-medium mb-1">{o.refundDetails}</span>
              <textarea name="details" rows={3} maxLength={1000} className="w-full border rounded-lg px-3 py-2" />
            </label>
            <button type="submit" className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm font-medium">{o.refundSubmit}</button>
          </form>
        </details>
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
