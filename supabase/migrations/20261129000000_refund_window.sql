-- =============================================================================
-- 7-day refund window and 7-day payout delay
--
-- Buyers can ask for a refund within 7 days of paying. The seller (or an
-- Anston admin) approves or declines it. Sellers' money is sent no sooner
-- than 7 days after the purchase, and never while a refund request is open,
-- so a refund is always possible from the money Anston still holds.
--
-- An hourly job (pg_cron + pg_net) asks the website to send payouts that have
-- become due.
-- =============================================================================

alter table public.orders drop constraint if exists orders_payout_status_check;
alter table public.orders add constraint orders_payout_status_check
  check (payout_status in ('none', 'held', 'sent', 'refunded'));
alter table public.orders add column if not exists stripe_refund_id text;

-- -----------------------------------------------------------------------------
-- Refund requests
-- -----------------------------------------------------------------------------
create table if not exists public.refund_requests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders (id) on delete cascade,
  buyer_id    uuid not null references public.profiles (id) on delete cascade,
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  reason      text not null check (reason in ('not_received', 'not_as_described', 'changed_mind', 'other')),
  details     text not null default '' check (char_length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'approved', 'declined')),
  decided_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
alter table public.refund_requests enable row level security;

drop policy if exists "Order parties see refund requests" on public.refund_requests;
create policy "Order parties see refund requests" on public.refund_requests
  for select using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
-- Changes only through the functions below.

