-- =============================================================================
-- Weekly availability for service listings
--
-- Sellers set the days and hours they take bookings, in their own time zone.
-- Buyers pick from the open time slots, and the database makes sure every
-- booking is one session long and falls inside those hours. Listings made
-- before this (no availability saved) keep working as before.
-- =============================================================================

alter table public.listing_modes
  add column if not exists availability jsonb check (availability is null or jsonb_typeof(availability) = 'object'),
  add column if not exists time_zone text check (time_zone is null or char_length(time_zone) <= 64);

-- Does a booking fit the seller's hours?
create or replace function public.booking_fits_availability(p_listing uuid, p_period tstzrange)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  m          public.listing_modes;
  local_from timestamp;
  local_to   timestamp;
  start_min  int;
  end_min    int;
  w          jsonb;
begin
  select * into m from public.listing_modes where listing_id = p_listing and mode = 'booking';
  if m.id is null then
    return false;
  end if;
  if m.availability is null or m.time_zone is null then
    return true; -- older listing without set hours
  end if;
  if upper(p_period) - lower(p_period) <> make_interval(mins => coalesce(m.session_minutes, 60)) then
    return false;
  end if;
  local_from := lower(p_period) at time zone m.time_zone;
  local_to   := upper(p_period) at time zone m.time_zone;
  start_min  := extract(hour from local_from)::int * 60 + extract(minute from local_from)::int;
  end_min    := case when local_to::date > local_from::date
                     then 1440 else extract(hour from local_to)::int * 60 + extract(minute from local_to)::int end;
  if local_to::date > local_from::date and local_to::time <> '00:00' then
    return false; -- sessions can't run past midnight
  end if;
  for w in select * from jsonb_array_elements(coalesce(m.availability -> extract(dow from local_from)::int::text, '[]'::jsonb)) loop
    if start_min >= (w ->> 0)::int and end_min <= (w ->> 1)::int then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create or replace function public.check_booking_hours()
returns trigger language plpgsql as $$
begin
  if new.mode = 'booking' and not public.booking_fits_availability(new.listing_id, new.period) then
    raise exception 'outside_availability' using errcode = 'check_violation',
      hint = 'Choose one of the open times.';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_booking_hours on public.reservations;
create trigger reservations_booking_hours before insert on public.reservations
  for each row execute function public.check_booking_hours();

-- Times already taken on a listing, so the site can hide them. Only the
-- start and end times are returned, never who booked.
create or replace function public.booked_times(p_listing uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(r.period), upper(r.period)
    from public.reservations r
   where r.listing_id = p_listing
     and r.status in ('requested', 'confirmed')
     and r.period && tstzrange(p_from, least(p_to, p_from + interval '3 days'))
     and public.listing_is_public(p_listing);
$$;

revoke all on function public.booked_times(uuid, timestamptz, timestamptz) from public;
grant execute on function public.booked_times(uuid, timestamptz, timestamptz) to anon, authenticated;
revoke all on function public.booking_fits_availability(uuid, tstzrange) from public, anon;
grant execute on function public.booking_fits_availability(uuid, tstzrange) to authenticated;

-- Booking emails show the time in the seller's time zone when it's known.
create or replace function private.on_new_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l  public.listings;
  tz text;
begin
  select * into l from public.listings where id = new.listing_id;
  select time_zone into tz from public.listing_modes where listing_id = l.id and mode = new.mode;
  tz := coalesce(tz, 'UTC');
  perform private.notify(
    l.seller_id,
    case when new.mode = 'booking' then 'New booking request' else 'New rental request' end
      || ' for "' || left(l.title, 80) || '"',
    case when new.mode = 'booking' then 'You have a new booking request' else 'You have a new rental request' end,
    private.username_of(new.renter_id) || ' wants to '
      || case when new.mode = 'booking' then 'book' else 'rent' end
      || ' "' || left(l.title, 120) || '" from '
      || to_char(lower(new.period) at time zone tz, 'Mon DD, YYYY HH12:MI AM') || ' to '
      || to_char(upper(new.period) at time zone tz, 'Mon DD, YYYY HH12:MI AM') || ' (' || replace(tz, '_', ' ') || ').',
    '/account/selling',
    'Confirm or decline'
  );
  return new;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
