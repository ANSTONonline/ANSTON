import { getDictionary, getLocale } from "@/i18n/server";

type TextPage = "about" | "howItWorks" | "pricing";

// A simple page of text (About, How it works, Pricing, policies).
export default async function InfoPage({ page, numbered = false }: { page: TextPage; numbered?: boolean }) {
  const t = await getDictionary(await getLocale());
  const content = t.pages[page];
  const List = numbered ? "ol" : "div";
  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-3xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{content.title}</h1>
      <List className={numbered ? "list-decimal ps-6 space-y-3 text-gray-700" : "space-y-4 text-gray-700"}>
        {content.body.map((p) => (numbered ? <li key={p}>{p}</li> : <p key={p}>{p}</p>))}
      </List>
    </main>
  );
}

export async function pageTitle(page: TextPage | "faq" | "privacy" | "terms" | "cookies") {
  const t = await getDictionary(await getLocale());
  return { title: `${t.pages[page].title} | ANSTON` };
}
