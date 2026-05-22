alter table public.rental_rims enable row level security;
alter table public.rental_orders enable row level security;
alter table public.rental_histories enable row level security;
alter table public.staff_members enable row level security;

drop policy if exists "rental_rims anon all" on public.rental_rims;
drop policy if exists "rental_orders anon all" on public.rental_orders;
drop policy if exists "rental_histories anon all" on public.rental_histories;
drop policy if exists "staff_members anon all" on public.staff_members;

create policy "rental_rims anon all"
on public.rental_rims
for all
to anon
using (true)
with check (true);

create policy "rental_orders anon all"
on public.rental_orders
for all
to anon
using (true)
with check (true);

create policy "rental_histories anon all"
on public.rental_histories
for all
to anon
using (true)
with check (true);

create policy "staff_members anon all"
on public.staff_members
for all
to anon
using (true)
with check (true);

