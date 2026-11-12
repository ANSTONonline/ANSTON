import { pageTitle } from "../components/info-page";
import { getDictionary, getLocale } from "@/i18n/server";

export const generateMetadata = () => pageTitle("faq");

export default async function FaqPage() {
  const t = await getDictionary(await getLocale());
  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-3xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{t.pages.faq.title}</h1>
      <div className="space-y-3">
        {t.pages.faq.items.map((item) => (
          <details key={item.q} className="border rounded-xl p-4 group">
            <summary className="font-semibold cursor-pointer">{item.q}</summary>
            <p className="text-gray-700 mt-2">{item.a}</p>
          </details>
        ))}
      </div>
    </main>
  );
}
