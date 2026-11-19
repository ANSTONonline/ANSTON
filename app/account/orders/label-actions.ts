"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireMember } from "@/lib/member";
import { serverSecret } from "@/lib/stripe";
import { buyLabel, carrierName, createShipment, getRate, labelsConfigured, toCents, type ShippoAddress } from "@/lib/shippo";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const text = (fd: FormData, key: string, max = 100) => String(fd.get(key) ?? "").trim().slice(0, max);
const num = (fd: FormData, key: string) => Number(String(fd.get(key) ?? "").trim());
const fail = (id: string, detail = "") =>
  redirect(`/account/orders/${id}?error=label${detail ? `&detail=${encodeURIComponent(detail.slice(0, 200))}` : ""}`);

type ShipTo = { name?: string | null; address?: Record<string, string | null> | null };

// Step 1: the seller enters where they ship from and the package; Anston asks
// Shippo for rates and remembers the shipment on the order.
export async function getLabelRates(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  if (!isId(id) || !labelsConfigured()) return;

  const from: ShippoAddress = {
    name: text(fd, "name"), street1: text(fd, "street1"), street2: text(fd, "street2"), city: text(fd, "city"),
    state: text(fd, "state", 30), zip: text(fd, "zip", 20), country: "US", phone: text(fd, "phone", 30),
  };
  const weightLb = num(fd, "lb") + num(fd, "oz") / 16;
  const parcel = { length: num(fd, "length"), width: num(fd, "width"), height: num(fd, "height"), weightLb };
  const sizes = [parcel.length, parcel.width, parcel.height, weightLb];
  if (!from.name || !from.street1 || !from.city || !from.state || !from.zip || !from.phone || sizes.some((n) => !Number.isFinite(n) || n <= 0 || n > 150)) {
    fail(id);
  }

  const { data: order } = await member.supabase.from("orders").select("ship_to, seller_id").eq("id", id).maybeSingle();
  const shipTo = order?.ship_to as ShipTo | null;
  if (!order || order.seller_id !== member.user.id || !shipTo?.address) fail(id);
  const a = shipTo!.address!;
  const to: ShippoAddress = {
    name: shipTo!.name || "Customer", street1: a.line1 ?? "", street2: a.line2 ?? "", city: a.city ?? "",
    state: a.state ?? "", zip: a.postal_code ?? "", country: a.country ?? "US",
  };

  // Remember the ship-from address for next time (only the seller can read it).
  await member.supabase.from("ship_from_addresses").upsert({ user_id: member.user.id, address: from, updated_at: new Date().toISOString() });

  let shipmentId = "";
  try {
    const shipment = await createShipment(from, to, parcel);
    shipmentId = shipment.object_id;
    if (!shipment.rates?.length) fail(id, shipment.messages?.map((m) => m.text).join(" ") ?? "");
  } catch (e) {
    unstable_rethrow(e);
    console.error("shippo shipment", e instanceof Error ? e.message : e);
    fail(id);
  }
  const { error } = await member.supabase.rpc("set_label_shipment", { p_order: id, p_shipment: shipmentId, p_secret: serverSecret() });
  if (error) {
    console.error("set_label_shipment", error.message);
    fail(id);
  }
  redirect(`/account/orders/${id}?label=rates`);
}

// Step 2: the seller picks a rate and buys the label. The rate must belong to
// this order's shipment; the database checks the cost fits the payout.
export async function buyShippingLabel(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  const rateId = text(fd, "rate");
  if (!isId(id) || !rateId || !labelsConfigured()) return;

  const { data: order } = await member.supabase.from("orders").select("shippo_shipment_id, seller_id").eq("id", id).maybeSingle();
  if (!order || order.seller_id !== member.user.id || !order.shippo_shipment_id) fail(id);

  let done = false;
  try {
    const rate = await getRate(rateId);
    if (rate.shipment !== order!.shippo_shipment_id || rate.currency.toUpperCase() !== "USD") fail(id);
    const cost = toCents(rate.amount);
    const { data: budget, error: budgetError } = await member.supabase.rpc("label_budget", { p_order: id });
    if (budgetError || typeof budget !== "number" || cost > budget) fail(id);

    const tx = await buyLabel(rate.object_id);
    if (tx.status !== "SUCCESS" || !tx.label_url) fail(id, tx.messages?.map((m) => m.text).join(" ") ?? "");
    const { error } = await member.supabase.rpc("record_label", {
      p_order: id,
      p_transaction: tx.object_id,
      p_carrier: carrierName(rate.provider),
      p_service: `${rate.provider} ${rate.servicelevel?.name ?? ""}`.trim(),
      p_tracking: tx.tracking_number ?? "",
      p_label_url: tx.label_url,
      p_cost_cents: cost,
      p_secret: serverSecret(),
    });
    if (error) throw new Error(error.message);
    done = true;
  } catch (e) {
    unstable_rethrow(e);
    console.error("buy label", e instanceof Error ? e.message : e);
  }
  revalidatePath(`/account/orders/${id}`);
  redirect(done ? `/account/orders/${id}?label=bought` : `/account/orders/${id}?error=label`);
}
