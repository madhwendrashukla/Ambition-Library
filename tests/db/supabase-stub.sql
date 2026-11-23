-- Minimal stand-in for the parts of Supabase our migrations depend on.
-- ONLY for running tests against a plain Postgres. Never run this on a real Supabase project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- storage
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated;

-- pg_cron
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
create or replace function cron.unschedule(id bigint) returns boolean language sql as $$ delete from cron.job where jobid = id returning true $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;

-- Supabase's default grants
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
