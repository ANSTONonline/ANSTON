import { SOCIAL_LINKS } from "@/lib/social";

// Simple one-color icons for each network.
const ICONS: Record<(typeof SOCIAL_LINKS)[number]["name"], React.ReactNode> = {
  Instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
    </>
  ),
  TikTok: (
    <path
      fill="currentColor"
      d="M16.5 3c.3 2.2 1.6 3.7 3.8 3.9v3.1c-1.4.1-2.6-.3-3.8-1v6.1c0 3.6-2.9 5.9-6 5.9-3.4 0-6-2.8-5.6-6.3.4-3.1 3.3-5.3 6.5-4.8v3.2c-1.5-.4-3.2.5-3.4 2.1-.2 1.4.9 2.7 2.4 2.7 1.4 0 2.6-1 2.6-2.6V3h3.5z"
    />
  ),
  YouTube: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
      <path d="M10 9v6l5-3z" fill="#7A1E2B" />
    </>
  ),
  X: <path fill="currentColor" d="M17.8 3H21l-7 8 8.2 10h-6.4l-5-6.2L5 21H1.8l7.5-8.6L1.5 3h6.6l4.5 5.7L17.8 3zm-1.1 16h1.8L7.3 4.9H5.4L16.7 19z" />,
};

export default function SocialIcons({ label }: { label: string }) {
  return (
    <ul className="flex gap-3 mt-4" aria-label={label}>
      {SOCIAL_LINKS.map((s) => (
        <li key={s.name}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${s.name} ${s.handle}`}
            title={`${s.name} ${s.handle}`}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              {ICONS[s.name]}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
