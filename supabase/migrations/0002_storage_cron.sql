-- =====================================================================
-- 0002: Storage buckets + policies, and auto-checkout schedule
-- =====================================================================

-- Private bucket for student photo + ID document (path: <student_id>/<file>)
insert into storage.buckets (id, name, public)
values ('student-files', 'student-files', false)
on conflict (id) do nothing;

-- Public bucket for library logo
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "staff manage student files" on storage.objects;
create policy "staff manage student files" on storage.objects
  for all to authenticated
  using (bucket_id = 'student-files' and public.is_staff())
  with check (bucket_id = 'student-files' and public.is_staff());

drop policy if exists "student reads own files" on storage.objects;
create policy "student reads own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'student-files' and (storage.foldername(name))[1] = public.my_student_id()::text);

drop policy if exists "admin manages branding" on storage.objects;
create policy "admin manages branding" on storage.objects
  for all to authenticated
  using (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());

-- Auto check-out every 15 minutes.
-- If this fails, enable "pg_cron" in Dashboard → Database → Extensions and run again.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'ambition-auto-checkout';
select cron.schedule('ambition-auto-checkout', '*/15 * * * *', $$select public.auto_checkout()$$);
