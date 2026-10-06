create table public.sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null check (table_name in (
    'userWords', 'userExpressions', 'studyCards', 'reviewLogs',
    'appSettings', 'progressSnapshots'
  )),
  record_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text not null,
  primary key (user_id, table_name, record_id)
);

create index sync_records_user_updated_idx
  on public.sync_records (user_id, updated_at);

alter table public.sync_records enable row level security;

revoke all on public.sync_records from anon;
grant select, insert, update, delete on public.sync_records to authenticated;

create policy "Users can read their own sync records"
  on public.sync_records for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own sync records"
  on public.sync_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own sync records"
  on public.sync_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own sync records"
  on public.sync_records for delete to authenticated
  using ((select auth.uid()) = user_id);

