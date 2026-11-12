import Link from "next/link";
import type { Dictionary } from "@/i18n/server";

export default function SiteFooter({ t }: { t: Dictionary }) {
  const link = "hover:underline";
  return (
    <footer className="bg-[#7A1E2B] text-white px-8 py-12 mt-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
        <div>
          <Link href="/" className="text-xl font-bold mb-2 block">ANSTON</Link>
          <p className="text-sm opacity-90">{t.footer.about}</p>
        </div>
        <div>
          <h5 className="font-semibold mb-3">{t.footer.quickLinks}</h5>
          <ul className="text-sm space-y-2 opacity-90">
            <li><Link href="/about" className={link}>{t.footer.aboutUs}</Link></li>
            <li><Link href="/how-it-works" className={link}>{t.footer.howItWorks}</Link></li>
            <li><Link href="/pricing" className={link}>{t.footer.pricing}</Link></li>
            <li><Link href="/faq" className={link}>{t.footer.faq}</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="font-semibold mb-3">{t.footer.categories}</h5>
          <ul className="text-sm space-y-2 opacity-90">
            <li><Link href="/browse?category=vehicles" className={link}>{t.footer.vehicles}</Link></li>
            <li><Link href="/browse?category=homes" className={link}>{t.footer.realEstate}</Link></li>
            <li><Link href="/browse?category=clothes" className={link}>{t.footer.fashion}</Link></li>
            <li><Link href="/browse?category=equipment" className={link}>{t.footer.electronics}</Link></li>
          </ul>
        </div>
        <div>
          <h5 className="font-semibold mb-3">{t.footer.contact}</h5>
          <a href="mailto:support@myanston.com" className={`text-sm opacity-90 ${link}`} dir="ltr">
            support@myanston.com
          </a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/20 text-sm opacity-90 flex justify-between flex-wrap gap-2">
        <p>© 2026 ANSTON. {t.footer.rights}</p>
        <div className="flex gap-4 flex-wrap">
          <Link href="/privacy" className={link}>{t.footer.privacy}</Link>
          <Link href="/terms" className={link}>{t.footer.terms}</Link>
          <Link href="/cookies" className={link}>{t.footer.cookies}</Link>
        </div>
      </div>
    </footer>
  );
}
