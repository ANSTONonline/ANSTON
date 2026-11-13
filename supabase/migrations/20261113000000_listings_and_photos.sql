-- =============================================================================
-- Anston: listing photos, and safety rules for offers, requests and messages
-- Run after 20261112000000_usernames_and_age.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Photo storage. Each user uploads into a folder named after their user id,
-- e.g. listing-images/<user id>/<random>.jpg. Anyone can view the photos.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Listing photos are public" on storage.objects;
create policy "Listing photos are public" on storage.objects for select
  using (bucket_id = 'listing-images');

drop policy if exists "Users upload their own listing photos" on storage.objects;
create policy "Users upload their own listing photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own listing photos" on storage.objects;
create policy "Users delete their own listing photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Offers: the buyer may only withdraw; the seller may only accept or decline.
-- Nobody may change the amount, listing or buyer after the offer is made.
-- -----------------------------------------------------------------------------
create or replace function public.protect_offer_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_seller boolean := public.owns_listing(old.listing_id);
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.listing_id <> old.listing_id or new.buyer_id <> old.buyer_id
     or new.amount_cents <> old.amount_cents or new.message is distinct from old.message then
    raise exception 'Offers cannot be edited' using errcode = 'check_violation';
  end if;
  if new.status <> old.status then
    if old.status <> 'pending' then
      raise exception 'This offer has already been answered' using errcode = 'check_violation';
    end if;
    if is_seller and new.status not in ('accepted', 'declined') then
      raise exception 'Sellers can accept or decline offers' using errcode = 'check_violation';
    end if;
    if not is_seller and (old.buyer_id <> auth.uid() or new.status <> 'withdrawn') then
      raise exception 'Buyers can only withdraw their offers' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists offers_protect on public.offers;
create trigger offers_protect before update on public.offers
  for each row execute function public.protect_offer_update();

-- -----------------------------------------------------------------------------
-- Rental and booking requests: the renter may only cancel; the seller may
-- confirm, cancel or mark completed. Dates can't be changed afterwards.
-- -----------------------------------------------------------------------------
create or replace function public.protect_reservation_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_seller boolean := public.owns_listing(old.listing_id);
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.listing_id <> old.listing_id or new.renter_id <> old.renter_id
     or new.period <> old.period or new.mode <> old.mode or new.notes is distinct from old.notes then
    raise exception 'Requests cannot be edited' using errcode = 'check_violation';
  end if;
  if new.status <> old.status then
    if is_seller and not (
         (old.status = 'requested' and new.status in ('confirmed', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('completed', 'cancelled'))) then
      raise exception 'That change is not allowed' using errcode = 'check_violation';
    end if;
    if not is_seller and (old.renter_id <> auth.uid()
                          or old.status not in ('requested', 'confirmed')
                          or new.status <> 'cancelled') then
      raise exception 'You can only cancel your request' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_protect on public.reservations;
create trigger reservations_protect before update on public.reservations
  for each row execute function public.protect_reservation_update();

-- -----------------------------------------------------------------------------
-- Messages: once sent, only the read time can change, and only the person who
-- received the message can mark it read.
-- -----------------------------------------------------------------------------
create or replace function public.protect_message_update()
returns trigger language plpgsql as $$
begin
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  if new.body <> old.body or new.sender_id <> old.sender_id
     or new.conversation_id <> old.conversation_id or new.created_at <> old.created_at then
    raise exception 'Messages cannot be edited' using errcode = 'check_violation';
  end if;
  if new.read_at is distinct from old.read_at and old.sender_id = auth.uid() then
    raise exception 'Only the recipient can mark a message read' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_protect on public.messages;
create trigger messages_protect before update on public.messages
  for each row execute function public.protect_message_update();

-- Sellers may delete their own listings in any state (removing photos and
-- modes with them). Listings with orders are kept because orders reference them.
drop policy if exists "Sellers delete own drafts" on public.listings;
drop policy if exists "Sellers delete own listings" on public.listings;
create policy "Sellers delete own listings" on public.listings for delete
  using (seller_id = auth.uid() or public.is_admin());
