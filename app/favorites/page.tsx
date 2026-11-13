import { FavoritesView } from "../components/saved-lists";
import { getDictionary, getLocale } from "@/i18n/server";

export default async function FavoritesPage() {
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{t.favorites.title}</h1>
      <FavoritesView
        text={{ empty: t.favorites.empty, browse: t.cart.browse, save: t.featured.save, saved: t.featured.saved }}
      />
    </main>
  );
}
