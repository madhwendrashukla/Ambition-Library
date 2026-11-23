-- =====================================================================
-- Ambition Library — Library Management System
-- 0001: tables, helpers, views, RPCs, RLS
-- Run in Supabase SQL editor (or `supabase db push`).
-- =====================================================================

-- ---------- helpers ----------------------------------------------------
create or replace function public.rand_token(n int default 24)
returns text language sql volatile as $$
  select substr(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''), 1, n)
$$;

-- ---------- library settings (single row) ------------------------------
create table if not exists public.library_settings (
  id                 int primary key default 1 check (id = 1),
  name               text not null default 'Ambition Library',
  tagline            text default 'Self Study Library',
  address            text,
  phone              text,
  email              text,
  logo_url           text,
  primary_color      text not null default '#2563EB',
  timezone           text not null default 'Asia/Kolkata',
  latitude           double precision,
  longitude          double precision,
  geofence_enabled   boolean not null default false,
  geofence_m         int not null default 150,
  gate_key           text not null default public.rand_token(24),
  checkin_grace_min  int not null default 30,
  cooldown_sec       int not null default 120,
  auto_checkout_min  int not null default 30,
  receipt_prefix     text not null default 'AL',
  upi_id             text,
  reminder_template  text not null default
    'Hello {name} 🙏
Your {library} plan ({shift}, Seat {seat}) {verb} on {end_date}.
To renew, please pay at the library counter or via UPI {upi}. Thank you!',
  updated_at         timestamptz not null default now()
);
insert into public.library_settings (id) values (1) on conflict do nothing;

create or replace function public.today_local()
returns date language sql stable as $$
  select (now() at time zone coalesce((select timezone from public.library_settings where id = 1), 'Asia/Kolkata'))::date
$$;

create or replace function public.now_local_time()
returns time language sql stable as $$
  select (now() at time zone coalesce((select timezone from public.library_settings where id = 1), 'Asia/Kolkata'))::time
$$;

