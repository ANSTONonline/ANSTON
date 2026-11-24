-- =============================================================================
-- "You made a sale!" email: for orders that ship, the button goes straight to
-- buying a shipping label. Sellers who haven't set up Get paid are still told
-- their money is on hold.
-- =============================================================================

create or replace function private.on_order_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  title text := coalesce(private.title_of(new.listing_id), 'your item');
  ready boolean := coalesce((select charges_enabled from public.payout_accounts where user_id = new.seller_id), false);
  ships boolean := new.ship_to is not null;
begin
  if old.status = 'pending_payment' and new.status = 'paid' then
    perform private.notify(
      new.seller_id,
      'You made a sale!',
      'You sold "' || left(title, 120) || '"',
      private.username_of(new.buyer_id) || ' paid for "' || left(title, 120) || '". '
        || case when ships then 'Ship it soon: you can buy a USPS, UPS or FedEx label on Anston in one click.'
                else 'Message the buyer to arrange pickup.' end
        || case when ready then ''
                else ' Your money is on hold until you set up Get paid. It only takes a few minutes.' end,
      case when ships then '/account/orders/' || new.id || '#ship-label'
           when ready then '/account/orders/' || new.id
           else '/account/payouts' end,
      case when ships then 'Get a shipping label'
           when ready then 'View the order'
           else 'Set up Get paid' end
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

revoke all on function private.on_order_paid() from public, anon, authenticated;
