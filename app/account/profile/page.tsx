import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { ProfileForm } from "./profile-form";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

// Profile photo and gender (both optional).
export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const member = await requireMember();
  const t = await getDictionary(await getLocale());
  const flags = await searchParams;
  const { data } = await member.supabase.from("profiles").select("username, avatar_url, gender").eq("id", member.user.id).maybeSingle();
  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
      <h1 className="text-3xl font-bold mb-2">{t.profile.title}</h1>
      <p className="text-gray-600 mb-6">{t.profile.intro}</p>
      {flags.saved && <p role="status" className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 text-sm">{t.profile.saved}</p>}
      {flags.error && <p role="alert" className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{t.profile.error}</p>}
      <ProfileForm userId={member.user.id} username={data?.username ?? "?"} avatar={data?.avatar_url ?? null} gender={data?.gender ?? null} text={t.profile} />
      <Link href="/account" className="inline-block mt-6 text-sm text-[#7A1E2B] hover:underline">{t.account.title}</Link>
    </main>
  );
}
