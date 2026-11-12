import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { LocalTime } from "../listing/[id]/listing-actions";

type Row = {
  id: string;
  last_message_at: string;
  buyer_id: string;
  listing: { id: string; title: string } | null;
  buyer: { username: string | null } | null;
  seller: { username: string | null } | null;
  messages: { body: string; sender_id: string }[];
};

export default async function MessagesPage() {
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const { supabase, user } = await requireMember();

  const { data } = await supabase
    .from("conversations")
    .select(
      `id, last_message_at, buyer_id,
       listing:listings ( id, title ),
       buyer:profiles!conversations_buyer_id_fkey ( username ),
       seller:profiles!conversations_seller_id_fkey ( username ),
       messages ( body, sender_id )`,
    )
    .order("last_message_at", { ascending: false })
    .order("created_at", { referencedTable: "messages", ascending: false })
    .limit(1, { referencedTable: "messages" });
  const conversations = (data ?? []) as unknown as Row[];

  const { data: unreadRows } = await supabase
    .from("messages")
    .select("conversation_id")
    .is("read_at", null)
    .neq("sender_id", user.id);
  const unread = new Map<string, number>();
  for (const r of unreadRows ?? []) unread.set(r.conversation_id, (unread.get(r.conversation_id) ?? 0) + 1);

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full">
      <h1 className="text-3xl font-bold mb-6">{t.messages.title}</h1>
      {conversations.length === 0 ? (
        <div className="text-center py-16 border rounded-xl bg-gray-50">
          <p className="text-gray-600 mb-4">{t.messages.empty}</p>
          <Link href="/browse" className="bg-[#7A1E2B] text-white px-5 py-2 rounded-full text-sm">
            {t.cart.browse}
          </Link>
        </div>
      ) : (
        <ul className="divide-y border rounded-xl">
          {conversations.map((c) => {
            const other = c.buyer_id === user.id ? c.seller : c.buyer;
            const last = c.messages[0];
            const count = unread.get(c.id) ?? 0;
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex gap-3 p-4 hover:bg-gray-50">
                  <span className="w-10 h-10 rounded-full bg-[#7A1E2B] text-white flex items-center justify-center font-bold shrink-0">
                    {(other?.username ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <p className={`truncate ${count ? "font-bold" : "font-semibold"}`} dir="ltr">@{other?.username ?? "…"}</p>
                      <span className="text-xs text-gray-500 shrink-0">
                        <LocalTime iso={c.last_message_at} locale={locale} />
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{c.listing?.title ?? t.messages.listingGone}</p>
                    {last && (
                      <p className={`text-sm truncate ${count ? "text-gray-900" : "text-gray-600"}`}>
                        {last.sender_id === user.id ? `${t.messages.you}: ` : ""}
                        {last.body}
                      </p>
                    )}
                  </div>
                  {count > 0 && (
                    <span className="self-center bg-[#7A1E2B] text-white text-xs rounded-full px-2 py-0.5">{count}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
