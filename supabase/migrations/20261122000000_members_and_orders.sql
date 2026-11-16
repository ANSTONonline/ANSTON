-- =============================================================================
-- Members (admin) and order tracking
--
-- * Admins can list and search every account, including email and phone,
--   which live in Supabase Auth and are otherwise hidden. Only through two
--   functions that check admin rights first.
-- * Orders get shipping tracking. Sellers add the carrier and tracking number
--   (marking the order shipped); buyers confirm when it arrives. Both sides
--   get an email.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Order tracking
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists carrier         text check (char_length(carrier) <= 60),
  add column if not exists tracking_number text check (char_length(tracking_number) <= 100),
  add column if not exists shipped_at      timestamptz,
  add column if not exists delivered_at    timestamptz;

-- The seller adds (or corrects) tracking on a paid order, which marks it shipped.
create or replace function public.mark_order_shipped(p_order uuid, p_carrier text, p_tracking text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.seller_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.mode not in ('sale', 'auction') or o.status not in ('paid', 'fulfilled') then
    raise exception 'order_not_shippable' using errcode = 'check_violation';
  end if;
  update public.orders set
    carrier         = nullif(left(trim(p_carrier), 60), ''),
    tracking_number = nullif(left(trim(p_tracking), 100), ''),
    status          = 'fulfilled',
    shipped_at      = coalesce(shipped_at, now())
  where id = p_order;
end;
$$;

-- The buyer confirms the item arrived, which completes the order.
create or replace function public.confirm_order_received(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.buyer_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if o.status <> 'fulfilled' then
    raise exception 'order_not_shipped' using errcode = 'check_violation';
  end if;
  update public.orders set status = 'completed', delivered_at = now(), completed_at = now()
  where id = p_order;
end;
$$;

revoke all on function public.mark_order_shipped(uuid, text, text) from public, anon;
revoke all on function public.confirm_order_received(uuid) from public, anon;
grant execute on function public.mark_order_shipped(uuid, text, text) to authenticated;
grant execute on function public.confirm_order_received(uuid) to authenticated;

-- Emails when an order ships or is received.
create or replace function private.on_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  title text := coalesce(private.title_of(new.listing_id), 'your item');
begin
  if new.status = 'fulfilled' and old.status = 'paid' then
    perform private.notify(
      new.buyer_id,
      'Your order has shipped',
      'Your order is on its way',
      'The seller shipped "' || title || '"'
        || coalesce(' with ' || new.carrier, '') || '.'
        || coalesce(' Tracking number: ' || new.tracking_number || '.', ''),
      '/account/orders/' || new.id,
      'Track your order'
    );
  elsif new.status = 'completed' and old.status = 'fulfilled' then
    perform private.notify(
      new.seller_id,
      'Order received',
      'Your buyer received their order',
      private.username_of(new.buyer_id) || ' confirmed that "' || title || '" arrived.',
      '/account/orders/' || new.id,
      'View the order'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_email on public.orders;
create trigger orders_status_email after update of status on public.orders
  for each row execute function private.on_order_status();

revoke all on all functions in schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Admin: members
-- -----------------------------------------------------------------------------

-- Admins can see every bid, including on removed listings.
drop policy if exists "Admins see bids" on public.bids;
create policy "Admins see bids" on public.bids for select using (public.is_admin());

-- Search and list accounts, newest first.
create or replace function public.admin_members(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, username text, email text, phone text, created_at timestamptz, last_sign_in_at timestamptz,
  is_admin boolean, is_suspended boolean, listings bigint, purchases bigint, total_count bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := '%' || replace(replace(replace(coalesce(trim(p_search), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.id, p.username, u.email::text, u.phone::text, u.created_at, u.last_sign_in_at,
           p.is_admin, p.is_suspended,
           (select count(*) from public.listings l where l.seller_id = p.id),
           (select count(*) from public.orders o where o.buyer_id = p.id),
           count(*) over ()
      from public.profiles p
      join auth.users u on u.id = p.id
     where coalesce(trim(p_search), '') = ''
        or p.username ilike q or p.display_name ilike q or u.email ilike q or u.phone ilike q
     order by u.created_at desc
     limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- One account's private details.
create or replace function public.admin_member(p_id uuid)
returns table (
  id uuid, username text, display_name text, email text, phone text, provider text,
  created_at timestamptz, last_sign_in_at timestamptz, email_confirmed_at timestamptz,
  country_code text, region text, city text, is_admin boolean, is_suspended boolean,
  email_notifications boolean, rating_avg numeric, rating_count integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.id, p.username, p.display_name, u.email::text, u.phone::text,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
           u.created_at, u.last_sign_in_at, u.email_confirmed_at,
           p.country_code::text, p.region, p.city, p.is_admin, p.is_suspended,
           p.email_notifications, p.rating_avg, p.rating_count
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = p_id;
end;
$$;

revoke all on function public.admin_members(text, int, int) from public, anon;
revoke all on function public.admin_member(uuid) from public, anon;
grant execute on function public.admin_members(text, int, int) to authenticated;
grant execute on function public.admin_member(uuid) to authenticated;
