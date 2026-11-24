import Link from "next/link";

// Tabs at the top of every admin page.
export default function AdminNav({ current }: { current: "reports" | "members" | "businesses" }) {
  const tab = (active: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-medium ${active ? "bg-gray-900 text-white" : "border hover:bg-gray-50"}`;
  return (
    <nav className="flex gap-2 mb-6 border-b pb-4" aria-label="Admin">
      <span className="text-sm text-gray-500 self-center me-2">🛡️ Admin</span>
      <Link href="/admin" className={tab(current === "reports")}>Reports</Link>
      <Link href="/admin/members" className={tab(current === "members")}>Members</Link>
      <Link href="/admin/businesses" className={tab(current === "businesses")}>Businesses</Link>
    </nav>
  );
}
