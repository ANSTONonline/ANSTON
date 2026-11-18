// Buyer service fee, by item price (same rule as the database's
// buyer_fee_bps): 7% under 50.00, 5% from 50.00 to 500.00, 3% above.
export function buyerFeeBps(priceCents: number) {
  if (priceCents < 5000) return 700;
  if (priceCents <= 50000) return 500;
  return 300;
}

export function buyerFeeCents(priceCents: number) {
  return Math.round((priceCents * buyerFeeBps(priceCents)) / 10000);
}

// Anston stores every price in hundredths (cents). Stripe wants the
// currency's smallest unit: yen has no decimals, the Kuwaiti dinar has three.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "PYG", "UGX", "XAF", "XOF"]);
const THREE_DECIMAL = new Set(["KWD", "BHD", "JOD", "OMR", "TND"]);

export function toStripeAmount(cents: number, currency: string) {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return Math.round(cents / 100);
  if (THREE_DECIMAL.has(c)) return Math.round(cents) * 10;
  return Math.round(cents);
}
