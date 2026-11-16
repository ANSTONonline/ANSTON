"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/member";

const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

// Every admin action starts here. The database checks admin rights too, so
// this is a friendly first gate, not the only one.
async function requireAdmin() {
  const member = await requireMember();
  const { data } = await member.supabase.from("profiles").select("is_admin").eq("id", member.user.id).maybeSingle();
  if (!data?.is_admin) notFound();
  return member;
}

function refresh(listingId?: string | null) {
  revalidatePath("/admin");
  revalidatePath("/browse");
  revalidatePath("/");
  if (listingId) revalidatePath(`/listing/${listingId}`);
}

// Close a report: dismiss it, remove the listing, or remove the listing and
// suspend the seller. Removing closes every open report on that listing.
export async function resolveReport(fd: FormData) {
  const admin = await requireAdmin();
  const supabase = admin.supabase;
  const id = text(fd, "id");
  const outcome = text(fd, "outcome");
  if (!isId(id) || !["dismiss", "hold", "remove", "suspend"].includes(outcome)) return;

  const { data: report } = await supabase
    .from("reports")
    .select("id, listing_id, listing:listings ( seller_id )")
    .eq("id", id)
    .maybeSingle();
  if (!report) return;
  const done = { resolved_by: admin.user.id, resolved_at: new Date().toISOString() };

  if (outcome === "dismiss") {
    await supabase.from("reports").update({ status: "dismissed", ...done }).eq("id", id);
    refresh(report.listing_id);
    return;
  }

  const listing = report.listing as unknown as { seller_id: string } | null;
  if (report.listing_id) {
    // "hold" suspends the listing while you look into it; the others remove it.
    const status = outcome === "hold" ? "suspended" : "removed";
    const { error } = await supabase.from("listings").update({ status }).eq("id", report.listing_id);
    if (error) console.error("resolveReport remove", error.message);
    await supabase
      .from("reports")
      .update({ status: "actioned", ...done })
      .eq("listing_id", report.listing_id)
      .in("status", ["open", "reviewing"]);
  } else {
    await supabase.from("reports").update({ status: "actioned", ...done }).eq("id", id);
  }

  if (outcome === "suspend" && listing?.seller_id) {
    const { error } = await supabase.from("profiles").update({ is_suspended: true }).eq("id", listing.seller_id);
    if (error) console.error("resolveReport suspend", error.message);
    await supabase
      .from("listings")
      .update({ status: "removed" })
      .eq("seller_id", listing.seller_id)
      .in("status", ["active", "paused", "draft"]);
  }
  refresh(report.listing_id);
}

// Suspend a listing (hidden while you review it) or bring it back.
export async function setListingSuspended(fd: FormData) {
  const admin = await requireAdmin();
  const id = text(fd, "id");
  const suspended = text(fd, "suspended") === "true";
  if (!isId(id)) return;
  const { error } = await admin.supabase
    .from("listings")
    .update({ status: suspended ? "suspended" : "active" })
    .eq("id", id);
  if (error) console.error("setListingSuspended", error.message);
  refresh(id);
  const back = text(fd, "back");
  if (back.startsWith("/admin/members/")) revalidatePath(back);
}

// Undo tools, for mistakes.
export async function restoreListing(fd: FormData) {
  const admin = await requireAdmin();
  const id = text(fd, "id");
  if (!isId(id)) return;
  const { error } = await admin.supabase.from("listings").update({ status: "active" }).eq("id", id);
  if (error) console.error("restoreListing", error.message);
  refresh(id);
}

export async function setSuspended(fd: FormData) {
  const admin = await requireAdmin();
  const id = text(fd, "id");
  const suspended = text(fd, "suspended") === "true";
  if (!isId(id) || id === admin.user.id) return;
  const { error } = await admin.supabase.from("profiles").update({ is_suspended: suspended }).eq("id", id);
  if (error) console.error("setSuspended", error.message);
  refresh();
  revalidatePath(`/admin/members/${id}`);
}
