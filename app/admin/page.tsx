import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { ConfirmButton, LocalTime } from "../listing/[id]/listing-actions";
import { resolveReport, restoreListing, setSuspended } from "./actions";
import AdminNav from "./admin-nav";

// Admin-only page for reviewing reported listings. Kept in English: only the
// Anston team sees it.
export const metadata: Metadata = { title: "Reports | ANSTON", robots: { index: false } };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type ReportRow = {
  id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  listing_id: string | null;
  reporter: { username: string | null } | null;
  listing: {
    id: string;
    title: string;
    status: string;
    seller_id: string;
    seller: { username: string | null; is_suspended: boolean } | null;
  } | null;
};

const btn = "border rounded-lg px-3 py-1.5 text-sm bg-white";
const danger = "border border-red-300 text-red-700 rounded-lg px-3 py-1.5 text-sm bg-white";

function OutcomeButton({ id, outcome, label, confirm, className }: {
  id: string;
  outcome: "dismiss" | "hold" | "remove" | "suspend";
  label: string;
  confirm?: string;
  className: string;
}) {
  return (
    <form action={resolveReport}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="outcome" value={outcome} />
      {confirm ? (
        <ConfirmButton message={confirm} className={className}>{label}</ConfirmButton>
      ) : (
        <button type="submit" className={className}>{label}</button>
      )}
    </form>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const { data: me } = await member.supabase.from("profiles").select("is_admin").eq("id", member.user.id).maybeSingle();
  if (!me?.is_admin) notFound();

  const locale = await getLocale();
  const t = await getDictionary(locale);
  const reasons = t.listing.reasons as Record<string, string>;
  const view = (await searchParams).view === "closed" ? "closed" : "open";

  const { data, error } = await member.supabase
    .from("reports")
    .select(
      `id, reason, details, status, created_at, resolved_at, listing_id,
       reporter:profiles!reports_reporter_id_fkey ( username ),
       listing:listings ( id, title, status, seller_id,
         seller:profiles!listings_seller_id_fkey ( username, is_suspended ) )`,
    )
    .in("status", view === "open" ? ["open", "reviewing"] : ["actioned", "dismissed"])
    .order("created_at", { ascending: view === "open" })
    .limit(200);
  if (error) console.error("admin reports", error.message);
  const reports = (data ?? []) as unknown as ReportRow[];

  const { count: openCount } = await member.supabase
    .from("reports")
    .select("id", { count: "exact", head: true })
    .in("status", ["open", "reviewing"]);

  const tab = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm ${active ? "bg-[#7A1E2B] text-white" : "border"}`;

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-4xl mx-auto w-full" dir="ltr">
      <AdminNav current="reports" />
      <h1 className="text-3xl font-bold mb-2">Reports</h1>
      <p className="text-gray-600 mb-6">
        Listings people flagged. Suspending a listing hides it while you look into it; removing it is for good. Either one closes all its reports.
        Suspending also removes all of the seller&apos;s listings and stops them from bidding, offering or messaging.
      </p>
      <div className="flex gap-2 mb-6">
        <Link href="/admin" className={tab(view === "open")}>Open ({openCount ?? 0})</Link>
        <Link href="/admin?view=closed" className={tab(view === "closed")}>Closed</Link>
      </div>

      {reports.length === 0 ? (
        <p className="border rounded-xl p-6 text-gray-600">
          {view === "open" ? "No open reports. All clear!" : "No closed reports yet."}
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => {
            const seller = r.listing?.seller;
            return (
              <li key={r.id} className="border rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {r.listing ? (
                      <Link href={`/listing/${r.listing.id}`} className="font-semibold text-[#7A1E2B] hover:underline break-words">
                        {r.listing.title}
                      </Link>
                    ) : (
                      <span className="font-semibold text-gray-500">Listing deleted</span>
                    )}
                    <p className="text-sm text-gray-600">
                      Seller:{" "}
                      {seller?.username && r.listing ? (
                        <Link href={`/admin/members/${r.listing.seller_id}`} className="underline">@{seller.username}</Link>
                      ) : (
                        "unknown"
                      )}
                      {seller?.is_suspended && <span className="ms-2 text-red-700 font-medium">suspended</span>}
                      {r.listing && <span className="ms-2">· Listing is {r.listing.status}</span>}
                    </p>
                  </div>
                  <span className="text-xs bg-red-50 text-red-800 border border-red-200 rounded-full px-3 py-1">
                    {reasons[r.reason] ?? r.reason}
                  </span>
                </div>
                {r.details && (
                  <p className="text-sm bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap break-words">{r.details}</p>
                )}
                <p className="text-xs text-gray-500">
                  Reported by {r.reporter?.username ? `@${r.reporter.username}` : "a deleted account"} on{" "}
                  <LocalTime iso={r.created_at} locale={locale} />
                  {r.resolved_at && (
                    <>
                      {" "}· {r.status === "dismissed" ? "Dismissed" : "Action taken"} on{" "}
                      <LocalTime iso={r.resolved_at} locale={locale} />
                    </>
                  )}
                </p>

                <div className="flex flex-wrap gap-2">
                  {view === "open" ? (
                    <>
                      <OutcomeButton id={r.id} outcome="dismiss" label="Dismiss (nothing wrong)" className={btn} />
                      {r.listing && r.listing.status !== "suspended" && (
                        <OutcomeButton id={r.id} outcome="hold" label="Suspend listing" className={btn} />
                      )}
                      {r.listing && (
                        <OutcomeButton
                          id={r.id}
                          outcome="remove"
                          label="Remove listing"
                          confirm="Remove this listing? It will be hidden from everyone."
                          className={danger}
                        />
                      )}
                      {r.listing && seller && !seller.is_suspended && (
                        <OutcomeButton
                          id={r.id}
                          outcome="suspend"
                          label="Remove and suspend seller"
                          confirm={`Suspend @${seller.username}? All their listings will be removed and they won't be able to bid, offer or message.`}
                          className="bg-red-700 text-white rounded-lg px-3 py-1.5 text-sm"
                        />
                      )}
                    </>
                  ) : (
                    <>
                      {(r.listing?.status === "removed" || r.listing?.status === "suspended") && (
                        <form action={restoreListing}>
                          <input type="hidden" name="id" value={r.listing.id} />
                          <ConfirmButton message="Make this listing active again?" className={btn}>
                            Restore listing
                          </ConfirmButton>
                        </form>
                      )}
                      {r.listing && seller?.is_suspended && (
                        <form action={setSuspended}>
                          <input type="hidden" name="id" value={r.listing.seller_id} />
                          <input type="hidden" name="suspended" value="false" />
                          <ConfirmButton message={`Lift the suspension on @${seller.username}?`} className={btn}>
                            Lift suspension
                          </ConfirmButton>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
