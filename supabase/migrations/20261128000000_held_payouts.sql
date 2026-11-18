-- =============================================================================
-- Held payouts
--
-- Buyers can pay any seller, whether or not the seller has set up "Get paid".
-- Payments are charged on Anston's Stripe account. Each paid order's money is
-- held for the seller (payout_status = 'held') and sent to the seller's
-- Stripe account once it can receive money ('sent'). Held money is never
-- refunded automatically; sellers get reminder emails instead.
--
-- The seller receives the price plus shipping, minus their boost and minus
-- their share of Stripe's card fee. The buyer's service fee stays with Anston.
-- =============================================================================

alter table public.orders
  add column if not exists stripe_charge_id text,
  add column if not exists payout_status text not null default 'none'
    check (payout_status in ('none', 'held', 'sent')),
  add column if not exists stripe_transfer_id text,
  add column if not exists payout_amount bigint,          -- in the smallest unit of payout_currency (Stripe's units)
  add column if not exists payout_currency text,
  add column if not exists payout_sent_at timestamptz,
  add column if not exists payout_reminded_at timestamptz;

create index if not exists orders_held_payouts on public.orders (seller_id) where payout_status = 'held';

-- Any active, unsuspended seller can be paid online now.
create or replace function public.seller_accepts_payments(p_seller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p_seller and not coalesce(is_suspended, false));
$$;

-- -----------------------------------------------------------------------------
-- Start an order: no longer needs the seller's Stripe account.
-- -----------------------------------------------------------------------------
drop function if exists public.start_order(uuid, uuid);

create or replace function public.start_order(p_listing uuid, p_offer uuid default null)
returns table (
  order_id uuid, title text, currency text, ship_country text,
  subtotal_cents bigint, shipping_cents bigint, service_fee_cents bigint, platform_fee_cents bigint, ships boolean
)
language plpgsql security definer set search_path = public as $$
declare
  buyer   uuid := auth.uid();
  l       public.listings;
  price   bigint;
  ship    bigint := 0;
  fee     bigint;
  svc     bigint;
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
  if exists (select 1 from public.profiles where id = l.seller_id and is_suspended) then
    raise exception 'listing_unavailable' using errcode = 'check_violation';
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
  -- Buyer's service fee (by price) plus the seller's boost both go to Anston.
  svc := round(price * public.buyer_fee_bps(price) / 10000.0);
  fee := round(price * l.boost_bps / 10000.0) + svc;

  -- Reuse this buyer's recent unpaid order for the same item, if any.
  select o.id into existing from public.orders o
   where o.listing_id = l.id and o.buyer_id = buyer and o.status = 'pending_payment'
     and o.offer_id is not distinct from p_offer and o.created_at > now() - interval '30 minutes'
   order by o.created_at desc limit 1;

  if existing is null then
    insert into public.orders (listing_id, buyer_id, seller_id, mode, offer_id, quantity, currency,
                               subtotal_cents, shipping_cents, service_fee_cents, platform_fee_bps, platform_fee_cents,
                               boost_bps)
    values (l.id, buyer, l.seller_id, 'sale', p_offer, 1, l.currency,
            price, ship, svc, l.boost_bps, fee, l.boost_bps)
    returning id into existing;
  else
    update public.orders
       set subtotal_cents = price, shipping_cents = ship, service_fee_cents = svc, platform_fee_bps = l.boost_bps,
           platform_fee_cents = fee, boost_bps = l.boost_bps, currency = l.currency,
           created_at = now(), stripe_checkout_session_id = null, stripe_account_id = null
     where id = existing;
  end if;

  return query select existing, l.title, l.currency::text, l.country_code::text, price, ship, svc, fee, l.ships;
end;
$$;

revoke all on function public.start_order(uuid, uuid) from public, anon;
grant execute on function public.start_order(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Mark paid: also records the Stripe charge and holds the seller's money.
-- -----------------------------------------------------------------------------
drop function if exists public.mark_order_paid(uuid, text, text, jsonb, text);

create or replace function public.mark_order_paid(
  p_order uuid, p_session text, p_payment_intent text, p_charge text, p_ship_to jsonb, p_secret text
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
     set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent,
         stripe_charge_id = p_charge, ship_to = p_ship_to, payout_status = 'held'
   where id = o.id;
  update public.listings
     set quantity = greatest(quantity - o.quantity, 0),
         status = case when quantity - o.quantity <= 0 then 'sold' else status end
   where id = o.listing_id;
  return true;
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, text, text, jsonb, text) from public;
grant execute on function public.mark_order_paid(uuid, text, text, text, jsonb, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Sending held money to sellers (server only)
-- -----------------------------------------------------------------------------

-- A seller's payout account, for the server (buyers can't read it directly).
create or replace function public.seller_payout_account(p_seller uuid, p_secret text)
returns table (stripe_account_id text, ready boolean)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  return query select a.stripe_account_id, a.charges_enabled from public.payout_accounts a where a.user_id = p_seller;
end;
$$;

-- Who sold an order (the webhook can't read orders directly).
create or replace function public.order_seller(p_order uuid, p_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  return (select seller_id from public.orders where id = p_order);
end;
$$;

-- A seller's paid orders whose money is still held.
create or replace function public.held_payouts(p_seller uuid, p_secret text)
returns table (order_id uuid, stripe_charge_id text, total_cents bigint, service_fee_cents bigint, boost_cents bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  return query
    select o.id, o.stripe_charge_id, o.total_cents, o.service_fee_cents,
           greatest(o.platform_fee_cents - o.service_fee_cents, 0)
      from public.orders o
     where o.seller_id = p_seller and o.payout_status = 'held' and o.stripe_charge_id is not null
       and o.status in ('paid', 'fulfilled', 'completed')
     order by o.paid_at;
end;
$$;

-- Record that a held payout was sent to the seller's Stripe account.
create or replace function public.mark_payout_sent(
  p_order uuid, p_transfer text, p_amount bigint, p_currency text, p_secret text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  update public.orders
     set payout_status = 'sent', stripe_transfer_id = p_transfer, payout_amount = p_amount,
         payout_currency = lower(p_currency), payout_sent_at = now()
   where id = p_order and payout_status = 'held';
end;
$$;

revoke all on function public.order_seller(uuid, text) from public;
grant execute on function public.order_seller(uuid, text) to anon, authenticated;
revoke all on function public.seller_payout_account(uuid, text) from public;
revoke all on function public.held_payouts(uuid, text) from public;
revoke all on function public.mark_payout_sent(uuid, text, bigint, text, text) from public;
grant execute on function public.seller_payout_account(uuid, text) to anon, authenticated;
grant execute on function public.held_payouts(uuid, text) to anon, authenticated;
grant execute on function public.mark_payout_sent(uuid, text, bigint, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Emails
-- -----------------------------------------------------------------------------

-- Sale emails: tell sellers without "Get paid" that their money is on hold.
create or replace function private.on_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  title text := coalesce(private.title_of(new.listing_id), 'your item');
  ready boolean := coalesce((select charges_enabled from public.payout_accounts where user_id = new.seller_id), false);
begin
  if old.status = 'pending_payment' and new.status = 'paid' then
    perform private.notify(
      new.seller_id,
      'You made a sale!',
      'You sold "' || left(title, 120) || '"',
      private.username_of(new.buyer_id) || ' paid for "' || left(title, 120) || '". '
        || case when new.ship_to is not null then 'Ship it soon and add the tracking number on the order page.'
                else 'Message the buyer to arrange pickup.' end
        || case when ready then ''
                else ' Your money is on hold until you set up Get paid. It only takes a few minutes.' end,
      case when ready then '/account/orders/' || new.id else '/account/payouts' end,
      case when ready then 'View the order' else 'Set up Get paid' end
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

-- Reminders: every 3 days, sellers with held money and no working payout
-- account get one email.
create or replace function private.send_payout_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  sent integer := 0;
begin
  for r in
    select o.seller_id, count(*) as n
      from public.orders o
      left join public.payout_accounts a on a.user_id = o.seller_id
     where o.payout_status = 'held'
       and not coalesce(a.charges_enabled, false)
       and o.paid_at < now() - interval '1 day'
     group by o.seller_id
    having max(coalesce(o.payout_reminded_at, o.paid_at)) < now() - interval '3 days'
  loop
    perform private.notify(
      r.seller_id,
      'Your money is waiting',
      'You have money on hold',
      'You have ' || r.n || case when r.n = 1 then ' sale' else ' sales' end
        || ' on Anston waiting to be paid out. Set up Get paid to receive your money. It only takes a few minutes.',
      '/account/payouts',
      'Set up Get paid'
    );
    update public.orders set payout_reminded_at = now()
     where seller_id = r.seller_id and payout_status = 'held';
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke all on function private.send_payout_reminders() from public, anon, authenticated;

-- Run the reminders daily (pg_cron). Skipped quietly where pg_cron isn't available.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('anston-payout-reminders', '17 15 * * *', 'select private.send_payout_reminders()');
exception when others then
  raise notice 'pg_cron not available; payout reminders not scheduled: %', sqlerrm;
end;
$$;
