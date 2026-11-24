-- =============================================================================
-- Profile photos and (optional) gender
--
-- Members can add a profile photo (shown on their profile, listings and
-- services). Photos live in the public "avatars" bucket, in a folder named
-- after the member's id; profiles.avatar_url stores that path.
--
-- Members can say their gender (female or male) or leave it blank ("prefer
-- not to say"). It's shown on services and lets people looking for a service
-- choose a provider's gender. It's only used for services.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile photos are public" on storage.objects;
create policy "Profile photos are public" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Members upload their own profile photo" on storage.objects;
create policy "Members upload their own profile photo" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Members delete their own profile photo" on storage.objects;
create policy "Members delete their own profile photo" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.profiles add column if not exists gender text
  check (gender is null or gender in ('female', 'male'));

-- A profile photo must be in the member's own folder.
alter table public.profiles drop constraint if exists profiles_avatar_own_folder;
alter table public.profiles add constraint profiles_avatar_own_folder
  check (avatar_url is null or (avatar_url like id::text || '/%' and char_length(avatar_url) <= 200));
