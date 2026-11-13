-- =============================================================================
-- Anston: people can change their username, once every 30 days.
-- The limit stops people from hopping between names, or grabbing a name
-- someone just gave up, to impersonate them. Picking a username for the first
-- time doesn't count as a change.
-- Run after 20261112000000_usernames_and_age.sql.
-- =============================================================================

alter table public.profiles add column if not exists username_changed_at timestamptz;

create or replace function public.limit_username_changes()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  -- Only the database sets the change time.
  new.username_changed_at := old.username_changed_at;
  if old.username is not null and new.username is null then
    new.username := old.username;          -- a username can't be removed
  elsif old.username is not null and new.username is distinct from old.username then
    if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'username_cooldown'
        using errcode = 'P0001',
              hint = to_char(old.username_changed_at + interval '30 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

-- Runs after profiles_protect_columns (triggers run in name order), so the
-- username is already lowercased here.
drop trigger if exists profiles_username_change on public.profiles;
create trigger profiles_username_change before update on public.profiles
  for each row execute function public.limit_username_changes();
