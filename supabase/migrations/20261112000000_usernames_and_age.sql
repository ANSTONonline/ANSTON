-- =============================================================================
-- Anston: usernames chosen at sign-up, and the 18+ age confirmation.
-- Run after the earlier migrations.
-- =============================================================================

-- When the person confirmed they are 18 or older (we keep the confirmation,
-- not their birth date).
alter table public.profiles add column if not exists age_confirmed_at timestamptz;

-- Names nobody can take.
create or replace function public.is_reserved_username(p_username text)
returns boolean language sql immutable as $$
  select lower(p_username) = any (array[
    'admin', 'administrator', 'anston', 'myanston', 'support', 'help', 'root', 'system',
    'moderator', 'staff', 'official', 'security', 'billing', 'payments', 'account', 'accounts',
    'api', 'www', 'mail', 'null', 'undefined'
  ]);
$$;

-- Lets the sign-up form check a username before the account exists.
-- Usernames are 3–30 lowercase letters, numbers or underscores.
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,30}$'
     and not public.is_reserved_username(p_username)
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- Create the profile with the username and age confirmation sent at sign-up.
-- If the username was taken in the meantime, the account is still created and
-- the person picks another one on the "finish setting up" page.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  confirmed boolean := coalesce((new.raw_user_meta_data ->> 'age_confirmed')::boolean, false);
begin
  insert into public.profiles (id, display_name, username, age_confirmed_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''),
    case when public.username_available(wanted) then wanted end,
    case when confirmed then now() end
  );
  return new;
exception when unique_violation then
  insert into public.profiles (id, display_name, age_confirmed_at)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''), case when confirmed then now() end)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Usernames are stored in lowercase and can't be reserved names.
alter table public.profiles drop constraint if exists profiles_username_not_reserved;
alter table public.profiles add constraint profiles_username_not_reserved
  check (username is null or not public.is_reserved_username(username));

-- People may set their own username and age confirmation, but only once for
-- the age confirmation (it can't be cleared).
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
  end if;
  if new.username is not null then
    new.username := lower(new.username);
  end if;
  return new;
end;
$$;
