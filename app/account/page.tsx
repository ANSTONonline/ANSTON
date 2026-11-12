import Link from "next/link";
import AuthForms from "./auth-forms";
import { signOut } from "./actions";
import { getDictionary, getLocale } from "@/i18n/server";
import { createClient, getUser, supabaseConfigured } from "@/lib/supabase/server";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getDictionary(await getLocale());
  const params = await searchParams;
  const user = await getUser();

  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    return (
      <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
        <h1 className="text-3xl font-bold mb-6">{t.account.title}</h1>
        {params.confirmed && (
          <p className="mb-4 text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2" role="status">
            {t.account.confirmed}
          </p>
        )}
        <div className="border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-full bg-[#7A1E2B] text-white flex items-center justify-center text-xl font-bold">
              {(profile?.display_name || user.email || "?").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              {profile?.display_name && <p className="font-semibold">{profile.display_name}</p>}
              <p className="text-sm text-gray-600 truncate" dir="ltr">{user.email}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/sell" className="bg-[#7A1E2B] text-white py-2 rounded-lg text-center font-medium">
              {t.header.listItem}
            </Link>
            <Link href="/favorites" className="border py-2 rounded-lg text-center">{t.favorites.title}</Link>
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
      {params.error === "link" && (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          {t.account.errors.link}
        </p>
      )}
      {supabaseConfigured() ? (
        <AuthForms
          text={{
            email: t.account.email,
            password: t.account.password,
            name: t.account.name,
            passwordHint: t.account.passwordHint,
            signIn: t.account.signIn,
            signUp: t.account.signUp,
            noAccount: t.account.noAccount,
            haveAccount: t.account.haveAccount,
            checkEmail: t.account.checkEmail,
            working: t.account.working,
            errors: {
              invalid: t.account.errors.invalid,
              notConfirmed: t.account.errors.notConfirmed,
              exists: t.account.errors.exists,
              weakPassword: t.account.errors.weakPassword,
              rateLimit: t.account.errors.rateLimit,
              generic: t.account.errors.generic,
            },
          }}
        />
      ) : (
        <p className="border rounded-xl p-6 bg-gray-50 text-gray-600">{t.account.soon}</p>
      )}
    </main>
  );
}
