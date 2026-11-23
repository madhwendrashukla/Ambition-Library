-- =====================================================================
-- 0003: Starter data for Ambition Library (edit freely from Settings)
-- =====================================================================
update public.library_settings
   set name = 'Ambition Library', tagline = 'Self Study Library · Lucknow', receipt_prefix = 'AL'
 where id = 1;

insert into public.shifts (name, start_time, end_time, is_full_day, sort)
select * from (values
  ('Morning',  time '06:00', time '14:00', false, 1),
  ('Evening',  time '14:00', time '22:00', false, 2),
  ('Full Day', time '06:00', time '22:00', true,  3)
) v(name, s, e, f, o)
where not exists (select 1 from public.shifts);

-- 60 seats: 6 rows (A–F) × 10; window seats on both sides, AC in rows A–C
insert into public.seats (label, row_no, col_no, tags)
select chr(64 + r) || c, r, c,
       array_remove(array[
         case when c in (1, 10) then 'window' end,
         case when r <= 3 then 'ac' end,
         case when c in (5, 6) then 'charging' end
       ], null)
from generate_series(1, 6) r, generate_series(1, 10) c
where not exists (select 1 from public.seats);

insert into public.plans (name, shift_id, duration_days, price, admission_fee)
select sh.name || ' · ' || d.label, sh.id, d.days,
       case when sh.is_full_day then d.full_price else d.half_price end, 200
from public.shifts sh
cross join (values ('Monthly', 30, 700, 1100), ('Quarterly', 90, 1950, 3100)) d(label, days, half_price, full_price)
where not exists (select 1 from public.plans);
