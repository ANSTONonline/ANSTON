import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { LocalTime } from "../../listing/[id]/listing-actions";
import AdminNav from "../admin-nav";

export const metadata: Metadata = { title: "Members | Anston", robots: { index: false } };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type MemberRow = {
  id: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_suspended: boolean;
  listings: number;
  purchases: number;
  total_count: number;
};

const PAGE_SIZE = 50;

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const { data: me } = await member.supabase.from("profiles").select("is_admin").eq("id", member.user.id).maybeSingle();
  if (!me?.is_admin) notFound();
  const locale = await getLocale();

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const page = Math.max(1, Number(params.page) || 1);

  const { data, error } = await member.supabase.rpc("admin_members", {
    p_search: q,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) console.error("admin_members", error.message);
  const rows = (data ?? []) as MemberRow[];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => `/admin/members?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`;

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full" dir="ltr">
      <AdminNav current="members" />
      <h1 className="text-3xl font-bold mb-2">Members</h1>
      <p className="text-gray-600 mb-6">Every Anston account. Click a member to see their details and activity.</p>

      <form className="flex gap-2 mb-6" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by username, email or phone"
          className="flex-1 border rounded-lg px-3 py-2"
          aria-label="Search members"
        />
        <button type="submit" className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2">Search</button>
        {q && <Link href="/admin/members" className="border rounded-lg px-4 py-2">Clear</Link>}
      </form>

      <p className="text-sm text-gray-500 mb-3">
        {total} {total === 1 ? "member" : "members"}{q && ` matching "${q}"`}
      </p>

      {rows.length === 0 ? (
        <p className="border rounded-xl p-6 text-gray-600">No members found.</p>
      ) : (
        <div className="border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Email / phone</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
                <th className="px-4 py-3 font-medium text-right">Listings</th>
                <th className="px-4 py-3 font-medium text-right">Purchases</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/members/${m.id}`} className="font-medium text-[#7A1E2B] hover:underline">
                      {m.username ? `@${m.username}` : "(no username yet)"}
                    </Link>
                    {m.is_admin && <span className="ms-2 text-xs bg-gray-900 text-white rounded px-1.5 py-0.5">admin</span>}
                    {m.is_suspended && <span className="ms-2 text-xs bg-red-100 text-red-800 rounded px-1.5 py-0.5">suspended</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 break-all">{m.email || m.phone || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    <LocalTime iso={m.created_at} locale={locale} withTime={false} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {m.last_sign_in_at ? <LocalTime iso={m.last_sign_in_at} locale={locale} withTime={false} /> : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{m.listings}</td>
                  <td className="px-4 py-3 text-right">{m.purchases}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center gap-3 mt-4 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)} className="border rounded-lg px-3 py-1.5">← Previous</Link>}
          <span className="text-gray-500">Page {page} of {pages}</span>
          {page < pages && <Link href={pageHref(page + 1)} className="border rounded-lg px-3 py-1.5">Next →</Link>}
        </div>
      )}
    </main>
  );
}
