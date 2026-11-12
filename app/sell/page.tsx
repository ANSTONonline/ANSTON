import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function SellPage() {
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-xl mx-auto w-full text-center">
      <h1 className="text-3xl font-bold mb-3">{t.sell.title}</h1>
      <p className="text-gray-600 mb-8">{t.sell.intro}</p>
      <div className="border rounded-xl p-8 bg-gray-50">
        <p className="mb-4">{t.sell.signIn}</p>
        <Link href="/account" className="bg-[#7A1E2B] text-white px-6 py-3 rounded-lg font-medium inline-block">
          {t.account.signIn}
        </Link>
      </div>
    </main>
  );
}
