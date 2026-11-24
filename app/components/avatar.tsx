import { avatarUrl } from "@/lib/avatar";

// A member's profile photo, or the first letter of their username.
export default function Avatar({ path, username, size = 48 }: { path?: string | null; username?: string | null; size?: number }) {
  const letter = (username ?? "?").charAt(0).toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl(path)} alt="" style={style} className="rounded-full object-cover shrink-0 bg-gray-100" />;
  }
  return (
    <span style={style} className="rounded-full bg-[#7A1E2B] text-white flex items-center justify-center font-bold shrink-0" aria-hidden="true">
      {letter}
    </span>
  );
}
