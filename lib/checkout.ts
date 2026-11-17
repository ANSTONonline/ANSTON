import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverSecret, stripe } from "@/lib/stripe";

// Record a finished Stripe Checkout payment on its order. Used by the order
// page when the buyer comes back, and by the Stripe webhook. Safe to repeat.
export async function recordPayment(
  supabase: SupabaseClient,
  orderId: string,
  sessionId: string,
  stripeAccount: string,
) {
  const session = await stripe().checkout.sessions.retrieve(sessionId, {}, { stripeAccount });
  return recordSession(supabase, orderId, session);
}

export async function recordSession(supabase: SupabaseClient, orderId: string, session: Stripe.Checkout.Session) {
  if (session.metadata?.anston_order_id !== orderId || session.payment_status !== "paid") return false;
  const shipping = session.collected_information?.shipping_details ?? null;
  const shipTo = shipping
    ? { name: shipping.name, address: shipping.address }
    : null;
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const { data, error } = await supabase.rpc("mark_order_paid", {
    p_order: orderId,
    p_session: session.id,
    p_payment_intent: paymentIntent,
    p_ship_to: shipTo,
    p_secret: serverSecret(),
  });
  if (error) {
    console.error("mark_order_paid", error.message);
    return false;
  }
  return Boolean(data);
}
