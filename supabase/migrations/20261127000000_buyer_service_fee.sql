-- =============================================================================
-- Buyer service fee
--
-- Buyers pay a service fee to Anston on purchases made through checkout,
-- set by the item's price: 7% under 50.00, 5% from 50.00 to 500.00, and 3%
-- above 500.00 (in the listing's currency). It is shown before paying and
-- appears as its own line on Stripe Checkout and on the order.
-- =============================================================================

alter table public.orders add column if not exists service_fee_cents bigint not null default 0 check (service_fee_cents >= 0);

-- The order total now includes the service fee.
alter table public.orders drop column if exists total_cents;
alter table public.orders
  add column total_cents bigint generated always as (subtotal_cents + shipping_cents + tax_cents + service_fee_cents) stored;

-- Fee rate for a price, in basis points (700 = 7%).
create or replace function public.buyer_fee_bps(p_price bigint)
returns integer language sql immutable as $$
  select case when p_price < 5000 then 700 when p_price <= 50000 then 500 else 300 end;
$$;
grant execute on function public.buyer_fee_bps(bigint) to anon, authenticated;

drop function if exists public.start_order(uuid, uuid);

create or replace function public.start_order(p_listing uuid, p_offer uuid default null)
returns table (
  order_id uuid, stripe_account_id text, title text, currency text,
  subtotal_cents bigint, shipping_cents bigint, service_fee_cents bigint, platform_fee_cents bigint, ships boolean
)
language plpgsql security definer set search_path = public as $$
declare
  buyer   uuid := auth.uid();
  l       public.listings;
  acct    public.payout_accounts;
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
                               boost_bps, stripe_account_id)
    values (l.id, buyer, l.seller_id, 'sale', p_offer, 1, l.currency,
            price, ship, svc, l.boost_bps, fee, l.boost_bps, acct.stripe_account_id)
    returning id into existing;
  else
    update public.orders
       set subtotal_cents = price, shipping_cents = ship, service_fee_cents = svc, platform_fee_bps = l.boost_bps,
           platform_fee_cents = fee, boost_bps = l.boost_bps, currency = l.currency,
           created_at = now(), stripe_checkout_session_id = null, stripe_account_id = acct.stripe_account_id
     where id = existing;
  end if;

  return query select existing, acct.stripe_account_id, l.title, l.currency::text, price, ship, svc, fee, l.ships;
end;
$$;

revoke all on function public.start_order(uuid, uuid) from public, anon;
grant execute on function public.start_order(uuid, uuid) to authenticated;
