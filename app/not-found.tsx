import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function NotFound() {
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24">
      <h1 className="text-3xl font-bold mb-4">{t.listing.notFound}</h1>
      <Link href="/browse" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
        {t.listing.back}
      </Link>
    </main>
  );
}
