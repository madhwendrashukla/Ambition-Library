-- Fixed data for E2E tests (runs after the real migrations on a throw-away database)
create table if not exists auth.passwords (email text primary key, pw text not null);

update library_settings set name = 'Ambition Library', tagline = 'The right place to study', phone = '9876543210',
  upi_id = 'ambitionlib@upi', gate_key = 'e2egatekey00000000000000',
  geofence_enabled = true, latitude = 26.889, longitude = 80.942, geofence_m = 150;

-- owner + desk staff
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@ambition.in'),
  ('00000000-0000-0000-0000-0000000000a2', 'desk@ambition.in');
insert into auth.passwords values ('owner@ambition.in', 'Owner@123'), ('desk@ambition.in', 'Desk@1234');
insert into profiles values
  ('00000000-0000-0000-0000-0000000000a1', 'admin', 'Rakesh Sharma', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'staff', 'Desk Staff', now());

-- students (PIN 1234 → password al#1234#pin)
create or replace function pg_temp.stu(n int, nm text, ph text, st text default 'active') returns uuid language plpgsql as $$
declare uid uuid := ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid; sid uuid;
begin
  insert into auth.users (id, email) values (uid, ph || '@students.ambition.app');
  insert into auth.passwords values (ph || '@students.ambition.app', 'al#1234#pin');
  insert into profiles values (uid, 'student', nm, now());
  insert into students (user_id, full_name, phone, status, exam_target) values (uid, nm, ph, st, 'UPSC CSE') returning id into sid;
  return sid;
end $$;

do $$
declare riya uuid; aman uuid; neha uuid; karan uuid; mohit uuid; pooja uuid;
  mo uuid := (select id from shifts where name = 'Morning');
  ev uuid := (select id from shifts where name = 'Evening');
  fd uuid := (select id from shifts where name = 'Full Day');
  m uuid;
begin
  riya  := pg_temp.stu(1, 'Riya Active',    '9000000001');
  aman  := pg_temp.stu(2, 'Aman Expiring',  '9000000002');
  neha  := pg_temp.stu(3, 'Neha Expired',   '9000000003');
  karan := pg_temp.stu(4, 'Karan Upcoming', '9000000004');
  mohit := pg_temp.stu(5, 'Mohit Left',     '9000000005', 'left');
  pooja := pg_temp.stu(6, 'Pooja Desk',     '9000000006');

  insert into memberships (student_id, plan_id, shift_id, seat_id, start_date, end_date, fee, admission_fee)
    values (riya, (select id from plans where name = 'Morning · Monthly'), mo, (select id from seats where label = 'A1'), today_local() - 9, today_local() + 20, 700, 200) returning id into m;
  insert into payments (student_id, membership_id, amount, mode, paid_at) values (riya, m, 900, 'upi', now() - interval '9 days');
  insert into attendance (student_id, att_date, check_in, check_out) values
    (riya, today_local() - 1, now() - interval '1 day 6 hours', now() - interval '1 day 1 hour'),
    (riya, today_local() - 2, now() - interval '2 days 5 hours', now() - interval '2 days 1 hour');

  insert into memberships (student_id, plan_id, shift_id, seat_id, start_date, end_date, fee)
    values (aman, (select id from plans where name = 'Evening · Monthly'), ev, (select id from seats where label = 'A1'), today_local() - 26, today_local() + 3, 700) returning id into m;
  insert into payments (student_id, membership_id, amount, mode) values (aman, m, 400, 'cash');

  insert into memberships (student_id, plan_id, shift_id, seat_id, start_date, end_date, fee)
    values (neha, (select id from plans where name = 'Full Day · Monthly'), fd, (select id from seats where label = 'B1'), today_local() - 35, today_local() - 5, 1100) returning id into m;
  insert into payments (student_id, membership_id, amount, mode, paid_at) values (neha, m, 1100, 'cash', now() - interval '35 days');

  insert into memberships (student_id, plan_id, shift_id, seat_id, start_date, end_date, fee)
    values (karan, (select id from plans where name = 'Morning · Monthly'), mo, (select id from seats where label = 'C1'), today_local() + 2, today_local() + 31, 700);

  insert into memberships (student_id, plan_id, shift_id, seat_id, start_date, end_date, fee)
    values (mohit, (select id from plans where name = 'Morning · Monthly'), mo, (select id from seats where label = 'D1'), today_local() - 5, today_local() + 24, 700);

  insert into memberships (student_id, plan_id, shift_id, seat_id, start_date, end_date, fee)
    values (pooja, (select id from plans where name = 'Full Day · Monthly'), fd, (select id from seats where label = 'E1'), today_local() - 3, today_local() + 26, 1100) returning id into m;
  insert into payments (student_id, membership_id, amount, mode) values (pooja, m, 1100, 'cash');
end $$;

insert into notices (title, body, pinned) values ('Library Diwali par khuli rahegi', 'Timing normal.', true);
