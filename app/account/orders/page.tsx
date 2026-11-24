import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatPrice } from "@/lib/listings";
import { requireMember } from "@/lib/member";
import type { OrderStatus } from "@/lib/orders";
import { LocalTime } from "../../listing/[id]/listing-actions";
import { StatusBadge } from "./status-badge";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type OrderRow = {
  id: string;
  created_at: string;
  status: OrderStatus;
  total_cents: number;
  currency: string;
  ship_to: unknown;
  tracking_number: string | null;
  listing: { id: string; title: string } | null;
};

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const o = t.orders;
  const view = (await searchParams).view === "sales" ? "sales" : "purchases";

  const { data, error } = await member.supabase
    .from("orders")
    .select("id, created_at, status, total_cents, currency, ship_to, tracking_number, listing:listings ( id, title )")
    .eq(view === "sales" ? "seller_id" : "buyer_id", member.user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("orders", error.message);
  const orders = (data ?? []) as unknown as OrderRow[];

  const tab = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm ${active ? "bg-[#7A1E2B] text-white" : "border"}`;

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{o.title}</h1>
      <div className="flex gap-2 mb-6">
        <Link href="/account/orders" className={tab(view === "purchases")}>{o.purchases}</Link>
        <Link href="/account/orders?view=sales" className={tab(view === "sales")}>{o.sales}</Link>
      </div>

      {orders.length === 0 ? (
        <div className="border rounded-xl p-6 text-center">
          <p className="font-medium">{view === "sales" ? o.emptySales : o.emptyPurchases}</p>
          <p className="text-sm text-gray-500 mt-1">{o.emptyNote}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/account/orders/${order.id}`} className="block border rounded-xl p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium break-words">{order.listing?.title ?? "—"}</p>
                  <StatusBadge status={order.status} label={o.status[order.status]} />
                </div>
                <div className="flex justify-between text-sm text-gray-600 mt-2">
                  <span>{o.placed.split("{date}")[0]}<LocalTime iso={order.created_at} locale={locale} withTime={false} />{o.placed.split("{date}")[1]}</span>
                  <span className="font-medium text-gray-900" dir="ltr">{formatPrice(order.total_cents, order.currency)}</span>
                </div>
              </Link>
              {view === "sales" && order.status === "paid" && Boolean(order.ship_to) && !order.tracking_number && (
                <Link href={`/account/orders/${order.id}#ship-label`} className="inline-block mt-2 bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm font-medium">
                  {t.dashboard.buyLabel}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href="/account" className="inline-block mt-6 text-sm text-[#7A1E2B] hover:underline">{t.account.title}</Link>
    </main>
  );
}
