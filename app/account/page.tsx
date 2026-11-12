import { getDictionary, getLocale } from "@/i18n/server";

export default async function AccountPage() {
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
      <h1 className="text-3xl font-bold mb-2">{t.account.title}</h1>
      <p className="text-gray-600 mb-6">{t.account.intro}</p>
      <form className="border rounded-xl p-6 space-y-4" aria-describedby="account-soon">
        <label className="block">
          <span className="text-sm font-medium">{t.account.email}</span>
          <input type="email" name="email" disabled className="mt-1 w-full border rounded-lg px-3 py-2 bg-gray-50" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t.account.password}</span>
          <input type="password" name="password" disabled className="mt-1 w-full border rounded-lg px-3 py-2 bg-gray-50" />
        </label>
        <div className="flex gap-3">
          <button type="button" disabled className="flex-1 bg-[#7A1E2B] text-white py-2 rounded-lg opacity-60 cursor-not-allowed">
            {t.account.signIn}
          </button>
          <button type="button" disabled className="flex-1 border border-[#7A1E2B] text-[#7A1E2B] py-2 rounded-lg opacity-60 cursor-not-allowed">
            {t.account.signUp}
          </button>
        </div>
        <p id="account-soon" className="text-sm text-gray-500">{t.account.soon}</p>
      </form>
    </main>
  );
}
