import "server-only";

// Shippo: shipping rates and labels for USPS, UPS, FedEx and more.
// SHIPPO_API_KEY lives only in Vercel. SHIPPO_API_BASE is for local tests.
const BASE = () => process.env.SHIPPO_API_BASE || "https://api.goshippo.com";

export function labelsConfigured() {
  return Boolean(process.env.SHIPPO_API_KEY);
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shippo ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as T;
}

export type ShippoAddress = {
  name: string; street1: string; street2?: string; city: string; state: string; zip: string; country: string;
  phone?: string; email?: string;
};
export type Parcel = { length: number; width: number; height: number; weightLb: number };
export type Rate = {
  object_id: string; amount: string; currency: string; provider: string; shipment: string;
  servicelevel: { name: string; token: string }; estimated_days: number | null; duration_terms?: string;
};
type Shipment = { object_id: string; rates: Rate[]; messages?: { text: string }[] };
type Transaction = {
  object_id: string; status: string; tracking_number: string; label_url: string; messages?: { text: string }[];
};

export async function createShipment(from: ShippoAddress, to: ShippoAddress, parcel: Parcel) {
  return call<Shipment>("/shipments/", {
    method: "POST",
    body: {
      address_from: from,
      address_to: to,
      parcels: [{
        length: String(parcel.length), width: String(parcel.width), height: String(parcel.height), distance_unit: "in",
        weight: String(parcel.weightLb), mass_unit: "lb",
      }],
      async: false,
    },
  });
}

export const getShipment = (id: string) => call<Shipment>(`/shipments/${encodeURIComponent(id)}`);
export const getRate = (id: string) => call<Rate>(`/rates/${encodeURIComponent(id)}`);

export async function buyLabel(rateId: string) {
  return call<Transaction>("/transactions/", {
    method: "POST",
    body: { rate: rateId, label_file_type: "PDF_4x6", async: false },
  });
}

// Shippo's carrier names → the carriers Anston links tracking for.
export function carrierName(provider: string) {
  const p = provider.toLowerCase();
  if (p.includes("usps")) return "USPS";
  if (p.includes("ups")) return "UPS";
  if (p.includes("fedex")) return "FedEx";
  if (p.includes("dhl")) return "DHL";
  return "Other";
}

// "12.34" (dollars) → 1234 cents.
export const toCents = (amount: string) => Math.round(Number(amount) * 100);
