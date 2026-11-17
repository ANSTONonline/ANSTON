-- =============================================================================
-- Payments with Stripe Connect
--
-- Sellers connect their own Stripe account ("Stripe handles pricing"): Stripe
-- charges the seller its normal processing fee on each sale, and Anston only
-- receives the seller's chosen boost fee. Buyers pay on Stripe Checkout.
--
-- The website never holds a database master key. Changes only the server
-- should make (saving a seller's Stripe account, marking an order paid) go
-- through functions that require a server secret, stored in Supabase Vault as
-- 'anston_server_secret' and in Vercel as ANSTON_SERVER_SECRET.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Server secret check
-- -----------------------------------------------------------------------------
create or replace function private.require_server_secret(p_secret text)
returns void language plpgsql security definer set search_path = public as $$
declare
  expected text;
begin
  select decrypted_secret into expected from vault.decrypted_secrets where name = 'anston_server_secret' limit 1;
  if expected is null or expected = '' or p_secret is null or p_secret <> expected then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seller payout accounts
-- -----------------------------------------------------------------------------
create table if not exists public.payout_accounts (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.payout_accounts enable row level security;

drop policy if exists "Members see their own payout account" on public.payout_accounts;
create policy "Members see their own payout account" on public.payout_accounts
  for select using (user_id = auth.uid() or public.is_admin());
-- No insert/update/delete policies: only the functions below can change rows.

drop trigger if exists payout_accounts_updated_at on public.payout_accounts;
create trigger payout_accounts_updated_at before update on public.payout_accounts
  for each row execute function public.set_updated_at();

-- The server saves (or refreshes) the signed-in member's Stripe account.
create or replace function public.save_payout_account(
  p_account text, p_charges boolean, p_payouts boolean, p_secret text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  insert into public.payout_accounts (user_id, stripe_account_id, charges_enabled, payouts_enabled)
  values (auth.uid(), p_account, coalesce(p_charges, false), coalesce(p_payouts, false))
  on conflict (user_id) do update
    set stripe_account_id = excluded.stripe_account_id,
        charges_enabled   = excluded.charges_enabled,
        payouts_enabled   = excluded.payouts_enabled;
end;
$$;

-- Stripe webhooks refresh an account's status by its Stripe id.
create or replace function public.refresh_payout_account(
  p_account text, p_charges boolean, p_payouts boolean, p_secret text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  update public.payout_accounts
     set charges_enabled = coalesce(p_charges, false), payouts_enabled = coalesce(p_payouts, false)
   where stripe_account_id = p_account;
end;
$$;

-- Can buyers pay this seller online? (Public: true/false only.)
create or replace function public.seller_accepts_payments(p_seller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select charges_enabled from public.payout_accounts where user_id = p_seller), false);
$$;

-- -----------------------------------------------------------------------------
-- Orders: shipping price, ship-to address
-- -----------------------------------------------------------------------------
alter table public.listings
  add column if not exists shipping_cents bigint not null default 0 check (shipping_cents between 0 and 100000000);

alter table public.orders
  add column if not exists ship_to jsonb,
  add column if not exists stripe_account_id text; -- the seller's Stripe account that took the payment

-- Start an order for the signed-in buyer. The price always comes from the
-- database (the listing's Buy Now price, or the buyer's accepted offer),
-- never from the browser. Returns what the server needs to open Checkout.
create or replace function public.start_order(p_listing uuid, p_offer uuid default null)
returns table (
  order_id uuid, stripe_account_id text, title text, currency text,
  subtotal_cents bigint, shipping_cents bigint, platform_fee_cents bigint, ships boolean
)
language plpgsql security definer set search_path = public as $$
declare
  buyer   uuid := auth.uid();
  l       public.listings;
  acct    public.payout_accounts;
  price   bigint;
  ship    bigint := 0;
  fee     bigint;
  existing uuid;
  holds   int;
begin
  if buyer is null then
    raise exception 'not_signed_in' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.profiles where id = buyer and is_suspended) then
    raise exception 'account_suspended' using errcode = 'insufficient_privilege';
  end if;

  select * into l from public.listings where id = p_listing;
  if l.id is null or l.status <> 'active' then
    raise exception 'listing_unavailable' using errcode = 'check_violation';
  end if;
  if l.seller_id = buyer then
    raise exception 'own_listing' using errcode = 'check_violation';
  end if;

  select * into acct from public.payout_accounts where user_id = l.seller_id;
  if acct.user_id is null or not acct.charges_enabled then
    raise exception 'seller_not_ready' using errcode = 'check_violation';
  end if;

  if p_offer is not null then
    select o.amount_cents into price from public.offers o
     where o.id = p_offer and o.listing_id = l.id and o.buyer_id = buyer and o.status = 'accepted';
    if price is null then
      raise exception 'offer_not_accepted' using errcode = 'check_violation';
    end if;
  else
    select m.price_cents into price from public.listing_modes m where m.listing_id = l.id and m.mode = 'sale';
    if price is null then
      raise exception 'not_for_sale' using errcode = 'check_violation';
    end if;
  end if;

  -- Don't sell more than the listing has: count paid orders and checkouts
  -- started in the last 30 minutes (a Checkout page stays open that long).
  select count(*) into holds from public.orders o
   where o.listing_id = l.id
     and (o.status in ('paid', 'fulfilled', 'completed')
          or (o.status = 'pending_payment' and o.created_at > now() - interval '30 minutes' and o.buyer_id <> buyer));
  if l.quantity < 1 or holds >= l.quantity then
    raise exception 'sold_out' using errcode = 'check_violation';
  end if;

  if l.ships then
    ship := l.shipping_cents;
  end if;
  fee := round(price * l.boost_bps / 10000.0);

  -- Reuse this buyer's recent unpaid order for the same item, if any.
  select o.id into existing from public.orders o
   where o.listing_id = l.id and o.buyer_id = buyer and o.status = 'pending_payment'
     and o.offer_id is not distinct from p_offer and o.created_at > now() - interval '30 minutes'
   order by o.created_at desc limit 1;

  if existing is null then
    insert into public.orders (listing_id, buyer_id, seller_id, mode, offer_id, quantity, currency,
                               subtotal_cents, shipping_cents, platform_fee_bps, platform_fee_cents, boost_bps,
                               stripe_account_id)
    values (l.id, buyer, l.seller_id, 'sale', p_offer, 1, l.currency,
            price, ship, l.boost_bps, fee, l.boost_bps, acct.stripe_account_id)
    returning id into existing;
  else
    update public.orders
       set subtotal_cents = price, shipping_cents = ship, platform_fee_bps = l.boost_bps,
           platform_fee_cents = fee, boost_bps = l.boost_bps, currency = l.currency,
           created_at = now(), stripe_checkout_session_id = null, stripe_account_id = acct.stripe_account_id
     where id = existing;
  end if;

  return query select existing, acct.stripe_account_id, l.title, l.currency::text, price, ship, fee, l.ships;
end;
$$;

-- The server links the Stripe Checkout page to the order.
create or replace function public.attach_checkout_session(p_order uuid, p_session text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  update public.orders set stripe_checkout_session_id = p_session
   where id = p_order and status = 'pending_payment';
end;
$$;

-- The server marks an order paid after checking with Stripe. Safe to call
-- twice (from the return page and from the webhook).
create or replace function public.mark_order_paid(
  p_order uuid, p_session text, p_payment_intent text, p_ship_to jsonb, p_secret text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  perform private.require_server_secret(p_secret);
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.stripe_checkout_session_id is distinct from p_session then
    return false;
  end if;
  if o.status <> 'pending_payment' then
    return true; -- already recorded
  end if;
  update public.orders
     set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent, ship_to = p_ship_to
   where id = o.id;
  update public.listings
     set quantity = greatest(quantity - o.quantity, 0),
         status = case when quantity - o.quantity <= 0 then 'sold' else status end
   where id = o.listing_id;
  return true;
end;
$$;

-- Emails when an order is paid: the seller made a sale, the buyer's order is confirmed.
create or replace function private.on_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  title text := coalesce(private.title_of(new.listing_id), 'your item');
begin
  if old.status = 'pending_payment' and new.status = 'paid' then
    perform private.notify(
      new.seller_id,
      'You made a sale!',
      'You sold "' || left(title, 120) || '"',
      private.username_of(new.buyer_id) || ' paid for "' || left(title, 120) || '". '
        || case when new.ship_to is not null then 'Ship it soon and add the tracking number on the order page.'
                else 'Message the buyer to arrange pickup.' end,
      '/account/orders/' || new.id,
      'View the order'
    );
    perform private.notify(
      new.buyer_id,
      'Order confirmed',
      'Thanks for your order',
      'Your payment for "' || left(title, 120) || '" went through. You can follow your order on Anston.',
      '/account/orders/' || new.id,
      'View your order'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_paid_email on public.orders;
create trigger orders_paid_email after update of status on public.orders
  for each row execute function private.on_order_paid();

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.save_payout_account(text, boolean, boolean, text) from public, anon;
revoke all on function public.refresh_payout_account(text, boolean, boolean, text) from public;
revoke all on function public.start_order(uuid, uuid) from public, anon;
revoke all on function public.attach_checkout_session(uuid, text, text) from public;
revoke all on function public.mark_order_paid(uuid, text, text, jsonb, text) from public;
grant execute on function public.save_payout_account(text, boolean, boolean, text) to authenticated;
grant execute on function public.refresh_payout_account(text, boolean, boolean, text) to anon, authenticated;
grant execute on function public.start_order(uuid, uuid) to authenticated;
grant execute on function public.attach_checkout_session(uuid, text, text) to anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.seller_accepts_payments(uuid) to anon, authenticated;
