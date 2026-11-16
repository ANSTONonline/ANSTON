import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { formatPrice } from "@/lib/listings";
import { requireMember } from "@/lib/member";
import { ConfirmButton, LocalTime } from "../../../listing/[id]/listing-actions";
import { setSuspended } from "../../actions";
import AdminNav from "../../admin-nav";

export const metadata: Metadata = { title: "Member | ANSTON", robots: { index: false } };

type Params = Promise<{ id: string }>;

type Details = {
  id: string;
  username: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  is_admin: boolean;
  is_suspended: boolean;
  email_notifications: boolean;
  rating_avg: number;
  rating_count: number;
};

type ListingRef = { id: string; title: string; currency?: string } | null;
type OrderRow = { id: string; created_at: string; status: string; total_cents: number; currency: string; listing: ListingRef };

const section = "border rounded-xl p-5";
const empty = <p className="text-sm text-gray-500">None yet.</p>;

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className={section}>
      <h2 className="font-semibold mb-3">
        {title}
        {count !== undefined && <span className="ms-2 text-sm text-gray-500 font-normal">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

function ListingLink({ listing }: { listing: ListingRef }) {
  return listing ? (
    <Link href={`/listing/${listing.id}`} className="text-[#7A1E2B] hover:underline break-words">{listing.title}</Link>
  ) : (
    <span className="text-gray-500">Deleted listing</span>
  );
}

function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "red" | "green" }) {
  const tones = { gray: "bg-gray-100 text-gray-700", red: "bg-red-100 text-red-800", green: "bg-green-100 text-green-800" };
  return <span className={`text-xs rounded px-1.5 py-0.5 whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 border-b last:border-0 text-sm">
      <dt className="w-36 shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function MemberPage({ params }: { params: Params }) {
  const admin = await requireMember();
  const supabase = admin.supabase;
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", admin.user.id).maybeSingle();
  if (!me?.is_admin) notFound();

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: detailRows, error } = await supabase.rpc("admin_member", { p_id: id });
  if (error) console.error("admin_member", error.message);
  const m = (detailRows as Details[] | null)?.[0];
  if (!m) notFound();
  const locale = await getLocale();
  const time = (iso: string | null, withTime = true) =>
    iso ? <LocalTime iso={iso} locale={locale} withTime={withTime} /> : "—";

  const orderSelect = "id, created_at, status, total_cents, currency, listing:listings ( id, title )";
  const [listings, purchases, sales, offers, bids, bookings, chats, reportsFiled, reportsAgainst] = await Promise.all([
    supabase.from("listings").select("id, title, status, created_at").eq("seller_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("orders").select(orderSelect).eq("buyer_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("orders").select(orderSelect).eq("seller_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("offers").select("id, amount_cents, status, created_at, listing:listings ( id, title, currency )").eq("buyer_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("bids").select("id, amount_cents, created_at, listing:listings ( id, title, currency )").eq("bidder_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("reservations").select("id, mode, status, created_at, listing:listings ( id, title )").eq("renter_id", id).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("conversations")
      .select("id, last_message_at, buyer_id, listing:listings ( id, title ), buyer:profiles!conversations_buyer_id_fkey ( username ), seller:profiles!conversations_seller_id_fkey ( username )")
      .or(`buyer_id.eq.${id},seller_id.eq.${id}`)
      .order("last_message_at", { ascending: false })
      .limit(50),
    supabase.from("reports").select("id, reason, status, created_at, listing:listings ( id, title )").eq("reporter_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("reports").select("id, reason, status, created_at, listing:listings!inner ( id, title, seller_id )").eq("listing.seller_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  for (const r of [listings, purchases, sales, offers, bids, bookings, chats, reportsFiled, reportsAgainst]) {
    if (r.error) console.error("admin member page", r.error.message);
  }

  type Offer = { id: string; amount_cents: number; status: string; created_at: string; listing: ListingRef };
  type Bid = { id: string; amount_cents: number; created_at: string; listing: ListingRef };
  type Booking = { id: string; mode: string; status: string; created_at: string; listing: ListingRef };
  type Chat = { id: string; last_message_at: string; buyer_id: string; listing: ListingRef; buyer: { username: string | null } | null; seller: { username: string | null } | null };
  type Report = { id: string; reason: string; status: string; created_at: string; listing: ListingRef };
  const L = (listings.data ?? []) as { id: string; title: string; status: string; created_at: string }[];
  const P = (purchases.data ?? []) as unknown as OrderRow[];
  const S = (sales.data ?? []) as unknown as OrderRow[];
  const O = (offers.data ?? []) as unknown as Offer[];
  const B = (bids.data ?? []) as unknown as Bid[];
  const R = (bookings.data ?? []) as unknown as Booking[];
  const C = (chats.data ?? []) as unknown as Chat[];
  const RF = (reportsFiled.data ?? []) as unknown as Report[];
  const RA = (reportsAgainst.data ?? []) as unknown as Report[];
  const location = [m.city, m.region, m.country_code].filter(Boolean).join(", ");

  const orderList = (rows: OrderRow[]) =>
    rows.length === 0 ? empty : (
      <ul className="divide-y text-sm">
        {rows.map((o) => (
          <li key={o.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <ListingLink listing={o.listing} />
            <span>{formatPrice(o.total_cents, o.currency)}</span>
            <Pill>{o.status.replace("_", " ")}</Pill>
            <span className="text-gray-500">{time(o.created_at, false)}</span>
            <Link href={`/account/orders/${o.id}`} className="text-xs underline ms-auto">Order details</Link>
          </li>
        ))}
      </ul>
    );

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full" dir="ltr">
      <AdminNav current="members" />
      <Link href="/admin/members" className="text-sm text-gray-600 hover:underline">← All members</Link>

      <div className="flex flex-wrap items-center gap-3 mt-3 mb-6">
        <span className="w-12 h-12 rounded-full bg-[#7A1E2B] text-white flex items-center justify-center text-xl font-bold">
          {(m.username ?? "?").charAt(0).toUpperCase()}
        </span>
        <h1 className="text-3xl font-bold">{m.username ? `@${m.username}` : "(no username yet)"}</h1>
        {m.is_admin && <Pill>admin</Pill>}
        {m.is_suspended ? <Pill tone="red">suspended</Pill> : <Pill tone="green">active</Pill>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Account">
          <dl>
            <Row label="Email">{m.email ? <a href={`mailto:${m.email}`} className="underline">{m.email}</a> : "—"}</Row>
            <Row label="Phone">{m.phone ? <a href={`tel:+${m.phone.replace(/^\+/, "")}`} className="underline">+{m.phone.replace(/^\+/, "")}</a> : "—"}</Row>
            <Row label="Signs in with">{m.provider === "google" ? "Google" : m.provider === "phone" ? "Phone" : "Email and password"}</Row>
            <Row label="Email confirmed">{time(m.email_confirmed_at)}</Row>
            <Row label="Joined">{time(m.created_at)}</Row>
            <Row label="Last sign-in">{time(m.last_sign_in_at)}</Row>
            <Row label="Location">{location || "—"}</Row>
            <Row label="Rating">{m.rating_count ? `${Number(m.rating_avg).toFixed(1)} ★ (${m.rating_count})` : "No reviews yet"}</Row>
            <Row label="Activity emails">{m.email_notifications ? "On" : "Off"}</Row>
            <Row label="Member ID"><code className="text-xs">{m.id}</code></Row>
          </dl>
          {!m.is_admin && m.id !== admin.user.id && (
            <form action={setSuspended} className="mt-4">
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="suspended" value={m.is_suspended ? "false" : "true"} />
              <ConfirmButton
                message={m.is_suspended
                  ? `Lift the suspension on @${m.username}?`
                  : `Suspend @${m.username}? They won't be able to post, bid, offer, book or message.`}
                className={m.is_suspended ? "border rounded-lg px-3 py-1.5 text-sm" : "border border-red-300 text-red-700 rounded-lg px-3 py-1.5 text-sm"}
              >
                {m.is_suspended ? "Lift suspension" : "Suspend account"}
              </ConfirmButton>
            </form>
          )}
        </Section>

        <Section title="Listings" count={L.length}>
          {L.length === 0 ? empty : (
            <ul className="divide-y text-sm">
              {L.map((l) => (
                <li key={l.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListingLink listing={l} />
                  <Pill tone={l.status === "removed" ? "red" : l.status === "active" ? "green" : "gray"}>{l.status}</Pill>
                  <span className="text-gray-500 ms-auto">{time(l.created_at, false)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Purchases" count={P.length}>{orderList(P)}</Section>
        <Section title="Sales" count={S.length}>{orderList(S)}</Section>

        <Section title="Offers made" count={O.length}>
          {O.length === 0 ? empty : (
            <ul className="divide-y text-sm">
              {O.map((o) => (
                <li key={o.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListingLink listing={o.listing} />
                  <span>{formatPrice(o.amount_cents, o.listing?.currency ?? "USD")}</span>
                  <Pill>{o.status}</Pill>
                  <span className="text-gray-500 ms-auto">{time(o.created_at, false)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Bids" count={B.length}>
          {B.length === 0 ? empty : (
            <ul className="divide-y text-sm">
              {B.map((b) => (
                <li key={b.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListingLink listing={b.listing} />
                  <span>{formatPrice(b.amount_cents, b.listing?.currency ?? "USD")}</span>
                  <span className="text-gray-500 ms-auto">{time(b.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Bookings and rentals" count={R.length}>
          {R.length === 0 ? empty : (
            <ul className="divide-y text-sm">
              {R.map((r) => (
                <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListingLink listing={r.listing} />
                  <Pill>{r.mode}</Pill>
                  <Pill>{r.status}</Pill>
                  <span className="text-gray-500 ms-auto">{time(r.created_at, false)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Chats" count={C.length}>
          {C.length === 0 ? empty : (
            <ul className="divide-y text-sm">
              {C.map((c) => {
                const other = c.buyer_id === m.id ? c.seller : c.buyer;
                return (
                  <li key={c.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>with {other?.username ? `@${other.username}` : "a deleted account"}</span>
                    <span className="text-gray-500">about</span>
                    <ListingLink listing={c.listing} />
                    <span className="text-gray-500 ms-auto">last message {time(c.last_message_at, false)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-gray-500 mt-2">Message text is private and isn&apos;t shown here.</p>
        </Section>

        <Section title="Reports on their listings" count={RA.length}>
          {RA.length === 0 ? empty : (
            <ul className="divide-y text-sm">
              {RA.map((r) => (
                <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListingLink listing={r.listing} />
                  <Pill tone="red">{r.reason.replace(/_/g, " ")}</Pill>
                  <Pill>{r.status}</Pill>
                  <span className="text-gray-500 ms-auto">{time(r.created_at, false)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Reports they filed" count={RF.length}>
          {RF.length === 0 ? empty : (
            <ul className="divide-y text-sm">
              {RF.map((r) => (
                <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <ListingLink listing={r.listing} />
                  <Pill>{r.reason.replace(/_/g, " ")}</Pill>
                  <Pill>{r.status}</Pill>
                  <span className="text-gray-500 ms-auto">{time(r.created_at, false)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