-- ---------- profiles / roles -------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','staff','student')),
  full_name  text,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'))
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- ---------- shifts / seats / plans -------------------------------------
create table if not exists public.shifts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  start_time  time not null,
  end_time    time not null,
  is_full_day boolean not null default false,
  sort        int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.seats (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  row_no     int not null default 1,
  col_no     int not null default 1,
  tags       text[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  shift_id       uuid not null references public.shifts(id) on delete restrict,
  duration_days  int not null check (duration_days > 0),
  price          numeric(10,2) not null check (price >= 0),
  admission_fee  numeric(10,2) not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create or replace function public.shifts_overlap(a uuid, b uuid)
returns boolean language sql stable as $$
  select coalesce((
    select (sa.is_full_day or sb.is_full_day)
        or (sa.start_time < sb.end_time and sb.start_time < sa.end_time)
    from public.shifts sa, public.shifts sb
    where sa.id = a and sb.id = b
  ), false)
$$;

-- ---------- students ----------------------------------------------------
create sequence if not exists public.student_code_seq start 1;

create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  code            text unique not null default ('S' || lpad(nextval('public.student_code_seq')::text, 4, '0')),
  full_name       text not null,
  phone           text not null unique,
  email           text,
  gender          text,
  dob             date,
  address         text,
  guardian_name   text,
  guardian_phone  text,
  exam_target     text,
  photo_path      text,
  id_type         text,
  id_last4        text,
  id_doc_path     text,
  admission_date  date not null default public.today_local(),
  status          text not null default 'active' check (status in ('active','left')),
  device_id       text,
  qr_token        text not null unique default public.rand_token(24),
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists students_name_idx on public.students (lower(full_name));

create or replace function public.my_student_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.students where user_id = auth.uid()
$$;

-- ---------- memberships (plan periods) ---------------------------------
create table if not exists public.memberships (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  plan_id        uuid references public.plans(id) on delete set null,
  shift_id       uuid not null references public.shifts(id) on delete restrict,
  seat_id        uuid references public.seats(id) on delete set null,
  start_date     date not null,
  end_date       date not null,
  fee            numeric(10,2) not null default 0,
  admission_fee  numeric(10,2) not null default 0,
  discount       numeric(10,2) not null default 0,
  total          numeric(10,2) generated always as (fee + admission_fee - discount) stored,
  status         text not null default 'active' check (status in ('active','cancelled')),
  note           text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists memberships_student_idx on public.memberships (student_id, end_date desc);
create index if not exists memberships_seat_idx on public.memberships (seat_id, start_date, end_date);

-- block double-booking a seat for overlapping shift + dates
create or replace function public.check_seat_conflict()
returns trigger language plpgsql as $$
declare v_conflict text;
begin
  if new.seat_id is null or new.status <> 'active' then return new; end if;
  select s.full_name into v_conflict
  from public.memberships m join public.students s on s.id = m.student_id and s.status = 'active'
  where m.seat_id = new.seat_id
    and m.status = 'active'
    and m.id <> new.id
    and m.student_id <> new.student_id
    and daterange(m.start_date, m.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
    and public.shifts_overlap(m.shift_id, new.shift_id)
  limit 1;
  if v_conflict is not null then
    raise exception 'SEAT_TAKEN: This seat is already taken by % in this shift', v_conflict using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists memberships_seat_conflict on public.memberships;
create trigger memberships_seat_conflict before insert or update on public.memberships
for each row execute function public.check_seat_conflict();

-- ---------- payments ----------------------------------------------------
create sequence if not exists public.receipt_seq start 1;

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  membership_id  uuid references public.memberships(id) on delete set null,
  amount         numeric(10,2) not null check (amount > 0),
  mode           text not null default 'cash' check (mode in ('cash','upi','card','bank','other')),
  paid_at        timestamptz not null default now(),
  note           text,
  receipt_no     text unique,
  public_token   text not null unique default public.rand_token(20),
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists payments_student_idx on public.payments (student_id, paid_at desc);
create index if not exists payments_paid_idx on public.payments (paid_at desc);

create or replace function public.assign_receipt_no()
returns trigger language plpgsql as $$
begin
  if new.receipt_no is null then
    new.receipt_no := coalesce((select receipt_prefix from public.library_settings where id = 1), 'AL')
                      || '-' || lpad(nextval('public.receipt_seq')::text, 5, '0');
  end if;
  return new;
end $$;
drop trigger if exists payments_receipt_no on public.payments;
create trigger payments_receipt_no before insert on public.payments
for each row execute function public.assign_receipt_no();

-- ---------- attendance --------------------------------------------------
create table if not exists public.attendance (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  att_date       date not null default public.today_local(),
  check_in       timestamptz not null default now(),
  check_out      timestamptz,
  method         text not null default 'qr' check (method in ('qr','staff')),
  outside_shift  boolean not null default false,
  auto_closed    boolean not null default false,
  created_at     timestamptz not null default now(),
  check (check_out is null or check_out >= check_in)
);
create index if not exists attendance_student_idx on public.attendance (student_id, check_in desc);
create index if not exists attendance_date_idx on public.attendance (att_date);
create unique index if not exists attendance_one_open on public.attendance (student_id) where check_out is null;

-- ---------- alerts (owner notifications) -------------------------------
create table if not exists public.alerts (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('expired_entry','device_mismatch','outside_shift','too_far','info')),
  student_id  uuid references public.students(id) on delete cascade,
  message     text not null,
  seen        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- enquiries / notices / expenses / reminders -----------------
create table if not exists public.enquiries (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  phone               text not null,
  preferred_shift_id  uuid references public.shifts(id) on delete set null,
  source              text default 'walk-in',
  note                text,
  status              text not null default 'new' check (status in ('new','follow_up','converted','lost')),
  follow_up_on        date,
  created_at          timestamptz not null default now()
);

create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  pinned      boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null default 'other',
  amount      numeric(10,2) not null check (amount > 0),
  spent_on    date not null default public.today_local(),
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists public.reminder_logs (
  id             bigint generated always as identity primary key,
  student_id     uuid not null references public.students(id) on delete cascade,
  membership_id  uuid references public.memberships(id) on delete set null,
  channel        text not null default 'whatsapp',
  sent_by        uuid default auth.uid(),
  sent_at        timestamptz not null default now()
);

-- =====================================================================
-- VIEWS (security_invoker → RLS of caller applies)
-- =====================================================================
create or replace view public.v_student_status with (security_invoker = true) as
select
  s.id                as student_id,
  s.code, s.full_name, s.phone, s.photo_path, s.status, s.admission_date, s.device_id,
  m.id                as membership_id,
  m.start_date, m.end_date,
  m.shift_id, sh.name as shift_name, sh.start_time, sh.end_time, sh.is_full_day,
  m.seat_id, se.label as seat_label,
  m.plan_id, p.name   as plan_name,
  case when m.id is null then null else (m.end_date - public.today_local()) end as days_left,
  case
    when m.id is null then 'no_plan'
    when m.end_date < public.today_local() then 'expired'
    when m.start_date > public.today_local() then 'upcoming'
    when m.end_date - public.today_local() <= 7 then 'expiring'
    else 'active'
  end as plan_state,
  coalesce(b.billed, 0) - coalesce(b.paid, 0) as balance_due,
  (select max(r.sent_at) from public.reminder_logs r where r.student_id = s.id) as last_reminded_at
from public.students s
left join lateral (
  select * from public.memberships mm
  where mm.student_id = s.id and mm.status = 'active'
  order by (public.today_local() between mm.start_date and mm.end_date) desc,
           (mm.start_date > public.today_local()) desc,
           case when mm.start_date > public.today_local() then mm.start_date end asc,
           mm.end_date desc
  limit 1
) m on true
left join public.shifts sh on sh.id = m.shift_id
left join public.seats  se on se.id = m.seat_id
left join public.plans  p  on p.id  = m.plan_id
left join lateral (
  select
    (select sum(total) from public.memberships x where x.student_id = s.id and x.status = 'active') as billed,
    (select sum(amount) from public.payments y where y.student_id = s.id) as paid
) b on true;

-- Public-safe library info (no gate_key) for students / login page
create or replace view public.library_public as
select id, name, tagline, address, phone, email, logo_url, primary_color, upi_id,
       latitude, longitude, geofence_enabled, geofence_m
from public.library_settings;

-- =====================================================================
-- RPCs
-- =====================================================================

-- Seat board for a shift + date (shift-aware occupancy)
drop function if exists public.seat_board(uuid, date);
create or replace function public.seat_board(p_shift uuid default null, p_date date default null, p_until date default null)
returns table (
  seat_id uuid, label text, row_no int, col_no int, tags text[], active boolean,
  occupied boolean, student_id uuid, student_name text, occupant_shift text, end_date date
)
language sql stable security invoker as $$
  select se.id, se.label, se.row_no, se.col_no, se.tags, se.active,
         (o.student_id is not null) as occupied,
         o.student_id, o.full_name, o.shift_name, o.end_date
  from public.seats se
  left join lateral (
    select m.student_id, st.full_name, sh.name as shift_name, m.end_date
    from public.memberships m
    join public.students st on st.id = m.student_id and st.status = 'active'
    join public.shifts sh on sh.id = m.shift_id
    where m.seat_id = se.id and m.status = 'active'
      -- occupied if the booking overlaps any day of [p_date, p_until] (picking a seat for a whole plan period)
      and daterange(m.start_date, m.end_date, '[]')
          && daterange(coalesce(p_date, public.today_local()), greatest(coalesce(p_until, p_date, public.today_local()), coalesce(p_date, public.today_local())), '[]')
      and (p_shift is null or public.shifts_overlap(m.shift_id, p_shift))
    order by m.end_date desc
    limit 1
  ) o on true
  order by se.row_no, se.col_no, se.label
$$;

-- haversine distance in meters
create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- core toggle used by both student scan and staff scan
create or replace function public._toggle_attendance(p_student uuid, p_method text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st      public.students;
  cfg     public.library_settings;
  open_a  public.attendance;
  last_a  public.attendance;
  mem     record;
  v_now   timestamptz := now();
  v_time  time := public.now_local_time();
  v_out   boolean := false;
  v_mins  int;
  v_id    uuid;
begin
  select * into st  from public.students where id = p_student;
  select * into cfg from public.library_settings where id = 1;
  if st.id is null then return jsonb_build_object('ok', false, 'code', 'not_student'); end if;
  if st.status <> 'active' then return jsonb_build_object('ok', false, 'code', 'inactive', 'name', st.full_name); end if;

  select * into open_a from public.attendance where student_id = st.id and check_out is null order by check_in desc limit 1;

  -- stale open session from an earlier day → close it with the same rules as auto-checkout
  if open_a.id is not null and open_a.att_date < public.today_local() then
    perform public.auto_checkout();
    open_a := null;
  end if;

  -- cooldown against double scans
  select * into last_a from public.attendance where student_id = st.id order by greatest(check_in, coalesce(check_out, check_in)) desc limit 1;
  if last_a.id is not null and not p_force
     and extract(epoch from (v_now - greatest(last_a.check_in, coalesce(last_a.check_out, last_a.check_in)))) < cfg.cooldown_sec then
    return jsonb_build_object('ok', false, 'code', 'cooldown', 'name', st.full_name,
      'wait_sec', cfg.cooldown_sec - floor(extract(epoch from (v_now - greatest(last_a.check_in, coalesce(last_a.check_out, last_a.check_in)))))::int);
  end if;

  -- CHECK OUT
  if open_a.id is not null then
    update public.attendance set check_out = v_now where id = open_a.id;
    v_mins := floor(extract(epoch from (v_now - open_a.check_in)) / 60)::int;
    return jsonb_build_object('ok', true, 'action', 'out', 'name', st.full_name, 'minutes', v_mins,
                              'check_in', open_a.check_in, 'check_out', v_now);
  end if;

  -- CHECK IN: needs an active plan today
  select m.id, m.end_date, sh.name as shift_name, sh.start_time, sh.end_time, sh.is_full_day, se.label as seat_label
    into mem
  from public.memberships m
  join public.shifts sh on sh.id = m.shift_id
  left join public.seats se on se.id = m.seat_id
  where m.student_id = st.id and m.status = 'active'
    and public.today_local() between m.start_date and m.end_date
  order by m.end_date desc limit 1;

  if mem.id is null and not p_force and exists (
       select 1 from public.memberships where student_id = st.id and status = 'active' and start_date > public.today_local()) then
    return jsonb_build_object('ok', false, 'code', 'not_started', 'name', st.full_name,
      'start_date', (select min(start_date) from public.memberships where student_id = st.id and status = 'active' and start_date > public.today_local()));
  end if;

  if mem.id is null and not p_force then
    insert into public.alerts (kind, student_id, message)
    values ('expired_entry', st.id, st.full_name || ' tried to enter — plan expired / fees due');
    return jsonb_build_object('ok', false, 'code', 'expired', 'name', st.full_name,
      'end_date', (select max(end_date) from public.memberships where student_id = st.id and status = 'active'));
  end if;

  if mem.id is not null and not mem.is_full_day then
    -- minutes since midnight (avoids time wrap-around)
    v_out := not (
      (extract(hour from v_time) * 60 + extract(minute from v_time))
        >= (extract(hour from mem.start_time) * 60 + extract(minute from mem.start_time) - cfg.checkin_grace_min)
      and (extract(hour from v_time) * 60 + extract(minute from v_time))
        <= (extract(hour from mem.end_time) * 60 + extract(minute from mem.end_time)));
  end if;

  insert into public.attendance (student_id, method, outside_shift)
  values (st.id, p_method, v_out) returning id into v_id;

  if v_out then
    insert into public.alerts (kind, student_id, message)
    values ('outside_shift', st.id, st.full_name || ' came outside their shift (' || mem.shift_name || ')');
  end if;

  return jsonb_build_object('ok', true, 'action', 'in', 'name', st.full_name,
    'seat', mem.seat_label, 'shift', mem.shift_name, 'outside_shift', v_out,
    'end_date', mem.end_date, 'days_left', mem.end_date - public.today_local(), 'check_in', v_now);
end $$;

-- Student scans the gate QR from the app
create or replace function public.scan_gate(p_gate_key text, p_device text, p_lat float8 default null, p_lng float8 default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st   public.students;
  cfg  public.library_settings;
  d    float8;
begin
  select * into st from public.students where user_id = auth.uid();
  if st.id is null then return jsonb_build_object('ok', false, 'code', 'not_student'); end if;
  select * into cfg from public.library_settings where id = 1;

  if p_gate_key is distinct from cfg.gate_key then
    return jsonb_build_object('ok', false, 'code', 'invalid_qr');
  end if;

  if p_device is null or length(p_device) < 8 then
    return jsonb_build_object('ok', false, 'code', 'device_required');
  end if;
  if st.device_id is null then
    update public.students set device_id = p_device where id = st.id;
  elsif st.device_id <> p_device then
    insert into public.alerts (kind, student_id, message)
    values ('device_mismatch', st.id, st.full_name || ' scanned from a new phone — device reset needed?');
    return jsonb_build_object('ok', false, 'code', 'device_mismatch', 'name', st.full_name);
  end if;

  if cfg.geofence_enabled and cfg.latitude is not null and cfg.longitude is not null then
    if p_lat is null or p_lng is null then
      return jsonb_build_object('ok', false, 'code', 'location_required');
    end if;
    d := public.distance_m(p_lat, p_lng, cfg.latitude, cfg.longitude);
    if d > cfg.geofence_m then
      return jsonb_build_object('ok', false, 'code', 'too_far', 'distance_m', round(d));
    end if;
  end if;

  return public._toggle_attendance(st.id, 'qr', false);
end $$;

-- Staff scans a student's personal QR (fallback) or taps manually
create or replace function public.staff_mark(p_token text default null, p_student uuid default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_staff() then raise exception 'NOT_ALLOWED'; end if;
  if p_student is not null then v_id := p_student;
  else select id into v_id from public.students where qr_token = p_token; end if;
  if v_id is null then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  return public._toggle_attendance(v_id, 'staff', p_force);
end $$;

create or replace function public.reset_device(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'NOT_ALLOWED'; end if;
  update public.students set device_id = null where id = p_student;
end $$;

create or replace function public.regenerate_gate_key()
returns text language plpgsql security definer set search_path = public as $$
declare k text := public.rand_token(24);
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update public.library_settings set gate_key = k, updated_at = now() where id = 1;
  return k;
end $$;

-- Close sessions whose shift ended (+grace) or that are from a previous day.
-- Schedule with pg_cron (see 0002) or call from the dashboard.
create or replace function public.auto_checkout()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; r record; cfg public.library_settings; tz text; v_end timestamptz; v_close time;
begin
  select * into cfg from public.library_settings where id = 1;
  select coalesce(max(end_time), time '22:00') into v_close from public.shifts where active;
  tz := coalesce(cfg.timezone, 'Asia/Kolkata');
  for r in
    select a.id, a.check_in, a.att_date,
           (select sh.end_time from public.memberships m join public.shifts sh on sh.id = m.shift_id
             where m.student_id = a.student_id and m.status = 'active'
               and a.att_date between m.start_date and m.end_date
             order by m.end_date desc limit 1) as shift_end
    from public.attendance a where a.check_out is null
  loop
    v_end := ((r.att_date + coalesce(r.shift_end, time '22:00')) at time zone tz);
    if r.check_in >= v_end then
      -- came outside their shift: keep open till library closing time, at least 4 hours
      v_end := greatest(((r.att_date + v_close) at time zone tz), r.check_in + interval '4 hours');
    end if;
    if now() > v_end + make_interval(mins => cfg.auto_checkout_min) or r.att_date < public.today_local() then
      update public.attendance
         set check_out = greatest(r.check_in, least(v_end, now())), auto_closed = true
       where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Owner dashboard numbers in one call
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  t date := public.today_local();
  tz text := coalesce((select timezone from public.library_settings where id = 1), 'Asia/Kolkata');
  res jsonb;
begin
  select jsonb_build_object(
    'present_now',      (select count(*) from public.attendance where check_out is null and att_date = t),
    'today_checkins',   (select count(distinct student_id) from public.attendance where att_date = t),
    'today_collection', (select coalesce(sum(amount),0) from public.payments where (paid_at at time zone tz)::date = t),
    'month_collection', (select coalesce(sum(amount),0) from public.payments where date_trunc('month', paid_at at time zone tz) = date_trunc('month', t::timestamp)),
    'month_expenses',   (select coalesce(sum(amount),0) from public.expenses where date_trunc('month', spent_on::timestamp) = date_trunc('month', t::timestamp)),
    'active_members',   (select count(*) from public.v_student_status where status = 'active' and plan_state in ('active','expiring')),
    'expiring_7',       (select count(*) from public.v_student_status where status = 'active' and plan_state = 'expiring'),
    'expired',          (select count(*) from public.v_student_status where status = 'active' and plan_state = 'expired'),
    'balance_due',      (select coalesce(sum(greatest(balance_due,0)),0) from public.v_student_status where status = 'active'),
    'total_seats',      (select count(*) from public.seats where active),
    'unseen_alerts',    (select count(*) from public.alerts where not seen),
    'shifts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sh.id, 'name', sh.name, 'is_full_day', sh.is_full_day,
        'occupied', (select count(*) from public.seat_board(sh.id, t) b where b.occupied and b.active),
        'present',  (select count(*) from public.attendance a
                      join public.memberships m on m.student_id = a.student_id and m.status = 'active'
                       and t between m.start_date and m.end_date and m.shift_id = sh.id
                      where a.att_date = t and a.check_out is null)
      ) order by sh.sort), '[]'::jsonb)
      from public.shifts sh where sh.active
    )
  ) into res;
  return res;
end $$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.library_settings enable row level security;
alter table public.profiles        enable row level security;
alter table public.shifts          enable row level security;
alter table public.seats           enable row level security;
alter table public.plans           enable row level security;
alter table public.students        enable row level security;
alter table public.memberships     enable row level security;
alter table public.payments        enable row level security;
alter table public.attendance      enable row level security;
alter table public.alerts          enable row level security;
alter table public.enquiries       enable row level security;
alter table public.notices         enable row level security;
alter table public.expenses        enable row level security;
alter table public.reminder_logs   enable row level security;

-- staff: full access everywhere
do $$
declare t text;
begin
  foreach t in array array['library_settings','shifts','seats','plans','students','memberships','payments',
                           'attendance','alerts','enquiries','notices','expenses','reminder_logs']
  loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- only admins can change library settings / pricing
drop policy if exists staff_all on public.library_settings;
drop policy if exists staff_read on public.library_settings;
drop policy if exists admin_write on public.library_settings;
create policy staff_read on public.library_settings for select to authenticated using (public.is_staff());
create policy admin_write on public.library_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- pricing (plans) and shift timings: staff can read, only admin can change
do $$
declare t text;
begin
  foreach t in array array['plans','shifts'] loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('drop policy if exists staff_read on public.%I', t);
    execute format('drop policy if exists admin_write on public.%I', t);
    execute format('create policy staff_read on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- profiles
drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
drop policy if exists admin_profiles on public.profiles;
create policy admin_profiles on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- students: read their own data only
drop policy if exists student_read_shifts on public.shifts;
create policy student_read_shifts on public.shifts for select to authenticated using (true);
drop policy if exists student_read_seats on public.seats;
create policy student_read_seats on public.seats for select to authenticated using (true);
drop policy if exists student_read_plans on public.plans;
create policy student_read_plans on public.plans for select to authenticated using (active);
drop policy if exists student_read_notices on public.notices;
create policy student_read_notices on public.notices for select to authenticated using (true);

drop policy if exists student_self on public.students;
create policy student_self on public.students for select to authenticated using (user_id = auth.uid());
drop policy if exists student_own_memberships on public.memberships;
create policy student_own_memberships on public.memberships for select to authenticated using (student_id = public.my_student_id());
drop policy if exists student_own_payments on public.payments;
create policy student_own_payments on public.payments for select to authenticated using (student_id = public.my_student_id());
drop policy if exists student_own_attendance on public.attendance;
create policy student_own_attendance on public.attendance for select to authenticated using (student_id = public.my_student_id());

grant select on public.library_public to anon, authenticated;

-- internal helpers must not be callable from the API (they skip the scan checks)
revoke execute on function public._toggle_attendance(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.check_seat_conflict() from public, anon, authenticated;
revoke execute on function public.assign_receipt_no() from public, anon, authenticated;
-- staff / admin RPCs: logged-in users only (they check the role inside)
revoke execute on function public.staff_mark(text, uuid, boolean) from public, anon;
revoke execute on function public.reset_device(uuid) from public, anon;
revoke execute on function public.regenerate_gate_key() from public, anon;
revoke execute on function public.auto_checkout() from public, anon;
revoke execute on function public.dashboard_stats() from public, anon;
grant execute on function public.staff_mark(text, uuid, boolean), public.reset_device(uuid), public.regenerate_gate_key(),
  public.auto_checkout(), public.dashboard_stats() to authenticated;
grant select on public.v_student_status to authenticated;

-- Realtime: owner dashboard listens to these tables
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.attendance; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.alerts;     exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.payments;   exception when duplicate_object then null; end;
  end if;
end $$;
