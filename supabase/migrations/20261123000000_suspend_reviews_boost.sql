-- =============================================================================
-- Suspended listings, reviews, and boosted listings
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Suspended listings: hidden while Anston reviews them. Like removed
-- listings, only an admin can bring them back.
-- -----------------------------------------------------------------------------
alter type public.listing_status add value if not exists 'suspended';

create or replace function public.keep_removed_listings_removed()
returns trigger language plpgsql as $$
begin
  if old.status::text in ('removed', 'suspended') and new.status is distinct from old.status
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'listing_removed' using errcode = 'check_violation',
      hint = 'This listing was suspended or removed by Anston and cannot be changed.';
  end if;
  return new;
end;
$$;

-- Tell the seller when an admin suspends or removes their listing.
create or replace function private.on_listing_moderated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status::text in ('suspended', 'removed') and new.status is distinct from old.status
     and public.is_admin()
     -- A suspended seller loses all their listings at once; don't send one email per listing.
     and not coalesce((select is_suspended from public.profiles where id = new.seller_id), false) then
    perform private.notify(
      new.seller_id,
      case when new.status::text = 'suspended' then 'Your listing was suspended' else 'Your listing was removed' end,
      case when new.status::text = 'suspended' then 'Your listing is on hold' else 'Your listing was removed' end,
      case when new.status::text = 'suspended'
        then 'We suspended "' || left(new.title, 120) || '" while we review it. It is hidden from buyers for now.'
        else 'We removed "' || left(new.title, 120) || '" because it breaks our rules.' end
        || ' If you have questions, email support@myanston.com.',
      '/listing/' || new.id,
      'View your listing'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists listings_moderated_email on public.listings;
create trigger listings_moderated_email after update of status on public.listings
  for each row execute function private.on_listing_moderated();

-- -----------------------------------------------------------------------------
-- Reviews: the table and rules already exist (only the buyer or seller of a
-- shipped order, once each). Suspended accounts can't post, and the person
-- reviewed gets an email.
-- -----------------------------------------------------------------------------
drop trigger if exists reviews_block_suspended on public.reviews;
create trigger reviews_block_suspended before insert on public.reviews
  for each row execute function public.block_suspended_members();

create or replace function private.on_new_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reviewee_name text;
begin
  select username into reviewee_name from public.profiles where id = new.reviewee_id;
  perform private.notify(
    new.reviewee_id,
    'You got a new review',
    'You got a ' || new.rating || '-star review',
    private.username_of(new.reviewer_id) || ' left you a ' || new.rating || ' out of 5 star review.',
    '/seller/' || coalesce(reviewee_name, ''),
    'See your reviews'
  );
  return new;
end;
$$;

drop trigger if exists reviews_email on public.reviews;
create trigger reviews_email after insert on public.reviews
  for each row execute function private.on_new_review();

-- -----------------------------------------------------------------------------
-- Boosted listings: the seller chooses a percentage of the final price
-- (in basis points: 500 = 5%) paid to Anston only if it sells or is booked
-- through checkout. Higher boosts show first in Featured Listings.
-- -----------------------------------------------------------------------------
alter table public.listings
  add column if not exists boost_bps integer not null default 0 check (boost_bps between 0 and 2000);

-- The boost rate is copied onto each order so later changes don't affect it.
alter table public.orders
  add column if not exists boost_bps integer not null default 0 check (boost_bps between 0 and 2000);

create index if not exists listings_featured_idx on public.listings (boost_bps desc, created_at desc);

revoke all on all functions in schema private from public, anon, authenticated;
