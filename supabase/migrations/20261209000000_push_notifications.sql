-- =============================================================================
-- Push notifications for the Anston iPhone and Android apps
--
-- * public.push_tokens: one row per phone that allowed notifications. The app
--   registers its token with public.register_push_token() after sign-in, and
--   forgets it with public.forget_push_token() after sign-out.
-- * private.push(): called from private.notify(), so every event that already
--   sends an email (new message, offer, bid, order, payout...) also sends a
--   phone notification, even to members who turned emails off. The phone's own
--   notification permission is the on/off switch.
-- * Delivery happens in the website's /api/push/send route (Firebase for
--   Android, Apple Push for iPhone). It is protected by a shared secret stored
--   here in Vault as 'push_secret' and in Vercel as PUSH_SECRET.
--
-- Setup: in Supabase SQL Editor run
--   select vault.create_secret('<long random value>', 'push_secret');
-- and put the same value in Vercel as PUSH_SECRET.
-- =============================================================================

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- Only the functions below touch this table.
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

-- Save this phone's token for the signed-in member. A token that belonged to
-- someone else (shared phone, switched accounts) moves to the new member.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'insufficient_privilege';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096
     or p_platform not in ('android', 'ios') then
    raise exception 'bad_token' using errcode = 'check_violation';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Stop notifications to this phone (after signing out). Knowing the token is
-- enough: only the phone itself has it.
create or replace function public.forget_push_token(p_token text)
returns void
language sql security definer set search_path = public as $$
  delete from public.push_tokens where token = p_token;
$$;
revoke all on function public.forget_push_token(text) from public;
grant execute on function public.forget_push_token(text) to anon, authenticated;

-- Called by /api/push/send with tokens that Firebase/Apple say are no longer
-- valid (app deleted, notifications reset).
create or replace function public.forget_invalid_push_tokens(p_secret text, p_tokens text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  expected text;
begin
  select decrypted_secret into expected from vault.decrypted_secrets where name = 'push_secret' limit 1;
  if expected is null or expected = '' or p_secret is distinct from expected then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  delete from public.push_tokens where token = any (p_tokens);
end;
$$;
revoke all on function public.forget_invalid_push_tokens(text, text[]) from public;
grant execute on function public.forget_invalid_push_tokens(text, text[]) to anon, authenticated;

-- Deleted accounts get no more notifications.
create or replace function private.forget_push_tokens_on_delete()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.push_tokens where user_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_forget_push_tokens on public.profiles;
create trigger profiles_forget_push_tokens
  after update of deleted_at on public.profiles
  for each row execute function private.forget_push_tokens_on_delete();

-- Send a phone notification to every phone the member has the app on.
create or replace function private.push(recipient uuid, title text, body text, link_path text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  secret text;
  tokens jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform)), '[]'::jsonb)
    into tokens
    from public.push_tokens t
   where t.user_id = recipient;
  if jsonb_array_length(tokens) = 0 then
    return;
  end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret' limit 1;
  if secret is null or secret = '' then
    return;
  end if;

  perform net.http_post(
    url := 'https://www.myanston.com/api/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Push-Secret', secret),
    body := jsonb_build_object(
      'tokens', tokens,
      'title', left(coalesce(title, 'Anston'), 120),
      'body', left(coalesce(body, ''), 300),
      'link', coalesce(link_path, '/')
    )
  );
exception when others then
  -- A notification problem must never stop the message, bid or order itself.
  raise warning 'push notification failed: %', sqlerrm;
end;
$$;

-- private.notify(), unchanged except that it now also sends the push above.
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
  -- Phone notification (Anston app), independent of the email setting below.
  perform private.push(recipient, headline, detail, link_path);

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
