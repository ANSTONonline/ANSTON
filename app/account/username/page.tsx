import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { LocalTime } from "../../listing/[id]/listing-actions";
import ChangeUsernameForm from "./username-form";

const COOLDOWN_DAYS = 30;

// When the person may change their username again, or null if they can now.
function nextChange(changedAt: string | null) {
  if (!changedAt) return null;
  const next = new Date(new Date(changedAt).getTime() + COOLDOWN_DAYS * 86400000);
  return next.getTime() > Date.now() ? next.toISOString() : null;
}

export default async function ChangeUsernamePage() {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const { supabase, user, profile } = await requireMember();
  const { data } = await supabase.from("profiles").select("username_changed_at").eq("id", user.id).maybeSingle();
  const waitUntil = nextChange((data?.username_changed_at as string | null) ?? null);

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
      <Link href="/account" className="text-sm text-[#7A1E2B] hover:underline">
        {t.account.title}
      </Link>
      <h1 className="text-3xl font-bold mt-2 mb-2">{t.account.changeUsername}</h1>
      <p className="text-gray-600 mb-1">
        {t.account.usernameCurrent.split("{username}")[0]}
        <span dir="ltr" className="font-semibold">@{profile?.username}</span>
        {t.account.usernameCurrent.split("{username}")[1]}
      </p>
      <p className="text-sm text-gray-500 mb-6">{t.account.usernameRule}</p>
      {waitUntil ? (
        <p className="border rounded-xl p-6 bg-gray-50 text-gray-700">
          {t.account.usernameWait.split("{date}")[0]}
          <LocalTime iso={waitUntil} locale={locale} withTime={false} />
          {t.account.usernameWait.split("{date}")[1]}
        </p>
      ) : (
        <ChangeUsernameForm text={t.account} locale={locale} />
      )}
    </main>
  );
}
