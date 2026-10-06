-- Keep the cloud side deliberately small: one owner-scoped envelope table.
-- Dictionary data never belongs in this table.

alter table public.sync_records
  drop column device_id,
  alter column updated_at set default statement_timestamp(),
  add constraint sync_records_record_id_length
    check (char_length(record_id) between 1 and 160),
  add constraint sync_records_payload_object
    check (jsonb_typeof(payload) = 'object'),
  add constraint sync_records_payload_size
    check (octet_length(payload::text) <= 262144),
  add constraint sync_records_payload_id_matches
    check (payload ->> 'id' = record_id),
  add constraint sync_records_user_word_shape
    check (
      table_name <> 'userWords' or (
        jsonb_typeof(payload -> 'lemma') = 'string'
        and char_length(payload ->> 'lemma') between 1 and 160
        and jsonb_typeof(payload -> 'normalizedLemma') = 'string'
        and char_length(payload ->> 'normalizedLemma') between 1 and 160
        and coalesce(char_length(payload ->> 'customMeaningJa'), 0) <= 8000
        and coalesce(char_length(payload ->> 'customDefinitionEn'), 0) <= 8000
        and coalesce(char_length(payload ->> 'customExample'), 0) <= 8000
        and coalesce(char_length(payload ->> 'customMemo'), 0) <= 5000
      )
    ),
  add constraint sync_records_expression_shape
    check (
      table_name <> 'userExpressions' or (
        jsonb_typeof(payload -> 'expressionId') = 'string'
        and char_length(payload ->> 'expressionId') between 1 and 160
      )
    ),
  add constraint sync_records_study_card_shape
    check (
      table_name <> 'studyCards' or (
        payload ->> 'targetType' in ('word', 'expression')
        and jsonb_typeof(payload -> 'targetId') = 'string'
        and char_length(payload ->> 'targetId') between 1 and 160
        and jsonb_typeof(payload -> 'fsrsCardData') = 'object'
      )
    ),
  add constraint sync_records_review_log_shape
    check (
      table_name <> 'reviewLogs' or (
        jsonb_typeof(payload -> 'cardId') = 'string'
        and char_length(payload ->> 'cardId') between 1 and 160
        and (payload ->> 'rating')::integer between 1 and 4
        and payload ->> 'promptType' in (
          'definition', 'exampleCloze', 'expressionCloze', 'japaneseFallback'
        )
      )
    ),
  add constraint sync_records_settings_shape
    check (
      table_name <> 'appSettings' or (
        record_id = 'settings'
        and (payload ->> 'desiredRetention')::numeric between 0.80 and 0.97
        and (payload ->> 'masteryStabilityDays')::integer between 14 and 365
      )
    ),
  add constraint sync_records_snapshot_shape
    check (
      table_name <> 'progressSnapshots' or (
        payload ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
        and (payload ->> 'registeredWords')::integer >= 0
        and (payload ->> 'masteredWords')::integer >= 0
        and (payload ->> 'registeredExpressions')::integer >= 0
        and (payload ->> 'masteredExpressions')::integer >= 0
        and (payload ->> 'totalReviews')::integer >= 0
      )
    );

create unique index sync_records_unique_normalized_lemma
  on public.sync_records (user_id, (payload ->> 'normalizedLemma'))
  where table_name = 'userWords' and deleted_at is null;

create unique index sync_records_unique_expression
  on public.sync_records (user_id, (payload ->> 'expressionId'))
  where table_name = 'userExpressions' and deleted_at is null;

create or replace function public.secure_sync_record_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (
    select count(*) from public.sync_records where user_id = new.user_id
  ) >= 100000 then
    raise exception 'sync record quota exceeded' using errcode = '54000';
  end if;

  new.updated_at := statement_timestamp();
  if new.deleted_at is not null
     and (tg_op = 'INSERT' or old.deleted_at is null) then
    new.deleted_at := statement_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function public.secure_sync_record_write() from public, anon, authenticated;

create trigger secure_sync_record_write
before insert or update on public.sync_records
for each row execute function public.secure_sync_record_write();

alter table public.sync_records force row level security;

revoke all on public.sync_records from public, anon, authenticated;
grant select, insert, update, delete on public.sync_records to authenticated;

