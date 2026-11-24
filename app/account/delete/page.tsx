import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { getUser } from "@/lib/supabase/server";
import DeleteAccountForm from "./delete-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary(await getLocale());
  return { title: `${t.deleteAccount.title} | Anston` };
}

type SearchParams = Promise<{ done?: string }>;

// Lets members permanently delete their account (required by the App Store
// and Google Play). Linked from the account page.
export default async function DeleteAccountPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getDictionary(await getLocale());
  const text = t.deleteAccount;
  const { done } = await searchParams;
  const user = await getUser();

  if (!user) {
    if (done !== "1") redirect("/account");
    return (
      <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full text-center">
        <h1 className="text-3xl font-bold mb-3">{text.doneTitle}</h1>
        <p className="text-gray-600 mb-6">{text.doneText}</p>
        <Link href="/" className="inline-block bg-[#7A1E2B] text-white px-6 py-3 rounded-lg font-medium">
          {text.home}
        </Link>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
      <Link href="/account" className="text-sm text-[#7A1E2B] hover:underline">
        {t.account.title}
      </Link>
      <h1 className="text-3xl font-bold mt-2 mb-2">{text.title}</h1>
      <p className="text-gray-700 mb-4">{text.intro}</p>
      <ul className="list-disc ps-5 space-y-2 text-sm text-gray-700 mb-4">
        <li>{text.point1}</li>
        <li>{text.point2}</li>
        <li>{text.point3}</li>
      </ul>
      <p className="text-sm text-gray-600 mb-6">{text.blockers}</p>
      <DeleteAccountForm text={text} />
    </main>
  );
}
