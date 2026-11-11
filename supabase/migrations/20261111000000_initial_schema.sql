-- =============================================================================
-- Anston: initial database schema
-- Target: Supabase (Postgres 15+). Run with `supabase db push` or paste into
-- the Supabase SQL editor.
--
-- Design notes
-- * Money is stored as integer minor units (cents) plus an ISO 4217 currency
--   code, so the marketplace can run in many currencies without rounding bugs.
-- * One listing can be offered several ways at once (sale, auction, rental,
--   booking). Each way lives in `listing_modes`, keyed by (listing_id, mode).
-- * Category-specific details (vehicle mileage, bedrooms, clothing size, the
--   cottage food label, ...) live in `listings.attributes` (JSONB). Each
--   category describes the fields it expects in `categories.attribute_schema`.
-- * Rentals and bookings use a time range with an exclusion constraint, so the
--   database itself refuses double bookings.
-- * Row Level Security is on for every table. The app talks to Postgres as
--   the signed-in user; payment webhooks use the service role.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist; -- exclusion constraint on rentals

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_language    as enum ('en', 'ar');
create type public.listing_status  as enum ('draft', 'active', 'paused', 'sold', 'expired', 'removed');
create type public.listing_mode    as enum ('sale', 'auction', 'rental', 'booking');
create type public.item_condition  as enum ('new', 'like_new', 'good', 'fair', 'for_parts', 'not_applicable');
create type public.rate_unit       as enum ('hour', 'day', 'week', 'month');
create type public.offer_status    as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired');
create type public.reservation_status as enum ('requested', 'confirmed', 'cancelled', 'completed');
create type public.order_status    as enum ('pending_payment', 'paid', 'fulfilled', 'completed', 'cancelled', 'refunded', 'disputed');
create type public.report_reason   as enum ('prohibited_item', 'scam_or_fraud', 'counterfeit', 'wrong_category', 'offensive', 'unsafe', 'other');
create type public.report_status   as enum ('open', 'reviewing', 'actioned', 'dismissed');

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles: one row per signed-up user (buyers and sellers are the same user)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  username           text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name       text not null default '',
  avatar_url         text,
  bio                text check (char_length(bio) <= 1000),
  preferred_language public.app_language not null default 'en',
  country_code       char(2),                      -- ISO 3166-1 alpha-2, e.g. 'US'
  region             text,                         -- state / province
  city               text,
  stripe_account_id  text unique,                  -- Stripe Connect account (sellers)
  payouts_enabled    boolean not null default false,
  is_admin           boolean not null default false,
  is_suspended       boolean not null default false,
  rating_avg         numeric(3, 2) not null default 0,
  rating_count       integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically when someone signs up through Supabase Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Users may edit their own profile but not grant themselves admin, unsuspend
-- themselves, or fake their rating / payout status. Updates made by other
-- triggers (such as the rating refresh after a review) are allowed through.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() <= 1 and auth.uid() is not null and not public.is_admin() then
    new.is_admin          := old.is_admin;
    new.is_suspended      := old.is_suspended;
    new.rating_avg        := old.rating_avg;
    new.rating_count      := old.rating_count;
    new.stripe_account_id := old.stripe_account_id;
    new.payouts_enabled   := old.payouts_enabled;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- -----------------------------------------------------------------------------
-- Categories (tree: e.g. Services > Cleaning). Names in English and Arabic.
-- -----------------------------------------------------------------------------
create table public.categories (
  id                 serial primary key,
  parent_id          integer references public.categories (id) on delete restrict,
  slug               text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_en            text not null,
  name_ar            text not null,
  icon               text,
  allowed_modes      public.listing_mode[] not null,   -- which ways to trade this category allows
  requires_license   boolean not null default false,   -- seller must confirm a license (real estate, investigators, ...)
  attribute_schema   jsonb not null default '{}'::jsonb, -- fields expected in listings.attributes
  sort_order         integer not null default 0,
  is_active          boolean not null default true
);

