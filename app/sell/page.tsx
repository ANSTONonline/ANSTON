import Link from "next/link";
import { redirect } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { getCategories } from "@/lib/catalog";
import { getMember } from "@/lib/member";
import ListingForm from "./listing-form";

export default async function SellPage() {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const member = await getMember();
  // Signed in but hasn't picked a username or confirmed their age yet.
  if (member && !member.complete) redirect("/account");
  const categories = member ? await getCategories(locale) : [];

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-2xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-3 text-center">{t.sell.title}</h1>
      <p className="text-gray-600 mb-8 text-center">{t.sell.intro}</p>
      {member ? (
        <ListingForm text={t.sell} categories={categories} userId={member.user.id} locale={locale} />
      ) : (
        <div className="border rounded-xl p-8 bg-gray-50 text-center">
          <p className="mb-4">{t.sell.signIn}</p>
          <Link href="/account" className="bg-[#7A1E2B] text-white px-6 py-3 rounded-lg font-medium inline-block">
            {t.account.signIn}
          </Link>
        </div>
      )}
    </main>
  );
}