-- Buyer asks for a refund (within 7 days of paying, before the money is sent).
create or replace function public.request_refund(p_order uuid, p_reason text, p_details text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  o  public.orders;
  rid uuid;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or o.buyer_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status not in ('paid', 'fulfilled', 'completed') or o.paid_at is null then
    raise exception 'not_refundable' using errcode = 'check_violation';
  end if;
  if o.paid_at < now() - interval '7 days' or o.payout_status = 'sent' then
    raise exception 'refund_window_closed' using errcode = 'check_violation';
  end if;
  insert into public.refund_requests (order_id, buyer_id, seller_id, reason, details)
  values (o.id, o.buyer_id, o.seller_id, p_reason, left(coalesce(trim(p_details), ''), 1000))
  returning id into rid;
  return rid;
exception when unique_violation then
  raise exception 'already_requested' using errcode = 'check_violation';
end;
$$;

-- Seller or admin declines an open request.
create or replace function public.decline_refund(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.refund_requests;
begin
  select * into r from public.refund_requests where id = p_request for update;
  if r.id is null or not (r.seller_id = auth.uid() or public.is_admin()) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'open' then
    raise exception 'already_decided' using errcode = 'check_violation';
  end if;
  update public.refund_requests set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = r.id;
end;
$$;

-- Seller or admin starts approving: returns what the server needs to refund
-- the payment on Stripe.
create or replace function public.refund_to_issue(p_request uuid)
returns table (order_id uuid, stripe_payment_intent_id text)
language plpgsql security definer set search_path = public as $$
declare
  r public.refund_requests;
  o public.orders;
begin
  select * into r from public.refund_requests where id = p_request;
  if r.id is null or not (r.seller_id = auth.uid() or public.is_admin()) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'open' then
    raise exception 'already_decided' using errcode = 'check_violation';
  end if;
  select * into o from public.orders where id = r.order_id;
  if o.payout_status = 'sent' or o.stripe_payment_intent_id is null then
    raise exception 'not_refundable' using errcode = 'check_violation';
  end if;
  return query select o.id, o.stripe_payment_intent_id;
end;
$$;

-- The server records a refund issued on Stripe.
create or replace function public.mark_refunded(p_request uuid, p_refund text, p_secret text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.refund_requests;
begin
  perform private.require_server_secret(p_secret);
  select * into r from public.refund_requests where id = p_request for update;
  if r.id is null or r.status <> 'open' then
    return;
  end if;
  update public.refund_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = r.id;
  update public.orders set status = 'refunded', payout_status = 'refunded', stripe_refund_id = p_refund
   where id = r.order_id;
end;
$$;

revoke all on function public.request_refund(uuid, text, text) from public, anon;
revoke all on function public.decline_refund(uuid) from public, anon;
revoke all on function public.refund_to_issue(uuid) from public, anon;
revoke all on function public.mark_refunded(uuid, text, text) from public;
grant execute on function public.request_refund(uuid, text, text) to authenticated;
grant execute on function public.decline_refund(uuid) to authenticated;
grant execute on function public.refund_to_issue(uuid) to authenticated;
grant execute on function public.mark_refunded(uuid, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Payouts only after 7 days, and never during an open refund request
-- -----------------------------------------------------------------------------
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
       and o.paid_at <= now() - interval '7 days'
       and not exists (select 1 from public.refund_requests r where r.order_id = o.id and r.status = 'open')
     order by o.paid_at;
end;
$$;

-- Sellers with payouts due now and an account that can receive them.
create or replace function public.due_payouts(p_secret text)
returns table (seller_id uuid, stripe_account_id text)
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_server_secret(p_secret);
  return query
    select distinct o.seller_id, a.stripe_account_id
      from public.orders o
      join public.payout_accounts a on a.user_id = o.seller_id and a.charges_enabled
     where o.payout_status = 'held' and o.stripe_charge_id is not null
       and o.status in ('paid', 'fulfilled', 'completed')
       and o.paid_at <= now() - interval '7 days'
       and not exists (select 1 from public.refund_requests r where r.order_id = o.id and r.status = 'open');
end;
$$;
revoke all on function public.due_payouts(text) from public;
grant execute on function public.due_payouts(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Emails
-- -----------------------------------------------------------------------------
create or replace function private.on_refund_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  title text;
begin
  select coalesce(private.title_of(o.listing_id), 'your item') into title from public.orders o where o.id = new.order_id;
  if tg_op = 'INSERT' then
    perform private.notify(
      new.seller_id,
      'Refund requested',
      'Your buyer asked for a refund',
      private.username_of(new.buyer_id) || ' asked for a refund for "' || left(title, 120) || '". '
        || 'Your money for this sale stays on hold until you approve or decline.',
      '/account/orders/' || new.order_id,
      'Review the request'
    );
  elsif old.status = 'open' and new.status in ('approved', 'declined') then
    perform private.notify(
      new.buyer_id,
      case when new.status = 'approved' then 'Refund approved' else 'Refund declined' end,
      case when new.status = 'approved' then 'Your refund is on its way' else 'Your refund request was declined' end,
      case when new.status = 'approved'
           then 'Your refund for "' || left(title, 120) || '" was approved. It goes back to your card, usually within 5 to 10 business days.'
           else 'The seller declined your refund request for "' || left(title, 120) || '". You can message them on Anston.' end,
      '/account/orders/' || new.order_id,
      'View your order'
    );
  end if;
  return new;
end;
$$;
revoke all on function private.on_refund_request() from public, anon, authenticated;

drop trigger if exists refund_requests_email on public.refund_requests;
create trigger refund_requests_email after insert or update of status on public.refund_requests
  for each row execute function private.on_refund_request();

-- Reminders shouldn't count orders that are being refunded.
-- (send_payout_reminders only looks at payout_status = 'held', which refunds change.)

-- -----------------------------------------------------------------------------
-- Hourly: ask the website to send payouts that are due.
-- -----------------------------------------------------------------------------
create or replace function private.request_due_payouts()
returns void language plpgsql security definer set search_path = public as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'anston_server_secret' limit 1;
  if secret is null then
    return;
  end if;
  if exists (select 1 from public.orders where payout_status = 'held' and paid_at <= now() - interval '7 days') then
    perform net.http_post(
      url := 'https://www.myanston.com/api/payouts/run',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-anston-secret', secret),
      body := '{}'::jsonb
    );
  end if;
end;
$$;
revoke all on function private.request_due_payouts() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('anston-due-payouts', '23 * * * *', 'select private.request_due_payouts()');
exception when others then
  raise notice 'pg_cron not available; due payouts not scheduled: %', sqlerrm;
end;
$$;
