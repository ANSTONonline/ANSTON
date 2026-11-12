import { ForgotPasswordForm } from "../auth-forms";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function ForgotPasswordPage() {
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
      <h1 className="text-3xl font-bold mb-2">{t.account.forgotTitle}</h1>
      <p className="text-gray-600 mb-6">{t.account.forgotIntro}</p>
      <ForgotPasswordForm text={t.account} />
    </main>
  );
}
