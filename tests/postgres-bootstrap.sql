-- Test harness only: reproduce Auth identity boundary on plain PostgreSQL.
-- Do NOT apply this fixture to Supabase (which already supplies these objects).
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to authenticated;
grant execute on function auth.uid() to authenticated;
