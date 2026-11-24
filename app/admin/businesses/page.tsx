import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/member";
import { DOC_BUCKET } from "@/lib/business";
import AdminNav from "../admin-nav";
import { reviewBusiness } from "../actions";

export const metadata: Metadata = { title: "Businesses | Admin | Anston", robots: { index: false } };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;
type Row = {
  id: string; slug: string; name: string; legal_name: string; business_type: string; status: string;
  registration_region: string | null; registration_number: string | null; city: string | null; region: string | null; country_code: string | null;
  website: string | null; phone: string | null; email: string | null; review_note: string | null; submitted_at: string | null;
  owner: { username: string | null } | null;
  docs: { id: string; kind: string; file_name: string; storage_path: string }[];
};

const KIND: Record<string, string> = { registration: "State registration / LLC certificate", ein_letter: "IRS EIN letter", license: "Business license", other: "Other" };

// Admin: check each business's documents against its details, then approve or reject.
export default async function AdminBusinessesPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const { data: me } = await member.supabase.from("profiles").select("is_admin").eq("id", member.user.id).maybeSingle();
  if (!me?.is_admin) notFound();
  const show = (await searchParams).show === "all" ? "all" : "pending";

  let query = member.supabase
    .from("businesses")
    .select("id, slug, name, legal_name, business_type, status, registration_region, registration_number, city, region, country_code, website, phone, email, review_note, submitted_at, owner:profiles!businesses_owner_id_fkey ( username ), docs:business_documents ( id, kind, file_name, storage_path )")
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(100);
  if (show === "pending") query = query.eq("status", "pending");
  const { data, error } = await query;
  if (error) console.error("admin businesses", error.message);
  const rows = (data ?? []) as unknown as Row[];

  // Short-lived links to the private documents (10 minutes).
  const paths = rows.flatMap((r) => r.docs.map((d) => d.storage_path));
  const links = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await member.supabase.storage.from(DOC_BUCKET).createSignedUrls(paths, 600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full" dir="ltr">
      <AdminNav current="businesses" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Business verification</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/businesses" className={`px-3 py-1.5 rounded-lg ${show === "pending" ? "bg-gray-900 text-white" : "border"}`}>Waiting</Link>
          <Link href="/admin/businesses?show=all" className={`px-3 py-1.5 rounded-lg ${show === "all" ? "bg-gray-900 text-white" : "border"}`}>All</Link>
        </div>
      </div>
      <details className="mb-6 border rounded-xl p-4 text-sm bg-gray-50">
        <summary className="font-medium cursor-pointer">How to check a business</summary>
        <ol className="list-decimal ps-5 mt-2 space-y-1 text-gray-700">
          <li>The <b>legal name</b> on the documents must match the legal name they typed.</li>
          <li>Look the business up on the state&apos;s official business search (for Texas: the Secretary of State / Comptroller &quot;Franchise Tax Account Status&quot; search) using the name or file number. It should be active.</li>
          <li>An IRS EIN letter (CP 575 or 147C) should show the same legal name.</li>
          <li>Check the website/phone look real and match. Reject if anything looks edited, blurry or mismatched, and say why in the note.</li>
        </ol>
      </details>

      {rows.length === 0 ? (
        <p className="text-gray-600 border rounded-xl p-6 bg-gray-50">Nothing waiting for review.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="border rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-lg">{r.name} <span className="text-sm font-normal text-gray-500">({r.business_type})</span></p>
                  <p className="text-sm">Legal name: <b>{r.legal_name}</b></p>
                  <p className="text-sm text-gray-600">
                    Registered in: {r.registration_region || "—"} · File/registration no.: {r.registration_number || "—"}
                  </p>
                  <p className="text-sm text-gray-600">
                    {[r.city, r.region, r.country_code].filter(Boolean).join(", ") || "No location"} · Owner: {r.owner?.username ? <Link href={`/seller/${r.owner.username}`} className="underline">@{r.owner.username}</Link> : "—"}
                  </p>
                  <p className="text-sm text-gray-600">{[r.phone, r.email, r.website].filter(Boolean).join(" · ") || "No contact details"}</p>
                </div>
                <span className={`text-xs font-medium rounded-full px-2 py-1 ${r.status === "verified" ? "bg-green-100 text-green-800" : r.status === "pending" ? "bg-amber-100 text-amber-900" : "bg-gray-100 text-gray-700"}`}>{r.status}</span>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Documents ({r.docs.length})</p>
                {r.docs.length === 0 ? <p className="text-sm text-red-700">No documents uploaded.</p> : (
                  <ul className="text-sm space-y-1">
                    {r.docs.map((d) => (
                      <li key={d.id}>
                        📎 {KIND[d.kind] ?? d.kind}:{" "}
                        {links.get(d.storage_path) ? <a href={links.get(d.storage_path)} target="_blank" rel="noopener noreferrer" className="underline">{d.file_name || "open"} ↗</a> : d.file_name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Link href={`/business/${r.slug}`} className="text-sm underline">Preview page</Link>
              <form action={reviewBusiness} className="space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <textarea name="note" rows={2} maxLength={1000} defaultValue={r.review_note ?? ""} placeholder="Note to the owner (required if rejecting)" className="w-full border rounded-lg px-3 py-2 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <button name="decision" value="verified" className="bg-green-700 text-white rounded-lg px-4 py-2 text-sm">✅ Verify</button>
                  <button name="decision" value="rejected" className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm">Reject</button>
                  {r.status === "verified" && <button name="decision" value="suspended" className="border rounded-lg px-4 py-2 text-sm">Suspend</button>}
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
