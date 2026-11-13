-- =============================================================================
-- Anston: let sellers message a buyer once the buyer has shown interest.
-- Buyers can message sellers at any time (unchanged). A seller can start a
-- conversation only with someone who already made an offer on, bid on, asked
-- to rent or book, or ordered that listing. The buyer always makes the first
-- move, so sellers can't message strangers.
-- Run after 20261113000000_listings_and_photos.sql.
-- =============================================================================

drop policy if exists "Sellers message their buyers" on public.conversations;
drop function if exists public.has_dealt_with(uuid, uuid);
drop function if exists public.has_bought(uuid, uuid);

create or replace function public.has_interacted(p_listing uuid, p_buyer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offers where listing_id = p_listing and buyer_id = p_buyer)
      or exists (select 1 from public.reservations where listing_id = p_listing and renter_id = p_buyer)
      or exists (select 1 from public.bids where listing_id = p_listing and bidder_id = p_buyer)
      or exists (select 1 from public.orders where listing_id = p_listing and buyer_id = p_buyer);
$$;

create policy "Sellers message their buyers" on public.conversations for insert
  with check (
    seller_id = auth.uid()
    and buyer_id <> auth.uid()
    and public.owns_listing(listing_id)
    and public.has_interacted(listing_id, buyer_id)
  );
