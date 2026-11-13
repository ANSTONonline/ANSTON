import { getDictionary, getLocale } from "@/i18n/server";
import { EFFECTIVE_DATE, type LegalDoc } from "@/lib/legal";

// Privacy Policy, Terms of Service and Cookie Policy. The documents are in
// English (the official version); other languages show a translated title
// and a note saying so.
export default async function LegalPage({ doc, page }: { doc: LegalDoc; page: "privacy" | "terms" | "cookies" }) {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const linkify = (text: string) =>
    text.split(/(support@myanston\.com)/).map((part, i) =>
      part === "support@myanston.com" ? (
        <a key={i} href="mailto:support@myanston.com" className="text-[#7A1E2B] underline">
          {part}
        </a>
      ) : (
        part
      ),
    );

  return (
    <main className="flex-1 px-4 sm:px-8 py-12 max-w-3xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-2">{t.pages[page].title}</h1>
      <p className="text-sm text-gray-500 mb-6">{t.pages.updated.replace("{date}", EFFECTIVE_DATE)}</p>
      {locale !== "en" && (
        <p className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-700 mb-6">{t.pages.englishNote}</p>
      )}
      <article lang="en" dir="ltr" className="text-gray-700 space-y-4 text-start">
        {doc.intro.map((p) => (
          <p key={p}>{linkify(p)}</p>
        ))}
        {doc.sections.map((s) => (
          <section key={s.heading} className="pt-4">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{s.heading}</h2>
            <div className="space-y-3">
              {s.paragraphs?.map((p) => (
                <p key={p}>{linkify(p)}</p>
              ))}
              {s.bullets && (
                <ul className="list-disc ps-6 space-y-1.5">
                  {s.bullets.map((b) => (
                    <li key={b}>{linkify(b)}</li>
                  ))}
                </ul>
              )}
              {s.after?.map((p) => (
                <p key={p}>{linkify(p)}</p>
              ))}
            </div>
          </section>
        ))}
      </article>
    </main>
  );
}
