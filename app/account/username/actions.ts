"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { USERNAME_PATTERN, normalizeUsername } from "@/lib/auth-rules";
import { requireMember } from "@/lib/member";
import { checkUsername } from "../actions";

export type ChangeUsernameState = {
  error?: "usernameInvalid" | "usernameTaken" | "usernameSame" | "usernameWait" | "generic";
  until?: string; // when the next change is allowed (ISO time)
  value?: string;
};

export async function changeUsername(_prev: ChangeUsernameState, fd: FormData): Promise<ChangeUsernameState> {
  const { supabase, user, profile } = await requireMember();
  const username = normalizeUsername(String(fd.get("username") ?? ""));
  if (!USERNAME_PATTERN.test(username)) return { error: "usernameInvalid", value: username };
  if (username === profile?.username) return { error: "usernameSame", value: username };
  if ((await checkUsername(username)) !== "available") return { error: "usernameTaken", value: username };

  const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id);
  if (error) {
    if (error.code === "23505" || error.code === "23514") return { error: "usernameTaken", value: username };
    if (error.message.includes("username_cooldown")) return { error: "usernameWait", until: error.hint ?? undefined, value: username };
    console.error("changeUsername", error.message);
    return { error: "generic", value: username };
  }
  revalidatePath("/account");
  redirect("/account?usernameChanged=1");
}
