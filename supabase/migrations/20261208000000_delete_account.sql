-- =============================================================================
-- Delete account
--
-- Members can delete their own account from Account settings (required by the
-- App Store and Google Play). public.delete_my_account():
--
--   * refuses while the member has orders in progress (paid / shipped /
--     disputed, an open refund request, or an upcoming confirmed rental or
--     booking), so nobody is left without their item or their money;
--   * refuses while Anston is holding money for them as a seller
--     (payout_status = 'held'). Held money is never refunded automatically, so
--     they set up "Get paid" first and the money is sent to them;
--   * deletes their listings, bids, pending offers, requests, favorites,
--     conversations, saved addresses, payout account and business page.
--     Listings that already have orders are marked removed instead;
--   * with no order history at all, deletes the login completely;
--   * with past orders, keeps those orders (the other member and Anston's tax
--     records need them) but erases everything that identifies the member:
--     the profile becomes "@deleted_…" and the login's email, password,
--     phone and sign-in methods are wiped, so it can never be used again.
--
-- Photos in storage are removed by the app before this runs (Supabase does
-- not allow deleting storage files from SQL).
-- =============================================================================

alter table public.profiles add column if not exists deleted_at timestamptz;

-- Why the signed-in member can't delete their account yet: 'open_orders',
-- 'held_money', or null when nothing is in the way. The app checks this before
-- removing their photos, and delete_my_account() checks it again.
create or replace function public.account_deletion_blocker()
returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from public.orders o
       where (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
         and o.status in ('paid', 'fulfilled', 'disputed')
    ) or exists (
      select 1 from public.refund_requests r
       where (r.buyer_id = auth.uid() or r.seller_id = auth.uid()) and r.status = 'open'
    ) or exists (
      select 1 from public.reservations r
        join public.listings l on l.id = r.listing_id
       where (r.renter_id = auth.uid() or l.seller_id = auth.uid())
         and r.status = 'confirmed' and upper(r.period) > now()
    ) then 'open_orders'
    when exists (
      select 1 from public.orders o where o.seller_id = auth.uid() and o.payout_status = 'held'
    ) then 'held_money'
  end;
$$;

revoke all on function public.account_deletion_blocker() from public, anon;
grant execute on function public.account_deletion_blocker() to authenticated;

create or replace function public.delete_my_account()
returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  has_orders boolean;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'insufficient_privilege';
  end if;

  case public.account_deletion_blocker()
    when 'open_orders' then
      raise exception 'open_orders' using errcode = 'check_violation',
        hint = 'Finish or cancel your orders in progress before deleting your account.';
    when 'held_money' then
      raise exception 'held_money' using errcode = 'check_violation',
        hint = 'Anston is holding money for you. Set up Get paid so we can send it before you delete your account.';
    else null;
  end case;

  -- From here on, act as the system rather than as the member: the triggers
  -- that limit what members can change (username cooldown, protected profile
  -- columns, removed listings) and the "an admin removed your listing" email
  -- only apply to requests made by a signed-in member.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);

  -- ---------------------------------------------------------------------------
  -- Things the member started
  -- ---------------------------------------------------------------------------
  -- Checkouts that were never paid.
  update public.orders set status = 'cancelled'
   where (buyer_id = me or seller_id = me) and status = 'pending_payment';

  delete from public.bids b
   using public.listings l
   where b.bidder_id = me and l.id = b.listing_id and l.status = 'active';
  delete from public.offers where buyer_id = me and status = 'pending';
  delete from public.reservations where renter_id = me and status = 'requested';
  delete from public.favorites where user_id = me;

  -- ---------------------------------------------------------------------------
  -- Their listings
  -- ---------------------------------------------------------------------------
  -- Listings with order history stay (orders point to them) but come down.
  update public.listings l set status = 'removed'
   where l.seller_id = me
     and exists (select 1 from public.orders o where o.listing_id = l.id);
  update public.offers o set status = 'expired'
    from public.listings l
   where l.id = o.listing_id and l.seller_id = me and o.status = 'pending';
  update public.reservations r set status = 'cancelled'
    from public.listings l
   where l.id = r.listing_id and l.seller_id = me and r.status = 'requested';

  -- The rest are deleted, with their photos, bids, offers and requests.
  delete from public.listings l
   where l.seller_id = me
     and not exists (select 1 from public.orders o where o.listing_id = l.id);

  -- ---------------------------------------------------------------------------
  -- Personal data
  -- ---------------------------------------------------------------------------
  delete from public.conversations where buyer_id = me or seller_id = me;
  delete from public.payout_accounts where user_id = me;
  delete from public.ship_from_addresses where user_id = me;
  delete from public.businesses where owner_id = me;
  update public.reports set reporter_id = null where reporter_id = me;
  delete from private.email_log where user_id = me;

  select exists (select 1 from public.orders where buyer_id = me or seller_id = me) into has_orders;

  if not has_orders then
    -- Nothing else needs this account: delete the login and, with it, the
    -- profile and everything else that belongs to it.
    delete from auth.users where id = me;
    return 'deleted';
  end if;

  -- Past orders exist: keep them, but nothing left can identify the member.
  update public.profiles set
    username            = 'deleted_' || substr(replace(me::text, '-', ''), 1, 12),
    display_name        = '',
    avatar_url          = null,
    bio                 = null,
    gender              = null,
    country_code        = null,
    region              = null,
    city                = null,
    stripe_account_id   = null,
    payouts_enabled     = false,
    email_notifications = false,
    deleted_at          = now()
   where id = me;

  update auth.users set
    email                = 'deleted+' || me::text || '@deleted.invalid',
    phone                = null,
    encrypted_password   = '',
    raw_user_meta_data   = '{}'::jsonb,
    email_change         = '',
    phone_change         = '',
    confirmation_token   = '',
    recovery_token       = '',
    banned_until         = 'infinity',
    deleted_at           = now()
   where id = me;
  delete from auth.identities  where user_id = me;
  delete from auth.mfa_factors where user_id = me;
  delete from auth.sessions    where user_id = me;
  delete from auth.refresh_tokens where user_id = me::text;

  return 'anonymized';
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
