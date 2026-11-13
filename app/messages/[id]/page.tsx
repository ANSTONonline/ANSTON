import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMember } from "@/lib/member";
import { LocalTime } from "../../listing/[id]/listing-actions";
import { sendReply } from "../actions";

type Conversation = {
  id: string;
  buyer_id: string;
  listing: { id: string; title: string } | null;
  buyer: { username: string | null } | null;
  seller: { username: string | null } | null;
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const locale = await getLocale();
  const t = await getDictionary(locale);
  const { supabase, user } = await requireMember();

  const { data } = await supabase
    .from("conversations")
    .select(
      `id, buyer_id,
       listing:listings ( id, title ),
       buyer:profiles!conversations_buyer_id_fkey ( username ),
       seller:profiles!conversations_seller_id_fkey ( username )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const convo = data as unknown as Conversation;
  const other = convo.buyer_id === user.id ? convo.seller : convo.buyer;

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, sender_id, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  // Opening the conversation marks the other person's messages as read.
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  return (
    <main className="flex-1 px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full flex flex-col">
      <Link href="/messages" className="text-sm text-[#7A1E2B] hover:underline">
        {t.messages.back}
      </Link>
      <h1 className="text-2xl font-bold mt-2" dir="ltr">@{other?.username ?? "…"}</h1>
      <p className="text-sm text-gray-600 mb-6">
        {convo.listing ? (
          <Link href={`/listing/${convo.listing.id}`} className="hover:underline">
            {t.messages.about.replace("{title}", convo.listing.title)}
          </Link>
        ) : (
          t.messages.listingGone
        )}
      </p>

      <ul className="space-y-3 mb-6">
        {(messages ?? []).map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? "bg-[#7A1E2B] text-white" : "bg-gray-100"}`}>
                <p className="whitespace-pre-line break-words">{m.body}</p>
                <p className={`text-[11px] mt-1 ${mine ? "text-white/70" : "text-gray-500"}`}>
                  <LocalTime iso={m.created_at} locale={locale} />
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <form action={sendReply} className="flex gap-2 sticky bottom-4">
        <input type="hidden" name="conversation" value={id} />
        <textarea
          name="body"
          required
          rows={2}
          maxLength={5000}
          placeholder={t.messages.placeholder}
          aria-label={t.messages.placeholder}
          className="flex-1 border rounded-xl px-3 py-2 bg-white"
        />
        <button type="submit" className="bg-[#7A1E2B] text-white px-5 rounded-xl font-medium">
          {t.messages.send}
        </button>
      </form>
    </main>
  );
}
