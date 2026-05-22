alter table public.rental_orders
  add column if not exists requested_note text;

