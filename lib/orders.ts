// Shipping carriers sellers can pick, and links to each carrier's own
// tracking page. Only these known sites are ever linked.
export const CARRIERS = ["USPS", "UPS", "FedEx", "DHL", "Other"] as const;

export function trackingUrl(carrier: string | null, tracking: string | null): string | null {
  if (!carrier || !tracking) return null;
  const n = encodeURIComponent(tracking.trim());
  switch (carrier) {
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "UPS":
      return `https://www.ups.com/track?tracknum=${n}`;
    case "FedEx":
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "DHL":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}&submit=1`;
    default:
      return null;
  }
}

export type OrderStatus = "pending_payment" | "paid" | "fulfilled" | "completed" | "cancelled" | "refunded" | "disputed";

// Shipped items go Ordered → Paid → Shipped → Delivered. Rentals and
// bookings have nothing to ship, so they go Ordered → Paid → Completed.
export function orderSteps(mode: string, status: OrderStatus) {
  const ships = mode === "sale" || mode === "auction";
  const keys = ships ? (["ordered", "paid", "shipped", "delivered"] as const) : (["ordered", "paid", "completed"] as const);
  const reached = { pending_payment: 1, paid: 2, fulfilled: 3, completed: ships ? 4 : 3, cancelled: 1, refunded: 2, disputed: 2 }[status] ?? 1;
  return { ships, steps: keys.map((key, i) => ({ key, done: i < reached })) };
}
