import { redirect } from "next/navigation";
import { ResetPasswordForm } from "../auth-forms";
import { getDictionary, getLocale } from "@/i18n/server";
import { getUser } from "@/lib/supabase/server";

// Reached from the "Reset your password" email (which signs you in), or from
// the account page to change your password.
export default async function ResetPasswordPage() {
  const user = await getUser();
  if (!user) redirect("/account?error=link");
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-md mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{t.account.newPasswordTitle}</h1>
      <ResetPasswordForm text={t.account} />
    </main>
  );
}
