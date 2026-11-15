-- =============================================================================
-- Email notifications
--
-- When someone messages, makes an offer, bids, or asks to book, the other
-- person gets a short email through Resend (resend.com). The emails are sent
-- from inside the database with pg_net, so no secret key ever goes into the
-- website or Vercel. The Resend key lives in Supabase Vault under the name
-- 'resend_api_key'. Until that secret exists, nothing is sent and nothing
-- breaks.
--
-- Emails never include message text, only who it is from and which listing,
-- so a scammer can't use Anston's emails to deliver links.
-- =============================================================================

create extension if not exists pg_net;

-- People can turn the emails off on their account page.
alter table public.profiles
  add column if not exists email_notifications boolean not null default true;

-- Internal helpers live in a schema the website's API can't reach.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Remembers recent message emails so a fast back-and-forth chat sends one
-- email, not one per message.
create table if not exists private.email_log (
  user_id  uuid not null,
  kind     text not null,
  ref_id   uuid not null,
  sent_at  timestamptz not null default now()
);
create index if not exists email_log_lookup on private.email_log (user_id, kind, ref_id, sent_at desc);

create or replace function private.html_escape(t text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

create or replace function private.money(cents bigint, currency text)
returns text language sql immutable as $$
  select upper(coalesce(currency, 'USD')) || ' ' || to_char(cents / 100.0, 'FM999,999,999,990.00');
$$;

-- Sends one email to a member. Quietly does nothing if they turned emails
-- off, have no email address, or the Resend key isn't set up yet.
create or replace function private.notify(
  recipient uuid, subject text, headline text, detail text, link_path text, button text
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  api_key text;
  address text;
  wants   boolean;
  html    text;
begin
  select p.email_notifications, u.email into wants, address
    from public.profiles p join auth.users u on u.id = p.id
   where p.id = recipient;
  if not coalesce(wants, false) or address is null or address = '' then
    return;
  end if;

  begin
    select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  exception when others then
    api_key := null;
  end;
  if api_key is null or api_key = '' then
    return;
  end if;

  html :=
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">'
    || '<p style="font-size:22px;font-weight:bold;color:#7A1E2B;margin:0 0 20px">ANSTON</p>'
    || '<p style="font-size:18px;font-weight:bold;margin:0 0 8px">' || private.html_escape(headline) || '</p>'
    || '<p style="font-size:15px;line-height:1.5;margin:0 0 24px">' || private.html_escape(detail) || '</p>'
    || '<a href="https://www.myanston.com' || link_path || '" style="display:inline-block;background:#7A1E2B;color:#ffffff;'
    || 'text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">' || private.html_escape(button) || '</a>'
    || '<p style="font-size:12px;color:#6b7280;margin:32px 0 0;line-height:1.5">'
    || 'For your safety, Anston emails never include links from other members. '
    || 'Always reply on myanston.com.<br>'
    || 'Don''t want these emails? <a href="https://www.myanston.com/account" style="color:#6b7280">Turn them off in your account</a>.'
    || '</p></div>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'from', 'Anston <notifications@myanston.com>',
      'to', jsonb_build_array(address),
      'subject', subject,
      'html', html
    )
  );
exception when others then
  -- An email problem must never stop the message, bid or offer itself.
  raise warning 'email notification failed: %', sqlerrm;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- Short helpers for the triggers below.
