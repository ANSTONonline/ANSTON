import type Stripe from "stripe";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { recordSession } from "@/lib/checkout";
import { stripe } from "@/lib/stripe";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/server";

// Stripe tells us here when a Checkout payment finishes or a seller's account
// changes, so payments are recorded even if the buyer closes the tab.
// Set up in Stripe as a Connect webhook pointing to /api/stripe/webhook,
// with its signing secret in Vercel as STRIPE_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  const supabase = createPlainClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.anston_order_id;
      if (orderId) await recordSession(supabase, orderId, session);
    }
  } catch (e) {
    console.error("stripe webhook", e instanceof Error ? e.message : e);
    return new Response("Error", { status: 500 }); // Stripe will retry
  }
  return Response.json({ received: true });
}
