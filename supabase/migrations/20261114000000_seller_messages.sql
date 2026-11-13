-- =============================================================================
-- Anston: let sellers message a buyer, but only after a purchase.
-- Buyers can message sellers at any time (unchanged). A seller can start a
-- conversation only with someone who bought from that listing:
--   * an offer the seller accepted
--   * a rental or booking the seller confirmed (or completed)
--   * the winning bid on an auction that has ended
--   * a paid order (once checkout is live)
-- Run after 20261113000000_listings_and_photos.sql.
-- =============================================================================

drop function if exists public.has_dealt_with(uuid, uuid);

create or replace function public.has_bought(p_listing uuid, p_buyer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.offers
                 where listing_id = p_listing and buyer_id = p_buyer and status = 'accepted')
      or exists (select 1 from public.reservations
                 where listing_id = p_listing and renter_id = p_buyer and status in ('confirmed', 'completed'))
      or exists (select 1 from public.orders
                 where listing_id = p_listing and buyer_id = p_buyer
                   and status in ('paid', 'fulfilled', 'completed'))
      or exists (select 1 from public.listing_modes m
                 where m.listing_id = p_listing and m.mode = 'auction' and m.ends_at <= now()
                   and (select b.bidder_id from public.bids b where b.listing_id = p_listing
                        order by b.amount_cents desc, b.created_at asc limit 1) = p_buyer);
$$;

drop policy if exists "Sellers message their buyers" on public.conversations;
create policy "Sellers message their buyers" on public.conversations for insert
  with check (
    seller_id = auth.uid()
    and buyer_id <> auth.uid()
    and public.owns_listing(listing_id)
    and public.has_bought(listing_id, buyer_id)
  );
