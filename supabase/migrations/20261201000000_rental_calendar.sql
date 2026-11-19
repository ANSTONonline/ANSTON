-- =============================================================================
-- Rental calendar
--
-- Rentals priced per day, week or month are booked by date on a calendar.
-- Their reservations are stored from noon UTC on the first day to noon UTC on
-- the end day, so the calendar date is the same in every time zone from
-- UTC-11 to UTC+11. Visitors can see which dates are taken (not by whom).
-- =============================================================================

-- Dates already taken on a rental, for the next ~13 months. No renter details.
create or replace function public.rental_busy(p_listing uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(r.period), upper(r.period)
    from public.reservations r
   where r.listing_id = p_listing
     and r.mode = 'rental'
     and r.status in ('requested', 'confirmed')
     and r.period && tstzrange(now() - interval '1 day', now() + interval '400 days')
     and public.listing_is_public(p_listing)
   order by lower(r.period)
   limit 500;
$$;
revoke all on function public.rental_busy(uuid) from public;
grant execute on function public.rental_busy(uuid) to anon, authenticated;

-- Request emails: whole-day rentals show dates only.
create or replace function private.on_new_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  l  public.listings;
  tz text;
  whole_days boolean;
  span text;
begin
  select * into l from public.listings where id = new.listing_id;
  select time_zone into tz from public.listing_modes where listing_id = l.id and mode = new.mode;
  tz := coalesce(tz, 'UTC');
  whole_days := (lower(new.period) at time zone 'UTC')::time = '12:00' and (upper(new.period) at time zone 'UTC')::time = '12:00';
  if whole_days then
    span := to_char(lower(new.period) at time zone 'UTC', 'Mon DD, YYYY') || ' to '
         || to_char(upper(new.period) at time zone 'UTC', 'Mon DD, YYYY') || '.';
  else
    span := to_char(lower(new.period) at time zone tz, 'Mon DD, YYYY HH12:MI AM') || ' to '
         || to_char(upper(new.period) at time zone tz, 'Mon DD, YYYY HH12:MI AM') || ' (' || replace(tz, '_', ' ') || ').';
  end if;
  perform private.notify(
    l.seller_id,
    case when new.mode = 'booking' then 'New booking request' else 'New rental request' end
      || ' for "' || left(l.title, 80) || '"',
    case when new.mode = 'booking' then 'You have a new booking request' else 'You have a new rental request' end,
    private.username_of(new.renter_id) || ' wants to '
      || case when new.mode = 'booking' then 'book' else 'rent' end
      || ' "' || left(l.title, 120) || '" from ' || span,
    '/account/selling',
    'Confirm or decline'
  );
  return new;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