create index categories_parent_idx on public.categories (parent_id);

-- -----------------------------------------------------------------------------
-- Listings
-- -----------------------------------------------------------------------------
create table public.listings (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references public.profiles (id) on delete cascade,
  category_id    integer not null references public.categories (id),
  title          text not null check (char_length(title) between 3 and 140),
  description    text not null default '' check (char_length(description) <= 10000),
  language       public.app_language not null default 'en',
  condition      public.item_condition not null default 'not_applicable',
  status         public.listing_status not null default 'draft',
  currency       char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  quantity       integer not null default 1 check (quantity >= 0),
  attributes     jsonb not null default '{}'::jsonb,
  -- Location (public, approximate). Exact addresses are shared only after a deal.
  country_code   char(2) not null default 'US',
  region         text,
  city           text,
  postal_code    text,
  latitude       numeric(9, 6) check (latitude between -90 and 90),
  longitude      numeric(9, 6) check (longitude between -180 and 180),
  ships          boolean not null default false,
  local_pickup   boolean not null default true,
  featured_until timestamptz,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  search_vector  tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored
);

create index listings_seller_idx    on public.listings (seller_id);
create index listings_browse_idx    on public.listings (status, category_id, published_at desc);
create index listings_location_idx  on public.listings (country_code, region, city);
create index listings_search_idx    on public.listings using gin (search_vector);
create index listings_attributes_idx on public.listings using gin (attributes jsonb_path_ops);

create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

-- Set published_at the first time a listing goes live.
create or replace function public.listings_set_published_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_published_at before insert or update of status on public.listings
  for each row execute function public.listings_set_published_at();

-- -----------------------------------------------------------------------------
-- Listing modes: how a listing is offered (one row per way)
-- -----------------------------------------------------------------------------
create table public.listing_modes (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid not null references public.listings (id) on delete cascade,
  mode               public.listing_mode not null,
  -- sale: fixed price.  booking: price per session.
  price_cents        bigint check (price_cents > 0),
  accepts_offers     boolean not null default false,  -- "Make an offer" on sales
  -- auction
  start_price_cents  bigint check (start_price_cents > 0),
  reserve_price_cents bigint check (reserve_price_cents > 0),
  buy_now_price_cents bigint check (buy_now_price_cents > 0),
  min_increment_cents bigint not null default 100 check (min_increment_cents > 0),
  starts_at          timestamptz,
  ends_at            timestamptz,
  -- rental
  rate_cents         bigint check (rate_cents > 0),
  rate_unit          public.rate_unit,
  min_units          integer check (min_units > 0),
  deposit_cents      bigint check (deposit_cents >= 0),
  -- booking (services)
  session_minutes    integer check (session_minutes > 0),
  created_at         timestamptz not null default now(),
  unique (listing_id, mode),
  constraint listing_modes_fields check (
    case mode
      when 'sale'    then price_cents is not null
      when 'auction' then start_price_cents is not null and ends_at is not null
                          and (starts_at is null or starts_at < ends_at)
      when 'rental'  then rate_cents is not null and rate_unit is not null
      when 'booking' then price_cents is not null and session_minutes is not null
    end
  )
);

create index listing_modes_auction_end_idx on public.listing_modes (ends_at) where mode = 'auction';

-- A listing may only use modes its category allows.
create or replace function public.check_listing_mode_allowed()
returns trigger language plpgsql as $$
declare
  allowed public.listing_mode[];
begin
  select c.allowed_modes into allowed
  from public.listings l join public.categories c on c.id = l.category_id
  where l.id = new.listing_id;

  if not (new.mode = any (allowed)) then
    raise exception 'Mode % is not allowed for this category', new.mode
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger listing_modes_allowed before insert or update of mode on public.listing_modes
  for each row execute function public.check_listing_mode_allowed();

-- -----------------------------------------------------------------------------
-- Listing images (files live in Supabase Storage; this stores the path)
-- -----------------------------------------------------------------------------
create table public.listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  position     smallint not null default 0 check (position >= 0),
  alt_text     text,
  created_at   timestamptz not null default now(),
  unique (listing_id, position)
);

