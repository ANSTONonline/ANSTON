// Works in the browser too (the URL is public).
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Profile photos live in the public "avatars" bucket, under <user id>/...
export const AVATAR_BUCKET = "avatars";
export const GENDERS = ["female", "male"] as const;
export type Gender = (typeof GENDERS)[number];

export function avatarUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}
