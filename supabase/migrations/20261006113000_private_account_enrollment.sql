-- One-time, email-free enrollment for the single personal account.
-- Email addresses and enrollment codes are stored only as SHA-256 hashes.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.wordrecall_account_enrollment (
  email_hash text primary key check (char_length(email_hash) = 64),
  enrollment_code_hash text check (
    enrollment_code_hash is null or char_length(enrollment_code_hash) = 64
  ),
  consumed_at timestamptz
);

create table private.wordrecall_pending_sync (
  email_hash text not null references private.wordrecall_account_enrollment(email_hash) on delete cascade,
  table_name text not null,
  record_id text not null,
  payload jsonb not null,
  deleted_at timestamptz,
  primary key (email_hash, table_name, record_id)
);

revoke all on private.wordrecall_account_enrollment from public, anon, authenticated;
revoke all on private.wordrecall_pending_sync from public, anon, authenticated;

insert into private.wordrecall_account_enrollment (email_hash)
select encode(extensions.digest(lower(trim(email)), 'sha256'), 'hex')
from auth.users
where email is not null
on conflict (email_hash) do nothing;

insert into private.wordrecall_pending_sync (
  email_hash, table_name, record_id, payload, deleted_at
)
select
  encode(extensions.digest(lower(trim(users.email)), 'sha256'), 'hex'),
  records.table_name,
  records.record_id,
  records.payload,
  records.deleted_at
from public.sync_records records
join auth.users users on users.id = records.user_id
where users.email is not null
on conflict (email_hash, table_name, record_id) do update
set payload = excluded.payload,
    deleted_at = excluded.deleted_at;

create or replace function private.wordrecall_before_user_created(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  incoming_email text := lower(trim(event #>> '{user,email}'));
  enrollment_code text := event #>> '{user,user_metadata,enrollment_code}';
begin
  if incoming_email is not null
     and enrollment_code is not null
     and exists (
       select 1
       from private.wordrecall_account_enrollment enrollment
       where enrollment.email_hash = encode(
         extensions.digest(incoming_email, 'sha256'), 'hex'
       )
       and enrollment.enrollment_code_hash = encode(
         extensions.digest(enrollment_code, 'sha256'), 'hex'
       )
       and enrollment.consumed_at is null
     ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Account enrollment is not permitted.'
    )
  );
end;
$$;

revoke all on function private.wordrecall_before_user_created(jsonb)
  from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant select on private.wordrecall_account_enrollment to supabase_auth_admin;
grant execute on function private.wordrecall_before_user_created(jsonb)
  to supabase_auth_admin;

create or replace function private.wordrecall_restore_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_hash text := encode(
    extensions.digest(lower(trim(new.email)), 'sha256'), 'hex'
  );
begin
  insert into public.sync_records (
    user_id, table_name, record_id, payload, deleted_at
  )
  select new.id, pending.table_name, pending.record_id,
         pending.payload, pending.deleted_at
  from private.wordrecall_pending_sync pending
  where pending.email_hash = account_hash
  on conflict (user_id, table_name, record_id) do update
  set payload = excluded.payload,
      deleted_at = excluded.deleted_at;

  delete from private.wordrecall_pending_sync
  where email_hash = account_hash;

  update private.wordrecall_account_enrollment
  set consumed_at = statement_timestamp(), enrollment_code_hash = null
  where email_hash = account_hash;

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    - 'enrollment_code'
  where id = new.id;

  return new;
end;
$$;

revoke all on function private.wordrecall_restore_enrollment()
  from public, anon, authenticated, supabase_auth_admin;

create trigger wordrecall_restore_enrollment
after insert on auth.users
for each row execute function private.wordrecall_restore_enrollment();