-- -----------------------------------------------------------------------------
-- Auctions: bids
-- -----------------------------------------------------------------------------
create table public.bids (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings (id) on delete cascade,
  bidder_id     uuid not null references public.profiles (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents > 0),
  created_at    timestamptz not null default now()
);

create index bids_listing_amount_idx on public.bids (listing_id, amount_cents desc);

-- A bid must be on a live auction, before it ends, not by the seller, and at
-- least the start price (first bid) or highest bid + increment (later bids).
create or replace function public.validate_bid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m        public.listing_modes;
  l        public.listings;
  highest  bigint;
begin
  select * into l from public.listings where id = new.listing_id;
  select * into m from public.listing_modes where listing_id = new.listing_id and mode = 'auction';

  if m.id is null then
    raise exception 'This listing is not an auction' using errcode = 'check_violation';
  end if;
  if l.status <> 'active' then
    raise exception 'This auction is not active' using errcode = 'check_violation';
  end if;
  if new.bidder_id = l.seller_id then
    raise exception 'Sellers cannot bid on their own auction' using errcode = 'check_violation';
  end if;
  if (m.starts_at is not null and now() < m.starts_at) or now() >= m.ends_at then
    raise exception 'This auction is not open for bids' using errcode = 'check_violation';
  end if;

  -- Lock the auction row so two bids cannot race past each other.
  perform 1 from public.listing_modes where id = m.id for update;
  select max(amount_cents) into highest from public.bids where listing_id = new.listing_id;

  if highest is null and new.amount_cents < m.start_price_cents then
    raise exception 'Bid must be at least the starting price' using errcode = 'check_violation';
  elsif highest is not null and new.amount_cents < highest + m.min_increment_cents then
    raise exception 'Bid must be at least % more than the highest bid', m.min_increment_cents
      using errcode = 'check_violation';
  end if;

  new.created_at := now();
  return new;
end;
$$;

create trigger bids_validate before insert on public.bids
  for each row execute function public.validate_bid();

-- -----------------------------------------------------------------------------
-- Offers ("Make an offer" on fixed-price listings)
-- -----------------------------------------------------------------------------
create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings (id) on delete cascade,
  buyer_id      uuid not null references public.profiles (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents > 0),
  message       text check (char_length(message) <= 1000),
  status        public.offer_status not null default 'pending',
  expires_at    timestamptz not null default now() + interval '48 hours',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index offers_listing_idx on public.offers (listing_id, status);
create index offers_buyer_idx   on public.offers (buyer_id);

create trigger offers_updated_at before update on public.offers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Reservations: rentals and service bookings (no overlaps allowed)
-- -----------------------------------------------------------------------------
create table public.reservations (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings (id) on delete cascade,
  renter_id     uuid not null references public.profiles (id) on delete cascade,
  mode          public.listing_mode not null check (mode in ('rental', 'booking')),
  period        tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  status        public.reservation_status not null default 'requested',
  notes         text check (char_length(notes) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- The same listing cannot be held by two live reservations at the same time.
  constraint reservations_no_overlap exclude using gist (
    listing_id with =,
    period with &&
  ) where (status in ('requested', 'confirmed'))
);

create index reservations_renter_idx on public.reservations (renter_id);

create trigger reservations_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Orders: one completed deal of any kind (sale, auction win, rental, booking)
-- -----------------------------------------------------------------------------
create table public.orders (
  id                        uuid primary key default gen_random_uuid(),
  listing_id                uuid not null references public.listings (id) on delete restrict,
  buyer_id                  uuid not null references public.profiles (id) on delete restrict,
  seller_id                 uuid not null references public.profiles (id) on delete restrict,
  mode                      public.listing_mode not null,
  bid_id                    uuid references public.bids (id),
  offer_id                  uuid references public.offers (id),
  reservation_id            uuid references public.reservations (id),
  quantity                  integer not null default 1 check (quantity > 0),
  currency                  char(3) not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents            bigint not null check (subtotal_cents >= 0),
  shipping_cents            bigint not null default 0 check (shipping_cents >= 0),
  tax_cents                 bigint not null default 0 check (tax_cents >= 0),
  platform_fee_bps          integer not null default 0 check (platform_fee_bps between 0 and 10000), -- 500 = 5%
  platform_fee_cents        bigint not null default 0 check (platform_fee_cents >= 0),
  total_cents               bigint generated always as (subtotal_cents + shipping_cents + tax_cents) stored,
  status                    public.order_status not null default 'pending_payment',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id  text unique,
  paid_at                   timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (buyer_id <> seller_id),
  check (reservation_id is null or mode in ('rental', 'booking')),
  check (bid_id is null or mode = 'auction')
);

create index orders_buyer_idx  on public.orders (buyer_id, created_at desc);
create index orders_seller_idx on public.orders (seller_id, created_at desc);

create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Messaging between buyer and seller, one conversation per listing + buyer
-- -----------------------------------------------------------------------------
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid references public.listings (id) on delete set null,
  buyer_id    uuid not null references public.profiles (id) on delete cascade,
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);

