-- =============================================================================
-- Rental available dates
--
-- When listing a rental priced per day, week or month, the seller can list the
-- date ranges it's available, e.g. [{"from":"2026-12-01","to":"2026-12-20"}].
-- "from" and "to" are the first and last nights a renter can stay; the renter
-- can leave the morning after "to". No ranges means available any time.
-- Requests outside the ranges are refused by the database.
-- =============================================================================

alter table public.listing_modes add column if not exists rental_dates jsonb
  check (rental_dates is null or jsonb_typeof(rental_dates) = 'array');

-- Does this rental reservation fall within the seller's available dates?
create or replace function public.rental_fits_dates(p_listing uuid, p_period tstzrange)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  ranges jsonb;
  night date;
  last_night date;
  ok boolean;
  r jsonb;
begin
  select rental_dates into ranges from public.listing_modes where listing_id = p_listing and mode = 'rental';
  if ranges is null or jsonb_array_length(ranges) = 0 then
    return true;
  end if;
  night := (lower(p_period) at time zone 'UTC')::date;
  -- Stays end at noon on the day you leave, so the last night is the day before.
  last_night := ((upper(p_period) at time zone 'UTC') - interval '12 hours 1 minute')::date;
  while night <= last_night loop
    ok := false;
    for r in select * from jsonb_array_elements(ranges) loop
      if night between (r->>'from')::date and (r->>'to')::date then
        ok := true;
        exit;
      end if;
    end loop;
    if not ok then
      return false;
    end if;
    night := night + 1;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;
revoke all on function public.rental_fits_dates(uuid, tstzrange) from public, anon;
grant execute on function public.rental_fits_dates(uuid, tstzrange) to authenticated;

create or replace function public.check_rental_dates()
returns trigger language plpgsql as $$
begin
  if new.mode = 'rental' and not public.rental_fits_dates(new.listing_id, new.period) then
    raise exception 'outside_availability' using errcode = 'check_violation',
      hint = 'Choose dates the seller listed as available.';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_rental_dates on public.reservations;
create trigger reservations_rental_dates before insert on public.reservations
  for each row execute function public.check_rental_dates();
