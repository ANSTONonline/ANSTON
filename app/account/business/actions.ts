"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { WEEKDAYS, isTimeZone, minutesFromTime, type Availability } from "@/lib/availability";
import { BUSINESS_TYPES, DOC_BUCKET, DOC_KINDS, slugify } from "@/lib/business";
import { AVATAR_BUCKET } from "@/lib/avatar";

export type BusinessFormState = { error?: string; saved?: boolean };

const text = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const orNull = (s: string) => (s ? s : null);

// Create or update the member's business page. New pages start as drafts;
// they go public only after Anston verifies them.
export async function saveBusiness(_prev: BusinessFormState, fd: FormData): Promise<BusinessFormState> {
  const member = await requireMember();
  if (member.profile?.is_suspended) return { error: "generic" };
  const name = text(fd, "name", 80);
  const legalName = text(fd, "legal_name", 160);
  const type = text(fd, "business_type");
  if (name.length < 2) return { error: "name" };
  if (legalName.length < 2) return { error: "legalName" };
  if (!(BUSINESS_TYPES as readonly string[]).includes(type)) return { error: "type" };

  let website = text(fd, "website", 300);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(website)) return { error: "website" };
  const email = text(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "email" };

  // Opening hours (optional): one time range per ticked day.
  const hours: Availability = {};
  for (const day of WEEKDAYS) {
    if (fd.get(`avail_${day}_on`) !== "on") continue;
    const from = minutesFromTime(text(fd, `avail_${day}_from`));
    const to = minutesFromTime(text(fd, `avail_${day}_to`));
    if (from === null || to === null || to <= from) return { error: "hours" };
    hours[String(day)] = [[from, to]];
  }
  const tz = isTimeZone(text(fd, "time_zone")) ? text(fd, "time_zone") : null;

  const logo = text(fd, "logo");
  if (logo && !new RegExp(`^${member.user.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(logo)) return { error: "generic" };
  const country = text(fd, "country_code", 2).toUpperCase();

  const fields = {
    name,
    business_type: type,
    about: text(fd, "about", 3000),
    logo_path: orNull(logo),
    phone: orNull(text(fd, "phone", 40)),
    email: orNull(email),
    website: orNull(website),
    address: orNull(text(fd, "address")),
    city: orNull(text(fd, "city", 100)),
    region: orNull(text(fd, "region", 100)),
    country_code: /^[A-Z]{2}$/.test(country) ? country : null,
    hours: Object.keys(hours).length ? hours : null,
    time_zone: tz,
    legal_name: legalName,
    registration_region: orNull(text(fd, "registration_region", 100)),
    registration_number: orNull(text(fd, "registration_number", 60)),
  };

  const { data: existing } = await member.supabase.from("businesses").select("id, logo_path").eq("owner_id", member.user.id).maybeSingle();
  if (existing) {
    const { error } = await member.supabase.from("businesses").update(fields).eq("id", existing.id);
    if (error) {
      console.error("update business", error.message);
      return { error: "generic" };
    }
    if (existing.logo_path && existing.logo_path !== fields.logo_path) {
      await member.supabase.storage.from(AVATAR_BUCKET).remove([existing.logo_path]);
    }
  } else {
    // A web address for the page, made from the name (numbered if taken).
    const base = slugify(name).padEnd(3, "0") || "business";
    let saved = false;
    for (let n = 1; n <= 20 && !saved; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const { error } = await member.supabase.from("businesses").insert({ ...fields, owner_id: member.user.id, slug });
      if (!error) saved = true;
      else if (!error.message.includes("slug")) {
        console.error("create business", error.message);
        return { error: "generic" };
      }
    }
    if (!saved) return { error: "generic" };
  }
  revalidatePath("/account/business");
  return { saved: true };
}

// Record a proof document the owner just uploaded to their private folder.
export async function addBusinessDocument(kind: string, path: string, fileName: string) {
  const member = await requireMember();
  if (!(DOC_KINDS as readonly string[]).includes(kind)) return { error: true };
  if (!new RegExp(`^${member.user.id}/[0-9a-f-]{36}\\.(pdf|jpg|jpeg|png|webp|heic|heif)$`).test(path)) return { error: true };
  const { data: biz } = await member.supabase.from("businesses").select("id").eq("owner_id", member.user.id).maybeSingle();
  if (!biz) return { error: true };
  const { error } = await member.supabase
    .from("business_documents")
    .insert({ business_id: biz.id, kind, storage_path: path, file_name: fileName.slice(0, 200) });
  if (error) {
    console.error("add document", error.message);
    await member.supabase.storage.from(DOC_BUCKET).remove([path]);
    return { error: true };
  }
  revalidatePath("/account/business");
  return { ok: true };
}

export async function removeBusinessDocument(fd: FormData) {
  const member = await requireMember();
  const id = text(fd, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { data: doc } = await member.supabase.from("business_documents").select("id, storage_path").eq("id", id).maybeSingle();
  if (!doc) return;
  await member.supabase.from("business_documents").delete().eq("id", doc.id);
  await member.supabase.storage.from(DOC_BUCKET).remove([doc.storage_path]);
  revalidatePath("/account/business");
}

// Send the page and documents to Anston for verification.
export async function submitBusiness() {
  const member = await requireMember();
  const { data: biz } = await member.supabase.from("businesses").select("id, status").eq("owner_id", member.user.id).maybeSingle();
  if (!biz) redirect("/account/business");
  const { count } = await member.supabase.from("business_documents").select("id", { count: "exact", head: true }).eq("business_id", biz.id);
  if (!count) redirect("/account/business?error=docs");
  const { error } = await member.supabase.from("businesses").update({ status: "pending" }).eq("id", biz.id);
  if (error) console.error("submit business", error.message);
  revalidatePath("/account/business");
  redirect("/account/business?submitted=1");
}
