import { CartView } from "../components/saved-lists";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function CartPage() {
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{t.cart.title}</h1>
      <CartView text={t.cart} />
    </main>
  );
}
