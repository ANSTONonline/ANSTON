-- =============================================================================
-- Anston: let sellers start a conversation with a buyer.
-- Only buyers who already bid on, made an offer on, or asked to rent or book
-- the seller's listing can be messaged first, so sellers can't spam strangers.
-- Run after 20261113000000_listings_and_photos.sql.
-- =============================================================================

create or replace function public.has_dealt_with(p_listing uuid, p_buyer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offers where listing_id = p_listing and buyer_id = p_buyer)
      or exists (select 1 from public.reservations where listing_id = p_listing and renter_id = p_buyer)
      or exists (select 1 from public.bids where listing_id = p_listing and bidder_id = p_buyer);
$$;

drop policy if exists "Sellers message their buyers" on public.conversations;
create policy "Sellers message their buyers" on public.conversations for insert
  with check (
    seller_id = auth.uid()
    and buyer_id <> auth.uid()
    and public.owns_listing(listing_id)
    and public.has_dealt_with(listing_id, buyer_id)
  );
