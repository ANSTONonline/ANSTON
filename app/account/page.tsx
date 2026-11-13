import Link from "next/link";
import AuthForms, { FinishProfileForm } from "./auth-forms";
import { signOut } from "./actions";
import { getDictionary, getLocale } from "@/i18n/server";
import { createClient, getUser, supabaseConfigured } from "@/lib/supabase/server";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function Banner({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  const style =
    kind === "ok" ? "text-green-800 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200";
  return (
    <p className={`mb-4 text-sm border rounded-lg px-3 py-2 ${style}`} role={kind === "ok" ? "status" : "alert"}>
      {children}
    </p>
  );
}

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getDictionary(await getLocale());
  const params = await searchParams;
  const user = await getUser();

  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, display_name, age_confirmed_at, terms_accepted_at")
      .eq("id", user.id)
      .maybeSingle();

    // Accounts made with Google (or whose username was taken at the last
    // moment) choose a username and confirm their age here first.
    const needsUsername = !profile?.username;
    const needsAge = !profile?.age_confirmed_at;
    const needsTerms = !profile?.terms_accepted_at;
    if (needsUsername || needsAge || needsTerms) {
      return (
        <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
          <h1 className="text-3xl font-bold mb-2">{t.account.finishTitle}</h1>
          <p className="text-gray-600 mb-6">{t.account.finishIntro}</p>
          <FinishProfileForm
            text={t.account}
            needsUsername={needsUsername}
            needsAge={needsAge}
            needsTerms={needsTerms}
            legal={{ terms: t.footer.terms, privacy: t.footer.privacy }}
          />
          <form action={signOut} className="mt-4 text-center">
            <button type="submit" className="text-sm text-gray-500 hover:underline">{t.account.signOut}</button>
          </form>
        </main>
      );
    }

    const contact = user.email || user.phone || "";
    const { count: unread } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .neq("sender_id", user.id);
    return (
      <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
        <h1 className="text-3xl font-bold mb-6">{t.account.title}</h1>
        {params.confirmed && <Banner kind="ok">{t.account.confirmed}</Banner>}
        {params.passwordUpdated && <Banner kind="ok">{t.account.passwordUpdated}</Banner>}
        <div className="border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-full bg-[#7A1E2B] text-white flex items-center justify-center text-xl font-bold">
              {profile.username!.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-semibold" dir="ltr">@{profile.username}</p>
              <p className="text-sm text-gray-600 truncate" dir="ltr">{contact}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/sell" className="bg-[#7A1E2B] text-white py-2 rounded-lg text-center font-medium">
              {t.header.listItem}
            </Link>
            <Link href="/account/selling" className="border py-2 rounded-lg text-center">{t.dashboard.sellingTitle}</Link>
            <Link href="/account/buying" className="border py-2 rounded-lg text-center">{t.dashboard.buyingTitle}</Link>
            <Link href="/messages" className="border py-2 rounded-lg text-center">
              {t.messages.title}
              {unread ? (
                <span className="ms-2 bg-[#7A1E2B] text-white text-xs rounded-full px-2 py-0.5">{unread}</span>
              ) : null}
            </Link>
            <Link href="/favorites" className="border py-2 rounded-lg text-center">{t.favorites.title}</Link>
            {user.email && (
              <Link href="/account/reset-password" className="border py-2 rounded-lg text-center">
                {t.account.changePassword}
              </Link>
            )}
            <form action={signOut}>
              <button type="submit" className="w-full border border-[#7A1E2B] text-[#7A1E2B] py-2 rounded-lg">
                {t.account.signOut}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
      <h1 className="text-3xl font-bold mb-2">{t.account.title}</h1>
      <p className="text-gray-600 mb-6">{t.account.intro}</p>
      {params.error === "link" && <Banner kind="error">{t.account.errors.link}</Banner>}
      {params.error === "google" && <Banner kind="error">{t.account.errors.google}</Banner>}
      {supabaseConfigured() ? (
        <AuthForms text={t.account} legal={{ terms: t.footer.terms, privacy: t.footer.privacy }} />
      ) : (
        <p className="border rounded-xl p-6 bg-gray-50 text-gray-600">{t.account.soon}</p>
      )}
    </main>
  );
}
