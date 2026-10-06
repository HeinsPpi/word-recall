-- The Before User Created hook runs as supabase_auth_admin. It needs schema
-- visibility for pgcrypto's digest function, but no table access in extensions.
grant usage on schema extensions to supabase_auth_admin;

