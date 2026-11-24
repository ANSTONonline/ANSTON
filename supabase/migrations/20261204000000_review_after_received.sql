-- =============================================================================
-- Buyers review sellers after they receive the item
--
-- Buyers can review once they confirm the order arrived (status 'completed').
-- Pickup orders (no shipping address) can be confirmed straight from 'paid'
-- ("I picked it up"). When a buyer confirms, they get an email inviting them
-- to review the seller.
-- =============================================================================

create or replace function public.confirm_order_received(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.buyer_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if not (o.status = 'fulfilled' or (o.status = 'paid' and o.ship_to is null)) then
    raise exception 'order_not_shipped' using errcode = 'check_violation';
  end if;
  update public.orders set status = 'completed', delivered_at = now(), completed_at = now()
  where id = p_order;
end;
$$;
revoke all on function public.confirm_order_received(uuid) from public, anon;
grant execute on function public.confirm_order_received(uuid) to authenticated;

-- Buyers review after receiving; sellers can review buyers once they've shipped.
create or replace function public.validate_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = new.order_id;
  if not ((new.reviewer_id = o.buyer_id and new.reviewee_id = o.seller_id)
       or (new.reviewer_id = o.seller_id and new.reviewee_id = o.buyer_id)) then
    raise exception 'Reviews are only between the buyer and seller of this order' using errcode = 'check_violation';
  end if;
  if new.reviewer_id = o.buyer_id and o.status <> 'completed' then
    raise exception 'You can review the seller after you receive your order' using errcode = 'check_violation';
  end if;
  if new.reviewer_id = o.seller_id and o.status not in ('fulfilled', 'completed') then
    raise exception 'You can review only after the order is fulfilled' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Invite the buyer to review once they confirm the order arrived.
create or replace function private.on_order_received()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seller text := private.username_of(new.seller_id);
  title text := coalesce(private.title_of(new.listing_id), 'your item');
begin
  if old.status <> 'completed' and new.status = 'completed'
     and not exists (select 1 from public.reviews where order_id = new.id and reviewer_id = new.buyer_id) then
    perform private.notify(
      new.buyer_id,
      'How was your order?',
      'Review ' || seller,
      'Glad "' || left(title, 120) || '" arrived! Tell others how it went: a quick star rating helps good sellers stand out.',
      '/account/orders/' || new.id || '#review',
      'Leave a review'
    );
  end if;
  return new;
end;
$$;
revoke all on function private.on_order_received() from public, anon, authenticated;

drop trigger if exists orders_received_email on public.orders;
create trigger orders_received_email after update of status on public.orders
  for each row execute function private.on_order_received();
