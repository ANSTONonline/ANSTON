"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";

export async function sendReply(fd: FormData) {
  const member = await requireMember();
  const conversationId = String(fd.get("conversation") ?? "");
  const body = String(fd.get("body") ?? "").trim().slice(0, 5000);
  if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !body) return;
  // Row level security only lets the two people in the conversation post.
  const { error } = await member.supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: member.user.id, body });
  if (error) console.error("sendReply", error.message);
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
}
