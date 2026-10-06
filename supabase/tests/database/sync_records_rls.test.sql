begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@example.invalid'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.sync_records (user_id, table_name, record_id, payload)
    values ('10000000-0000-4000-8000-000000000001', 'appSettings', 'settings',
      '{"id":"settings","totalEncounteredWords":null,"desiredRetention":0.9,"masteryStabilityDays":30}'::jsonb)$$,
  'User A can insert an owned row'
);
select is((select count(*)::integer from public.sync_records), 1, 'User A can select its row');
select throws_ok(
  $$insert into public.sync_records (user_id, table_name, record_id, payload)
    values ('20000000-0000-4000-8000-000000000002', 'appSettings', 'settings',
      '{"id":"settings","totalEncounteredWords":null,"desiredRetention":0.9,"masteryStabilityDays":30}'::jsonb)$$,
  '42501', 'new row violates row-level security policy for table "sync_records"',
  'User A cannot insert as User B'
);
select throws_ok(
  $$update public.sync_records set user_id = '20000000-0000-4000-8000-000000000002'
    where record_id = 'settings'$$,
  '42501', 'new row violates row-level security policy for table "sync_records"',
  'User A cannot transfer ownership'
);

reset role;
insert into public.sync_records (user_id, table_name, record_id, payload)
values ('20000000-0000-4000-8000-000000000002', 'appSettings', 'settings',
  '{"id":"settings","totalEncounteredWords":null,"desiredRetention":0.9,"masteryStabilityDays":30}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.sync_records where user_id = '20000000-0000-4000-8000-000000000002'), 0, 'User A cannot select User B row');
update public.sync_records set payload = payload where user_id = '20000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.sync_records where user_id = '20000000-0000-4000-8000-000000000002'), 0, 'User A cannot update User B row');
delete from public.sync_records where user_id = '20000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.sync_records where user_id = '20000000-0000-4000-8000-000000000002'), 0, 'User A cannot delete User B row');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.sync_records where user_id = '10000000-0000-4000-8000-000000000001'), 0, 'User B cannot select User A row');
update public.sync_records set payload = payload where user_id = '10000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.sync_records where user_id = '10000000-0000-4000-8000-000000000001'), 0, 'User B cannot update User A row');
delete from public.sync_records where user_id = '10000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.sync_records where user_id = '10000000-0000-4000-8000-000000000001'), 0, 'User B cannot delete User A row');
select lives_ok(
  $$update public.sync_records set payload = jsonb_set(payload, '{desiredRetention}', '0.91') where record_id = 'settings'$$,
  'User B can update an owned row'
);
select lives_ok(
  $$delete from public.sync_records where record_id = 'settings'$$,
  'User B can delete an owned row'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.sync_records$$,
  '42501', 'permission denied for table sync_records', 'Anonymous SELECT is denied'
);
select throws_ok(
  $$insert into public.sync_records (user_id, table_name, record_id, payload)
    values ('10000000-0000-4000-8000-000000000001', 'appSettings', 'other', '{"id":"other"}'::jsonb)$$,
  '42501', 'permission denied for table sync_records', 'Anonymous INSERT is denied'
);
select throws_ok(
  $$update public.sync_records set payload = payload$$,
  '42501', 'permission denied for table sync_records', 'Anonymous UPDATE is denied'
);
select throws_ok(
  $$delete from public.sync_records$$,
  '42501', 'permission denied for table sync_records', 'Anonymous DELETE is denied'
);

reset role;
select is((select count(*)::integer from public.sync_records where user_id = '10000000-0000-4000-8000-000000000001'), 1, 'Cross-user attempts did not alter User A row');
select is((select count(*)::integer from public.sync_records where user_id = '20000000-0000-4000-8000-000000000002'), 0, 'User B deleted only its own row');
select * from finish();
rollback;
