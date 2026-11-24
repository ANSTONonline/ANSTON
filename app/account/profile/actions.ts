"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { AVATAR_BUCKET, GENDERS } from "@/lib/avatar";

// Save the profile photo and gender. The photo was uploaded from the browser
// into the member's own folder; the database also checks the folder.
export async function saveProfile(fd: FormData) {
  const member = await requireMember();
  const avatar = String(fd.get("avatar") ?? "").trim();
  const gender = String(fd.get("gender") ?? "");
  const own = new RegExp(`^${member.user.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`);
  if (avatar && !own.test(avatar)) redirect("/account/profile?error=1");

  const { data: before } = await member.supabase.from("profiles").select("avatar_url").eq("id", member.user.id).maybeSingle();
  const { error } = await member.supabase
    .from("profiles")
    .update({ avatar_url: avatar || null, gender: (GENDERS as readonly string[]).includes(gender) ? gender : null })
    .eq("id", member.user.id);
  if (error) {
    console.error("saveProfile", error.message);
    redirect("/account/profile?error=1");
  }
  // Remove the old photo once the new one is saved.
  if (before?.avatar_url && before.avatar_url !== avatar) {
    await member.supabase.storage.from(AVATAR_BUCKET).remove([before.avatar_url]);
  }
  revalidatePath("/account");
  redirect("/account/profile?saved=1");
}