create index conversations_buyer_idx  on public.conversations (buyer_id, last_message_at desc);
create index conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 5000),
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- -----------------------------------------------------------------------------
-- Reviews: after an order, each side may review the other once
-- -----------------------------------------------------------------------------
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  reviewer_id  uuid not null references public.profiles (id) on delete cascade,
  reviewee_id  uuid not null references public.profiles (id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 2000),
  created_at   timestamptz not null default now(),
  unique (order_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

create index reviews_reviewee_idx on public.reviews (reviewee_id, created_at desc);

-- Only the buyer or seller of a completed order may review, and only the other party.
create or replace function public.validate_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = new.order_id;
  if o.status not in ('fulfilled', 'completed') then
    raise exception 'You can review only after the order is fulfilled' using errcode = 'check_violation';
  end if;
  if not ((new.reviewer_id = o.buyer_id and new.reviewee_id = o.seller_id)
       or (new.reviewer_id = o.seller_id and new.reviewee_id = o.buyer_id)) then
    raise exception 'Reviews are only between the buyer and seller of this order' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger reviews_validate before insert on public.reviews
  for each row execute function public.validate_review();

-- Keep the profile rating up to date.
create or replace function public.refresh_profile_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update public.profiles p
  set rating_avg   = coalesce(s.avg_rating, 0),
      rating_count = coalesce(s.n, 0)
  from (select round(avg(rating)::numeric, 2) as avg_rating, count(*) as n
        from public.reviews where reviewee_id = target) s
  where p.id = target;
  return null;
end;
$$;

create trigger reviews_refresh_rating after insert or update or delete on public.reviews
  for each row execute function public.refresh_profile_rating();

-- -----------------------------------------------------------------------------
-- Favorites (saved listings)
-- -----------------------------------------------------------------------------
create table public.favorites (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  listing_id  uuid not null references public.listings (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- -----------------------------------------------------------------------------
-- Reports (the "Report" button) for listings or users
-- -----------------------------------------------------------------------------
create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid references public.profiles (id) on delete set null,
  listing_id     uuid references public.listings (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete cascade,
  reason         public.report_reason not null,
  details        text check (char_length(details) <= 2000),
  status         public.report_status not null default 'open',
  resolved_by    uuid references public.profiles (id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  check (listing_id is not null or reported_user_id is not null)
);

create index reports_status_idx on public.reports (status, created_at);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles       enable row level security;
alter table public.categories     enable row level security;
alter table public.listings       enable row level security;
alter table public.listing_modes  enable row level security;
alter table public.listing_images enable row level security;
alter table public.bids           enable row level security;
alter table public.offers         enable row level security;
alter table public.reservations   enable row level security;
alter table public.orders         enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.reviews        enable row level security;
alter table public.favorites      enable row level security;
alter table public.reports        enable row level security;

-- Helper: is the current user the seller of this listing?
create or replace function public.owns_listing(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings where id = p_listing_id and seller_id = auth.uid());
$$;

-- Helper: is this listing publicly visible?
create or replace function public.listing_is_public(p_listing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listings where id = p_listing_id and status in ('active', 'sold'));
$$;

-- Profiles: public read, owners update their own.
create policy "Profiles are public" on public.profiles for select using (true);
create policy "Users update own profile" on public.profiles for update
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Categories: public read, admins manage.
create policy "Categories are public" on public.categories for select using (true);
create policy "Admins manage categories" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- Listings: public sees active/sold; sellers see and manage their own.
create policy "Public listings are visible" on public.listings for select
  using (status in ('active', 'sold') or seller_id = auth.uid() or public.is_admin());
create policy "Sellers create listings" on public.listings for insert
  with check (seller_id = auth.uid()
              and not exists (select 1 from public.profiles where id = auth.uid() and is_suspended));
create policy "Sellers update own listings" on public.listings for update
  using (seller_id = auth.uid() or public.is_admin()) with check (seller_id = auth.uid() or public.is_admin());
create policy "Sellers delete own drafts" on public.listings for delete
  using ((seller_id = auth.uid() and status = 'draft') or public.is_admin());

-- Listing modes and images follow their listing.
create policy "Modes visible with listing" on public.listing_modes for select
  using (public.listing_is_public(listing_id) or public.owns_listing(listing_id) or public.is_admin());
create policy "Sellers manage modes" on public.listing_modes for all
  using (public.owns_listing(listing_id)) with check (public.owns_listing(listing_id));

create policy "Images visible with listing" on public.listing_images for select
  using (public.listing_is_public(listing_id) or public.owns_listing(listing_id) or public.is_admin());
create policy "Sellers manage images" on public.listing_images for all
  using (public.owns_listing(listing_id)) with check (public.owns_listing(listing_id));

-- Bids: public can see bid amounts (auction history); signed-in users bid as themselves.
create policy "Bids are visible on public auctions" on public.bids for select
  using (public.listing_is_public(listing_id) or public.owns_listing(listing_id) or bidder_id = auth.uid());
create policy "Users place their own bids" on public.bids for insert
  with check (bidder_id = auth.uid());

-- Offers: only the buyer and the seller can see them.
create policy "Offer parties can see offers" on public.offers for select
  using (buyer_id = auth.uid() or public.owns_listing(listing_id) or public.is_admin());
create policy "Buyers make offers" on public.offers for insert
  with check (buyer_id = auth.uid() and not public.owns_listing(listing_id) and status = 'pending');
create policy "Offer parties update offers" on public.offers for update
  using (buyer_id = auth.uid() or public.owns_listing(listing_id));

-- Reservations: renter and seller see them; renters request, both may update status.
create policy "Reservation parties can see reservations" on public.reservations for select
  using (renter_id = auth.uid() or public.owns_listing(listing_id) or public.is_admin());
create policy "Renters request reservations" on public.reservations for insert
  with check (renter_id = auth.uid() and not public.owns_listing(listing_id) and status = 'requested');
create policy "Reservation parties update reservations" on public.reservations for update
  using (renter_id = auth.uid() or public.owns_listing(listing_id));

-- Orders: created and updated by the server (service role) after payment;
-- buyers and sellers can read their own.
create policy "Order parties can see orders" on public.orders for select
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

-- Conversations and messages: only the two participants.
create policy "Participants see conversations" on public.conversations for select
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());
create policy "Buyers start conversations" on public.conversations for insert
  with check (buyer_id = auth.uid()
              and (listing_id is null or exists (
                select 1 from public.listings l where l.id = listing_id and l.seller_id = conversations.seller_id)));

create policy "Participants read messages" on public.messages for select
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid()))
         or public.is_admin());
