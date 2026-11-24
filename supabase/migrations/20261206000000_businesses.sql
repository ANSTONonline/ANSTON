-- =============================================================================
-- Verified business pages
--
-- A member can create one business page: name, type, about, logo, hours,
-- address and contact details. To go public it must be verified: the owner
-- uploads proof (state registration / LLC certificate, IRS EIN letter, or a
-- business license) and an Anston admin approves it. Only verified pages are
-- visible to the public, with a "Verified business" badge.
--
-- Proof documents live in a PRIVATE bucket: only the owner and admins can
-- read them.
--
-- Status: draft → pending (submitted) → verified | rejected; admins can also
-- suspend. Changing the legal details of a verified business sends it back to
-- pending.
-- =============================================================================

create table if not exists public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null unique references public.profiles (id) on delete cascade,
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name                text not null check (char_length(name) between 2 and 80),
  business_type       text not null check (business_type in (
                        'food', 'retail', 'beauty', 'health', 'home', 'auto', 'professional',
                        'events', 'education', 'pets', 'realestate', 'other')),
  about               text not null default '' check (char_length(about) <= 3000),
  logo_path           text check (logo_path is null or char_length(logo_path) <= 200),
  phone               text check (phone is null or char_length(phone) <= 40),
  email               text check (email is null or char_length(email) <= 200),
  website             text check (website is null or (website ~ '^https?://' and char_length(website) <= 300)),
  address             text check (address is null or char_length(address) <= 200),
  city                text check (city is null or char_length(city) <= 100),
  region              text check (region is null or char_length(region) <= 100),
  country_code        char(2),
  hours               jsonb,
  time_zone           text check (time_zone is null or char_length(time_zone) <= 64),
  -- Legal details checked against the documents (not shown publicly except the legal name).
  legal_name          text not null check (char_length(legal_name) between 2 and 160),
  registration_region text check (registration_region is null or char_length(registration_region) <= 100),
  registration_number text check (registration_number is null or char_length(registration_number) <= 60),
  status              text not null default 'draft' check (status in ('draft', 'pending', 'verified', 'rejected', 'suspended')),
  review_note         text check (review_note is null or char_length(review_note) <= 1000),
  submitted_at        timestamptz,
  verified_at         timestamptz,
  reviewed_by         uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint businesses_logo_own_folder check (logo_path is null or logo_path like owner_id::text || '/%')
);
create index if not exists businesses_public on public.businesses (status, country_code, region, city);

drop trigger if exists businesses_updated_at on public.businesses;
create trigger businesses_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;

drop policy if exists "Verified businesses are public" on public.businesses;
create policy "Verified businesses are public" on public.businesses for select
  using (status = 'verified' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "Members create their business" on public.businesses;
create policy "Members create their business" on public.businesses for insert to authenticated
  with check (owner_id = auth.uid() and status = 'draft');

drop policy if exists "Owners edit their business" on public.businesses;
create policy "Owners edit their business" on public.businesses for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Owners delete their business" on public.businesses;
create policy "Owners delete their business" on public.businesses for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

-- Owners can't verify themselves. They may only submit (draft/rejected →
-- pending). Changing the name or legal details of a verified business needs a new review.
create or replace function public.protect_business_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  new.owner_id := old.owner_id;
  new.reviewed_by := old.reviewed_by;
  new.verified_at := old.verified_at;
  new.review_note := old.review_note;
  if old.status = 'suspended' then
    new.status := 'suspended';
  elsif new.status is distinct from old.status then
    if not (new.status = 'pending' and old.status in ('draft', 'rejected')) then
      new.status := old.status;
    else
      new.submitted_at := now();
    end if;
  end if;
  if old.status = 'verified' and (new.name is distinct from old.name or new.legal_name is distinct from old.legal_name
       or new.registration_region is distinct from old.registration_region
       or new.registration_number is distinct from old.registration_number) then
    new.status := 'pending';
    new.submitted_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists businesses_protect_review on public.businesses;
create trigger businesses_protect_review before update on public.businesses
  for each row execute function public.protect_business_review();

-- -----------------------------------------------------------------------------
-- Proof documents (private)
-- -----------------------------------------------------------------------------
create table if not exists public.business_documents (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  kind         text not null check (kind in ('registration', 'ein_letter', 'license', 'other')),
  storage_path text not null unique check (char_length(storage_path) <= 200),
  file_name    text not null default '' check (char_length(file_name) <= 200),
  uploaded_at  timestamptz not null default now()
);
alter table public.business_documents enable row level security;

drop policy if exists "Owners and admins see business documents" on public.business_documents;
create policy "Owners and admins see business documents" on public.business_documents for select
  using (public.is_admin() or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

drop policy if exists "Owners add business documents" on public.business_documents;
create policy "Owners add business documents" on public.business_documents for insert to authenticated
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid())
              and storage_path like auth.uid()::text || '/%');

drop policy if exists "Owners remove business documents" on public.business_documents;
create policy "Owners remove business documents" on public.business_documents for delete to authenticated
  using (public.is_admin() or exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-docs', 'business-docs', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners and admins read business docs" on storage.objects;
create policy "Owners and admins read business docs" on storage.objects for select to authenticated
  using (bucket_id = 'business-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "Owners upload business docs" on storage.objects;
create policy "Owners upload business docs" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Owners and admins delete business docs" on storage.objects;
create policy "Owners and admins delete business docs" on storage.objects for delete to authenticated
  using (bucket_id = 'business-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- -----------------------------------------------------------------------------
-- Admin review
-- -----------------------------------------------------------------------------
create or replace function public.review_business(p_business uuid, p_decision text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('verified', 'rejected', 'suspended') then
    raise exception 'bad_decision' using errcode = 'check_violation';
  end if;
  update public.businesses
     set status = p_decision,
         review_note = nullif(left(coalesce(trim(p_note), ''), 1000), ''),
         reviewed_by = auth.uid(),
         verified_at = case when p_decision = 'verified' then now() else verified_at end
   where id = p_business;
end;
$$;
revoke all on function public.review_business(uuid, text, text) from public, anon;
grant execute on function public.review_business(uuid, text, text) to authenticated;

-- Emails: admins hear about submissions; owners hear the decision.
create or replace function private.on_business_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin record;
begin
  if new.status = 'pending' and old.status is distinct from 'pending' then
    for admin in select id from public.profiles where is_admin loop
      perform private.notify(admin.id, 'Business to verify: ' || left(new.name, 80), 'A business is waiting for verification',
        '"' || left(new.name, 120) || '" (' || left(new.legal_name, 120) || ') submitted its documents.',
        '/admin/businesses', 'Review it');
    end loop;
  elsif new.status = 'verified' and old.status is distinct from 'verified' then
    perform private.notify(new.owner_id, 'Your business is verified', 'You''re verified!',
      '"' || left(new.name, 120) || '" is now live on Anston with a Verified business badge.',
      '/business/' || new.slug, 'See your page');
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform private.notify(new.owner_id, 'We couldn''t verify your business', 'Your business needs another look',
      coalesce('Note from Anston: ' || new.review_note || ' ', '') || 'You can update your details or documents and submit again.',
      '/account/business', 'Update and resubmit');
  end if;
  return new;
end;
$$;
revoke all on function private.on_business_status() from public, anon, authenticated;

drop trigger if exists businesses_status_email on public.businesses;
create trigger businesses_status_email after update of status on public.businesses
  for each row execute function private.on_business_status();
