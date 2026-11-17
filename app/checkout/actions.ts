"use server";

import { redirect } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { paymentsConfigured, readyAccount, serverSecret, siteUrl, stripe } from "@/lib/stripe";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

// Stripe Checkout supports these page languages; others fall back to automatic.
const STRIPE_LOCALES = new Set(["ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fil", "fr", "he", "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "ms", "mt", "nb", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "th", "tr", "vi", "zh"]);

const ERRORS: Record<string, string> = {
  seller_not_ready: "seller",
  sold_out: "soldout",
  listing_unavailable: "unavailable",
  own_listing: "own",
  offer_not_accepted: "offer",
  not_for_sale: "unavailable",
  account_suspended: "suspended",
};

// "Buy now" (or "Pay now" for an accepted offer): create the order in the
// database, then send the buyer to Stripe Checkout on the seller's account.
export async function startCheckout(fd: FormData) {
  const member = await requireMember();
  const listingId = String(fd.get("listing") ?? "");
  const offerId = String(fd.get("offer") ?? "");
  if (!isId(listingId) || (offerId && !isId(offerId))) return;
  const back = `/listing/${listingId}`;
  if (!paymentsConfigured()) redirect(`${back}?pay=setup`);

  const { data, error } = await member.supabase.rpc("start_order", {
    p_listing: listingId,
    p_offer: offerId || null,
  });
  if (error) {
    const code = Object.keys(ERRORS).find((k) => error.message.includes(k));
    if (!code) console.error("start_order", error.message);
    redirect(`${back}?pay=${code ? ERRORS[code] : "error"}`);
  }
  const order = (data as {
    order_id: string; stripe_account_id: string; title: string; currency: string;
    subtotal_cents: number; shipping_cents: number; platform_fee_cents: number; ships: boolean;
  }[])[0];

  let url = "";
  try {
    // Double-check with Stripe that the seller's account can take payments.
    const { data: seller } = await member.supabase.from("orders").select("seller_id").eq("id", order.order_id).single();
    const status = await readyAccount(order.stripe_account_id, seller!.seller_id);
    if (!status.belongsToMember || !status.chargesEnabled) redirect(`${back}?pay=seller`);

    const currency = order.currency.toLowerCase();
    const locale = await getLocale();
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: order.order_id,
        customer_email: member.user.email ?? undefined,
        locale: (STRIPE_LOCALES.has(locale) ? locale : "auto") as "auto",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: order.subtotal_cents,
              product_data: { name: order.title.slice(0, 250) },
            },
          },
        ],
        ...(order.ships
          ? {
              shipping_address_collection: { allowed_countries: [status.account.country as "US"].filter(Boolean) },
              shipping_options: [
                {
                  shipping_rate_data: {
                    type: "fixed_amount",
                    display_name: order.shipping_cents > 0 ? "Shipping" : "Free shipping",
                    fixed_amount: { amount: order.shipping_cents, currency },
                  },
                },
              ],
            }
          : {}),
        payment_intent_data: {
          ...(order.platform_fee_cents > 0 ? { application_fee_amount: order.platform_fee_cents } : {}),
          metadata: { anston_order_id: order.order_id },
        },
        metadata: { anston_order_id: order.order_id },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${siteUrl()}/account/orders/${order.order_id}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl()}${back}?pay=cancelled`,
      },
      { stripeAccount: order.stripe_account_id },
    );
    const { error: attachError } = await member.supabase.rpc("attach_checkout_session", {
      p_order: order.order_id,
      p_session: session.id,
      p_secret: serverSecret(),
    });
    if (attachError) throw new Error(attachError.message);
    url = session.url ?? "";
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // a redirect above
    console.error("startCheckout", e instanceof Error ? e.message : e);
  }
  redirect(url || `${back}?pay=error`);
}