create policy "Participants send messages" on public.messages for insert
  with check (sender_id = auth.uid() and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())));
create policy "Recipients mark messages read" on public.messages for update
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())));

-- Reviews: public read; the reviewer writes their own.
create policy "Reviews are public" on public.reviews for select using (true);
create policy "Users write their own reviews" on public.reviews for insert
  with check (reviewer_id = auth.uid());

-- Favorites: private to the user.
create policy "Users manage their favorites" on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reports: anyone signed in can file; only admins read and resolve.
create policy "Users file reports" on public.reports for insert
  with check (reporter_id = auth.uid());
create policy "Admins read reports" on public.reports for select using (public.is_admin());
create policy "Admins resolve reports" on public.reports for update
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Seed: starting categories (English + Arabic)
-- =============================================================================
insert into public.categories (slug, name_en, name_ar, icon, allowed_modes, requires_license, sort_order, attribute_schema) values
  ('vehicles',     'Vehicles',          'المركبات',           '🚗', '{sale,auction,rental}', false, 10,
     '{"make":"text","model":"text","year":"integer","mileage":"integer","vin":"text","fuel":"text","transmission":"text"}'),
  ('real-estate',  'Homes & Apartments','المنازل والشقق',     '🏠', '{sale,auction,rental}', false, 20,
     '{"property_type":"text","bedrooms":"integer","bathrooms":"number","square_feet":"integer","furnished":"boolean"}'),
  ('boats',        'Boats',             'القوارب',            '🚤', '{sale,auction,rental}', false, 30,
     '{"make":"text","model":"text","year":"integer","length_feet":"number","hull_id":"text"}'),
  ('clothes',      'Clothes',           'الملابس',            '👕', '{sale,auction}',        false, 40,
     '{"brand":"text","size":"text","gender":"text","color":"text"}'),
  ('jewelry',      'Jewelry',           'المجوهرات',          '💍', '{sale,auction}',        false, 50,
     '{"metal":"text","karat":"integer","stone":"text","stone_origin":"text","weight_grams":"number"}'),
  ('accessories',  'Accessories',       'الإكسسوارات',        '🎒', '{sale,auction}',        false, 60,
     '{"brand":"text","color":"text"}'),
  ('furniture',    'Furniture',         'الأثاث',             '🛋️', '{sale,auction,rental}', false, 70,
     '{"material":"text","width_cm":"number","depth_cm":"number","height_cm":"number"}'),
  ('equipment',    'Equipment',         'المعدات',            '🔧', '{sale,auction,rental}', false, 80,
     '{"brand":"text","model":"text","power_source":"text"}'),
  ('instruments',  'Instruments',       'الآلات الموسيقية',   '🎸', '{sale,auction,rental}', false, 90,
     '{"instrument_type":"text","brand":"text","model":"text"}'),
  ('food',         'Food',              'الطعام',             '🍲', '{sale}',                false, 100,
     '{"homemade":"boolean","allergens":"text[]","producer_name":"text","producer_id_or_address":"text","made_on":"date","requires_refrigeration":"boolean"}'),
  ('services',     'Services',          'الخدمات',            '🔔', '{booking}',             false, 110, '{}');

insert into public.categories (parent_id, slug, name_en, name_ar, icon, allowed_modes, requires_license, sort_order)
select s.id, v.slug, v.name_en, v.name_ar, v.icon, '{booking}', v.requires_license, v.sort_order
from public.categories s,
     (values
       ('cleaning',       'Cleaning',             'التنظيف',                 '🧹', false, 1),
       ('sports-classes', 'Sports classes',       'دروس رياضية',             '⚽', false, 2),
       ('music-lessons',  'Music lessons',        'دروس موسيقى',             '🎵', false, 3),
       ('drivers',        'Drivers',              'سائقون',                  '🚘', true,  4),
       ('investigators',  'Private investigators','محققون خاصون',            '🕵️', true,  5)
     ) as v(slug, name_en, name_ar, icon, requires_license, sort_order)
where s.slug = 'services';
