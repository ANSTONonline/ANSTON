-- =============================================================================
-- Shipping labels (Shippo)
--
-- Sellers can buy a USPS, UPS or FedEx label for a paid order right on the
-- order page. Anston pays Shippo, and the label's cost comes out of the
-- seller's payout for that order (which is still held, since payouts wait
-- 7 days). Buying a label marks the order shipped with its tracking number.
-- =============================================================================

alter table public.orders
  add column if not exists shippo_shipment_id text,
  add column if not exists shippo_transaction_id text,
  add column if not exists label_url text,
  add column if not exists label_service text,
  add column if not exists label_cost_cents bigint not null default 0 check (label_cost_cents >= 0),
  add column if not exists label_purchased_at timestamptz;

-- Where a seller ships from. Private: only the seller can read it.
create table if not exists public.ship_from_addresses (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  address    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ship_from_addresses enable row level security;
drop policy if exists "Sellers see their ship-from address" on public.ship_from_addresses;
create policy "Sellers see their ship-from address" on public.ship_from_addresses
  for select using (user_id = auth.uid());
drop policy if exists "Sellers save their ship-from address" on public.ship_from_addresses;
create policy "Sellers save their ship-from address" on public.ship_from_addresses
  for insert with check (user_id = auth.uid());
drop policy if exists "Sellers update their ship-from address" on public.ship_from_addresses;
create policy "Sellers update their ship-from address" on public.ship_from_addresses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Can this seller buy a label for this order right now? Raises if not.
create or replace function private.check_label_order(p_order uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or o.seller_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status <> 'paid' or o.ship_to is null or o.label_url is not null then
    raise exception 'label_not_available' using errcode = 'check_violation';
  end if;
  -- The label is paid from money Anston still holds for the seller.
  if o.payout_status <> 'held' or lower(o.currency) <> 'usd'
     or exists (select 1 from public.refund_requests r where r.order_id = o.id and r.status <> 'declined') then
    raise exception 'label_not_available' using errcode = 'check_violation';
  end if;
  return o;
end;
$$;
revoke all on function private.check_label_order(uuid) from public, anon, authenticated;

-- Seller asked for rates: remember the Shippo shipment for this order.
create or replace function public.set_label_shipment(p_order uuid, p_shipment text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  perform private.check_label_order(p_order);
  update public.orders set shippo_shipment_id = left(p_shipment, 100) where id = p_order;
end;
$$;

-- Seller bought a label: record it, mark the order shipped. The cost must
-- fit within what the seller would receive for the order.
create or replace function public.record_label(
  p_order uuid, p_transaction text, p_carrier text, p_service text, p_tracking text,
  p_label_url text, p_cost_cents bigint, p_secret text
) returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  perform private.require_server_secret(p_secret);
  o := private.check_label_order(p_order);
  if p_cost_cents < 0 or p_cost_cents > (o.subtotal_cents + o.shipping_cents - greatest(o.platform_fee_cents - o.service_fee_cents, 0)) then
    raise exception 'label_too_expensive' using errcode = 'check_violation';
  end if;
  update public.orders set
    shippo_transaction_id = left(p_transaction, 100),
    label_url        = left(p_label_url, 1000),
    label_service    = left(p_service, 120),
    label_cost_cents = p_cost_cents,
    label_purchased_at = now(),
    carrier          = left(p_carrier, 60),
    tracking_number  = left(p_tracking, 100),
    status           = 'fulfilled',
    shipped_at       = coalesce(shipped_at, now())
  where id = o.id;
end;
$$;

-- The most a label can cost for this order (rates above it are hidden).
create or replace function public.label_budget(p_order uuid)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare
  o public.orders;
begin
  o := private.check_label_order(p_order);
  return o.subtotal_cents + o.shipping_cents - greatest(o.platform_fee_cents - o.service_fee_cents, 0);
end;
$$;

revoke all on function public.set_label_shipment(uuid, text, text) from public, anon;
revoke all on function public.record_label(uuid, text, text, text, text, text, bigint, text) from public, anon;
revoke all on function public.label_budget(uuid) from public, anon;
grant execute on function public.set_label_shipment(uuid, text, text) to authenticated;
grant execute on function public.record_label(uuid, text, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.label_budget(uuid) to authenticated;

-- Payouts subtract the label's cost.
drop function if exists public.held_payouts(uuid, text);
create or replace function public.held_payouts(p_seller uuid, p_secret text)
returns table (order_id uuid, stripe_charge_id text, total_cents bigint, service_fee_cents bigint, boost_cents bigint, label_cost_cents bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  return query
    select o.id, o.stripe_charge_id, o.total_cents, o.service_fee_cents,
           greatest(o.platform_fee_cents - o.service_fee_cents, 0), o.label_cost_cents
      from public.orders o
     where o.seller_id = p_seller and o.payout_status = 'held' and o.stripe_charge_id is not null
       and o.status in ('paid', 'fulfilled', 'completed')
       and o.paid_at <= now() - interval '7 days'
       and not exists (select 1 from public.refund_requests r where r.order_id = o.id and r.status = 'open')
     order by o.paid_at;
end;
$$;
revoke all on function public.held_payouts(uuid, text) from public;
grant execute on function public.held_payouts(uuid, text) to anon, authenticated;