create or replace function private.username_of(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce('@' || username, 'A member') from public.profiles where id = uid;
$$;

create or replace function private.title_of(lid uuid)
returns text language sql stable security definer set search_path = public as $$
  select left(title, 120) from public.listings where id = lid;
$$;

-- -----------------------------------------------------------------------------
-- New message: tell the other person, at most once every 15 minutes per chat.
-- -----------------------------------------------------------------------------
create or replace function private.on_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c         public.conversations;
  recipient uuid;
begin
  select * into c from public.conversations where id = new.conversation_id;
  recipient := case when new.sender_id = c.buyer_id then c.seller_id else c.buyer_id end;

  if exists (
    select 1 from private.email_log
     where user_id = recipient and kind = 'message' and ref_id = c.id
       and sent_at > now() - interval '15 minutes'
  ) then
    return new;
  end if;
  insert into private.email_log (user_id, kind, ref_id) values (recipient, 'message', c.id);

  perform private.notify(
    recipient,
    'New message from ' || private.username_of(new.sender_id),
    'You have a new message',
    private.username_of(new.sender_id) || ' sent you a message'
      || coalesce(' about "' || private.title_of(c.listing_id) || '"', '') || '.',
    '/messages/' || c.id,
    'Read and reply'
  );
  return new;
end;
$$;

drop trigger if exists messages_email on public.messages;
create trigger messages_email after insert on public.messages
  for each row execute function private.on_new_message();

-- -----------------------------------------------------------------------------
-- New offer: tell the seller.
-- -----------------------------------------------------------------------------
create or replace function private.on_new_offer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
  cur text;
begin
  select * into l from public.listings where id = new.listing_id;
  cur := l.currency;
  perform private.notify(
    l.seller_id,
    'New offer on "' || left(l.title, 80) || '"',
    'You received an offer',
    private.username_of(new.buyer_id) || ' offered ' || private.money(new.amount_cents, cur)
      || ' for "' || left(l.title, 120) || '". The offer expires in 48 hours.',
    '/account/selling',
    'Review the offer'
  );
  return new;
end;
$$;

drop trigger if exists offers_email on public.offers;
create trigger offers_email after insert on public.offers
  for each row execute function private.on_new_offer();

-- Offer accepted or declined: tell the buyer.
create or replace function private.on_offer_answered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    perform private.notify(
      new.buyer_id,
      'Your offer was ' || new.status::text,
      case when new.status = 'accepted' then 'Good news: your offer was accepted' else 'Your offer was declined' end,
      'The seller ' || new.status::text || ' your offer on "' || coalesce(private.title_of(new.listing_id), 'a listing') || '".',
      '/listing/' || new.listing_id,
      'View the listing'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists offers_answered_email on public.offers;
create trigger offers_answered_email after update of status on public.offers
  for each row execute function private.on_offer_answered();

-- -----------------------------------------------------------------------------
-- New bid: tell the seller, and the person who was just outbid.
-- -----------------------------------------------------------------------------
create or replace function private.on_new_bid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l        public.listings;
  cur      text;
  previous uuid;
begin
  select * into l from public.listings where id = new.listing_id;
  cur := l.currency;

  perform private.notify(
    l.seller_id,
    'New bid on "' || left(l.title, 80) || '"',
    'Someone bid on your auction',
    private.username_of(new.bidder_id) || ' bid ' || private.money(new.amount_cents, cur)
      || ' on "' || left(l.title, 120) || '".',
    '/listing/' || l.id,
    'View your auction'
  );

  select bidder_id into previous from public.bids
   where listing_id = new.listing_id and id <> new.id
   order by amount_cents desc, created_at asc limit 1;
  if previous is not null and previous <> new.bidder_id then
    perform private.notify(
      previous,
      'You were outbid on "' || left(l.title, 80) || '"',
      'You''ve been outbid',
      'Someone bid ' || private.money(new.amount_cents, cur) || ' on "' || left(l.title, 120)
        || '". Bid again before the auction ends if you still want it.',
      '/listing/' || l.id,
      'Bid again'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bids_email on public.bids;
create trigger bids_email after insert on public.bids
  for each row execute function private.on_new_bid();

-- -----------------------------------------------------------------------------
-- New booking or rental request: tell the seller.
-- -----------------------------------------------------------------------------
create or replace function private.on_new_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
begin
  select * into l from public.listings where id = new.listing_id;
  perform private.notify(
    l.seller_id,
    case when new.mode = 'booking' then 'New booking request' else 'New rental request' end
      || ' for "' || left(l.title, 80) || '"',
    case when new.mode = 'booking' then 'You have a new booking request' else 'You have a new rental request' end,
    private.username_of(new.renter_id) || ' wants to '
      || case when new.mode = 'booking' then 'book' else 'rent' end
      || ' "' || left(l.title, 120) || '" from '
      || to_char(lower(new.period) at time zone 'UTC', 'Mon DD, YYYY HH24:MI') || ' to '
      || to_char(upper(new.period) at time zone 'UTC', 'Mon DD, YYYY HH24:MI') || ' (UTC).',
    '/account/selling',
    'Confirm or decline'
  );
  return new;
end;
$$;

drop trigger if exists reservations_email on public.reservations;
create trigger reservations_email after insert on public.reservations
  for each row execute function private.on_new_reservation();

-- Request confirmed or declined by the seller: tell the renter.
create or replace function private.on_reservation_answered()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  seller uuid;
begin
  select seller_id into seller from public.listings where id = new.listing_id;
  if old.status = 'requested' and new.status in ('confirmed', 'cancelled')
     and auth.uid() is not distinct from seller then
    perform private.notify(
      new.renter_id,
      case when new.status = 'confirmed' then 'Your request was confirmed' else 'Your request was declined' end,
      case when new.status = 'confirmed' then 'Good news: your request was confirmed' else 'Your request was declined' end,
      'The seller ' || case when new.status = 'confirmed' then 'confirmed' else 'declined' end
        || ' your request for "' || coalesce(private.title_of(new.listing_id), 'a listing') || '".',
      '/listing/' || new.listing_id,
      'View the listing'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_answered_email on public.reservations;
create trigger reservations_answered_email after update of status on public.reservations
  for each row execute function private.on_reservation_answered();

revoke all on all functions in schema private from public, anon, authenticated;
