-- =============================================================================
-- Moderation: tools behind the admin reports page.
--
-- * A listing an admin removed stays removed: its seller can't make it
--   active again.
-- * Suspended accounts can't bid, make offers, request bookings or send
--   messages (they already couldn't post listings).
-- * Admins get an email for every new report.
--
-- To make yourself an admin, run in the SQL Editor:
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
-- =============================================================================

-- Only admins can bring back a removed listing.
create or replace function public.keep_removed_listings_removed()
returns trigger language plpgsql as $$
begin
  if old.status = 'removed' and new.status <> 'removed'
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'listing_removed' using errcode = 'check_violation',
      hint = 'This listing was removed by Anston and cannot be reactivated.';
  end if;
  return new;
end;
$$;

drop trigger if exists listings_keep_removed on public.listings;
create trigger listings_keep_removed before update of status on public.listings
  for each row execute function public.keep_removed_listings_removed();

-- Suspended accounts can only read.
create or replace function public.block_suspended_members()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and is_suspended) then
    raise exception 'account_suspended' using errcode = 'insufficient_privilege',
      hint = 'This account is suspended.';
  end if;
  return new;
end;
$$;

drop trigger if exists bids_block_suspended on public.bids;
create trigger bids_block_suspended before insert on public.bids
  for each row execute function public.block_suspended_members();
drop trigger if exists offers_block_suspended on public.offers;
create trigger offers_block_suspended before insert on public.offers
  for each row execute function public.block_suspended_members();
drop trigger if exists reservations_block_suspended on public.reservations;
create trigger reservations_block_suspended before insert on public.reservations
  for each row execute function public.block_suspended_members();
drop trigger if exists conversations_block_suspended on public.conversations;
create trigger conversations_block_suspended before insert on public.conversations
  for each row execute function public.block_suspended_members();
drop trigger if exists messages_block_suspended on public.messages;
create trigger messages_block_suspended before insert on public.messages
  for each row execute function public.block_suspended_members();

-- Email every admin when someone files a report.
create or replace function private.on_new_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  admin_id uuid;
begin
  for admin_id in select id from public.profiles where is_admin loop
    perform private.notify(
      admin_id,
      'New report: ' || replace(new.reason::text, '_', ' '),
      'A listing was reported',
      private.username_of(new.reporter_id) || ' reported "'
        || coalesce(private.title_of(new.listing_id), 'a listing') || '" for: '
        || replace(new.reason::text, '_', ' ') || '.',
      '/admin',
      'Review reports'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists reports_email on public.reports;
create trigger reports_email after insert on public.reports
  for each row execute function private.on_new_report();

revoke all on all functions in schema private from public, anon, authenticated;
