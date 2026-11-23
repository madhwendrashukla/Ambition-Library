-- =====================================================================
-- 0004: API role privileges
-- Newer Supabase projects no longer grant table/function access to the
-- API roles automatically. Row Level Security (0001) still decides which
-- rows each user can see or change; these grants only let the roles reach
-- the tables at all. Safe to run more than once.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- tables + views: logged-in users (limited by RLS) and the server key
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
-- sequences used by column defaults / triggers (student code, receipt no.)
grant usage, select on all sequences in schema public to authenticated, service_role;
-- functions: RLS helpers (is_staff, my_student_id…) and the app's RPCs
grant execute on all functions in schema public to authenticated, service_role;

-- public login/receipt branding only
grant select on public.library_public to anon;

-- keep internal helpers off the API (same as 0001: they skip the scan checks)
revoke execute on function public._toggle_attendance(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.check_seat_conflict() from public, anon, authenticated;
revoke execute on function public.assign_receipt_no() from public, anon, authenticated;

-- same access for anything added by later migrations
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;
