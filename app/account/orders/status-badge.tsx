import type { OrderStatus } from "@/lib/orders";

// Colored label for an order's status.
export function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  const tone =
    status === "completed" ? "bg-green-100 text-green-800"
    : status === "fulfilled" ? "bg-blue-100 text-blue-800"
    : status === "paid" ? "bg-amber-100 text-amber-800"
    : status === "cancelled" || status === "refunded" || status === "disputed" ? "bg-red-100 text-red-800"
    : "bg-gray-100 text-gray-700";
  return <span className={`text-xs rounded-full px-2.5 py-1 whitespace-nowrap ${tone}`}>{label}</span>;
}
