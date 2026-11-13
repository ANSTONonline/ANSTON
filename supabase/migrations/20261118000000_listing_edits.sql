-- =============================================================================
-- Anston: editing listings.
-- Once an auction has bids, its prices and end time are fixed and it can't be
-- removed, so bidders aren't treated unfairly. (Deleting a listing that has
-- bids is also refused; the site hides it instead.)
-- Run after 20261113000000_listings_and_photos.sql.
-- =============================================================================

create or replace function public.protect_auction_with_bids()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return coalesce(new, old);
  end if;
  if old.mode = 'auction' and exists (select 1 from public.bids where listing_id = old.listing_id) then
    if tg_op = 'DELETE' then
      raise exception 'auction_has_bids' using errcode = 'check_violation';
    end if;
    if new.mode <> old.mode
       or new.start_price_cents is distinct from old.start_price_cents
       or new.buy_now_price_cents is distinct from old.buy_now_price_cents
       or new.reserve_price_cents is distinct from old.reserve_price_cents
       or new.min_increment_cents is distinct from old.min_increment_cents
       or new.ends_at is distinct from old.ends_at then
      raise exception 'auction_has_bids' using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists listing_modes_protect_auction on public.listing_modes;
create trigger listing_modes_protect_auction before update or delete on public.listing_modes
  for each row execute function public.protect_auction_with_bids();
