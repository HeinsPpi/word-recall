begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

insert into private.wordrecall_account_enrollment (
  email_hash, enrollment_code_hash, consumed_at
)
values (
  encode(extensions.digest('owner@example.invalid', 'sha256'), 'hex'),
  encode(extensions.digest('test-enrollment-code', 'sha256'), 'hex'),
  null
)
on conflict (email_hash) do update
set enrollment_code_hash = excluded.enrollment_code_hash,
    consumed_at = null;

select is(
  private.wordrecall_before_user_created(
    '{"user":{"email":"owner@example.invalid","user_metadata":{"enrollment_code":"test-enrollment-code"}}}'::jsonb
  ),
  '{}'::jsonb,
  'Allowlisted email and enrollment code are accepted'
);

select is(
  private.wordrecall_before_user_created(
    '{"user":{"email":"other@example.invalid","user_metadata":{"enrollment_code":"test-enrollment-code"}}}'::jsonb
  ) #>> '{error,message}',
  'Account enrollment is not permitted.',
  'A different email is denied'
);

select is(
  private.wordrecall_before_user_created(
    '{"user":{"email":"owner@example.invalid","user_metadata":{"enrollment_code":"wrong"}}}'::jsonb
  ) #>> '{error,message}',
  'Account enrollment is not permitted.',
  'A wrong enrollment code is denied'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.wordrecall_before_user_created(jsonb)',
    'execute'
  ),
  'The enrollment hook is not callable by anon'
);

select * from finish();
rollback;
