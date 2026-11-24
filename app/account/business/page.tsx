import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { allCountryCodes } from "@/lib/places";
import { BUSINESS_COLUMNS, toBusiness } from "@/lib/business";
import { BusinessDocuments, BusinessForm } from "./business-form";
import { submitBusiness } from "./actions";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// "My business": create the page, add proof, submit for verification.
export default async function MyBusinessPage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const b = t.business;
  const flags = await searchParams;
  const { data: row } = await member.supabase.from("businesses").select(BUSINESS_COLUMNS).eq("owner_id", member.user.id).maybeSingle();
  const business = row ? toBusiness(row) : null;
  const { data: docs } = business
    ? await member.supabase.from("business_documents").select("id, kind, file_name").eq("business_id", business.id).order("uploaded_at")
    : { data: [] };

  const status = business?.status;
  const banner = {
    draft: ["bg-gray-50 border-gray-200 text-gray-800", `📝 ${b.statusDraft}`],
    pending: ["bg-amber-50 border-amber-200 text-amber-900", `⏳ ${b.statusPending}`],
    verified: ["bg-green-50 border-green-200 text-green-800", `✅ ${b.statusVerified}`],
    rejected: ["bg-red-50 border-red-200 text-red-800", `⚠️ ${b.statusRejected}`],
    suspended: ["bg-red-50 border-red-200 text-red-800", `⛔ ${b.statusSuspended}`],
  } as const;

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-2xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">🏢 {b.myTitle}</h1>
        <p className="text-gray-600">{b.myIntro}</p>
      </div>

      {flags.submitted && <p role="status" className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{b.submitted}</p>}
      {flags.error === "docs" && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{b.needDocs}</p>}

      {business && status && (
        <div className={`border rounded-xl p-4 text-sm space-y-2 ${banner[status][0]}`}>
          <p className="font-medium">{banner[status][1]}</p>
          {status === "rejected" && business.review_note && <p>{b.noteFromAnston}: {business.review_note}</p>}
          {status === "verified" && (
            <Link href={`/business/${business.slug}`} className="inline-block bg-[#7A1E2B] text-white rounded-lg px-3 py-1.5">{b.viewPage}</Link>
          )}
        </div>
      )}

      <BusinessForm business={business} userId={member.user.id} text={b} sellText={t.sell} locale={locale} countryCodes={allCountryCodes()} />

      {business && (
        <>
          <BusinessDocuments userId={member.user.id} docs={docs ?? []} text={b} />
          {(status === "draft" || status === "rejected") && (
            <form action={submitBusiness} className="border-2 border-[#7A1E2B]/30 rounded-xl p-5 space-y-3">
              <h2 className="font-semibold">{b.submitTitle}</h2>
              <p className="text-sm text-gray-600">{b.submitHelp}</p>
              <button type="submit" disabled={!docs?.length} className="w-full bg-[#7A1E2B] text-white rounded-lg py-3 font-semibold disabled:opacity-50">
                {b.submit}
              </button>
            </form>
          )}
        </>
      )}
      <Link href="/account" className="inline-block text-sm text-[#7A1E2B] hover:underline">{t.account.title}</Link>
    </main>
  );
}
