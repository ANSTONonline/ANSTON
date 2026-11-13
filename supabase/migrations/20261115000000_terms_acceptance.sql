-- =============================================================================
-- Anston: record when each person agreed to the Terms of Service and Privacy
-- Policy, and which version they agreed to.
-- Run after 20261112000000_usernames_and_age.sql.
-- =============================================================================

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;

-- New accounts: the sign-up form sends terms_accepted and terms_version.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := lower(coalesce(meta ->> 'username', ''));
  confirmed boolean := coalesce((meta ->> 'age_confirmed')::boolean, false);
  agreed boolean := coalesce((meta ->> 'terms_accepted')::boolean, false);
begin
  insert into public.profiles (id, display_name, username, age_confirmed_at, terms_accepted_at, terms_version)
  values (
    new.id,
    coalesce(meta ->> 'display_name', meta ->> 'full_name', ''),
    case when public.username_available(wanted) then wanted end,
    case when confirmed then now() end,
    case when agreed then now() end,
    case when agreed then left(meta ->> 'terms_version', 40) end
  );
  return new;
exception when unique_violation then
  insert into public.profiles (id, display_name, age_confirmed_at, terms_accepted_at, terms_version)
  values (new.id, coalesce(meta ->> 'display_name', ''),
          case when confirmed then now() end,
          case when agreed then now() end,
          case when agreed then left(meta ->> 'terms_version', 40) end)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- People can agree (or agree again to a newer version), but the time is always
-- set by the database and an agreement can't be erased.
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
    if old.age_confirmed_at is not null then
      new.age_confirmed_at := old.age_confirmed_at;
    elsif new.age_confirmed_at is not null then
      new.age_confirmed_at := now();
    end if;
    if new.terms_accepted_at is null then
      new.terms_accepted_at := old.terms_accepted_at;
      new.terms_version := old.terms_version;
    elsif new.terms_accepted_at is distinct from old.terms_accepted_at then
      new.terms_accepted_at := now();
      new.terms_version := left(new.terms_version, 40);
    else
      new.terms_version := old.terms_version;
    end if;
  end if;
  if new.username is not null then
    new.username := lower(new.username);
  end if;
  return new;
end;
$$;
