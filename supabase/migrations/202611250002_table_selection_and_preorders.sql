create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number text not null unique check (length(trim(table_number)) between 1 and 20),
  capacity integer not null check (capacity between 1 and 12),
  area text not null default 'Dining room',
  layout_x numeric not null check (layout_x between 0 and 100),
  layout_y numeric not null check (layout_y between 0 and 100),
  shape text not null default 'square' check (shape in ('round', 'square')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  description text not null default '',
  category text not null default 'Menu',
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.reservations
  add column if not exists table_id uuid references public.restaurant_tables (id) on delete restrict;

create index if not exists reservations_table_id_idx
  on public.reservations (table_id);

create table if not exists public.reservation_order_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity between 1 and 20),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create index if not exists reservation_order_items_reservation_id_idx
  on public.reservation_order_items (reservation_id);

insert into public.restaurant_tables (
  table_number, capacity, area, layout_x, layout_y, shape
)
values
  ('T01', 2, 'Window', 18, 24, 'round'),
  ('T02', 2, 'Window', 47, 24, 'round'),
  ('T03', 4, 'Dining room', 78, 27, 'square'),
  ('T04', 4, 'Dining room', 23, 72, 'square'),
  ('T05', 6, 'Dining room', 53, 73, 'square'),
  ('T06', 2, 'Patio', 84, 72, 'round')
on conflict (table_number) do nothing;

insert into public.menu_items (name, description, category, price_cents, currency)
values
  ('Charred sourdough', 'Whipped herb butter, flaky sea salt', 'To start', 800, 'USD'),
  ('Crispy calamari', 'Lemon, parsley, house-made aioli', 'To start', 1400, 'USD'),
  ('Roasted tomato soup', 'Basil oil, toasted sourdough', 'To start', 900, 'USD'),
  ('Market fish', 'Seasonal vegetables, lemon beurre blanc', 'Mains', 2600, 'USD'),
  ('Herb roast chicken', 'Crispy potatoes, pan jus', 'Mains', 2400, 'USD'),
  ('Olive oil cake', 'Citrus cream, seasonal berries', 'Dessert', 1000, 'USD')
on conflict (name) do nothing;

create or replace function public.get_available_tables(
  p_reservation_at timestamptz,
  p_party_size integer
)
returns table (
  id uuid,
  table_number text,
  capacity integer,
  area text,
  layout_x numeric,
  layout_y numeric,
  shape text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_party_size is null or p_party_size not between 1 and 12 then
    raise exception 'Party size must be between 1 and 12.' using errcode = '22023';
  end if;

  if p_reservation_at is null
     or p_reservation_at <= now()
     or p_reservation_at > now() + interval '1 year' then
    raise exception 'Choose a future reservation date within the next year.' using errcode = '22023';
  end if;

  return query
    select t.id, t.table_number, t.capacity, t.area, t.layout_x, t.layout_y, t.shape
    from public.restaurant_tables as t
    where t.is_active
      and t.capacity >= p_party_size
      and not exists (
        select 1
        from public.reservations as r
        where r.table_id = t.id
          and r.status in ('pending'::public.reservation_status, 'confirmed'::public.reservation_status)
          and r.reservation_at < p_reservation_at + interval '2 hours'
          and r.reservation_at + interval '2 hours' > p_reservation_at
      )
    order by t.capacity, t.table_number;
end;
$$;

create or replace function public.create_reservation_with_preorder(
  p_full_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_reservation_at timestamptz,
  p_note text,
  p_table_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_id uuid;
  reservation_id uuid;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  selected_table public.restaurant_tables%rowtype;
  selected_menu_item public.menu_items%rowtype;
  order_item jsonb;
  order_quantity integer;
begin
  if length(trim(coalesce(p_full_name, ''))) not between 2 and 100 then
    raise exception 'Enter a name between 2 and 100 characters.' using errcode = '22023';
  end if;

  if length(normalized_email) > 254
     or normalized_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_phone, ''))) not between 7 and 30 then
    raise exception 'Enter a phone number between 7 and 30 characters.' using errcode = '22023';
  end if;

  if p_party_size is null or p_party_size not between 1 and 12 then
    raise exception 'Party size must be between 1 and 12.' using errcode = '22023';
  end if;

  if p_reservation_at is null
     or p_reservation_at <= now()
     or p_reservation_at > now() + interval '1 year' then
    raise exception 'Choose a future reservation date within the next year.' using errcode = '22023';
  end if;

  if length(coalesce(p_note, '')) > 500 then
    raise exception 'Notes must be 500 characters or fewer.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Pre-order must be an array of menu items.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 20 then
    raise exception 'Pre-order must contain no more than 20 menu items.' using errcode = '22023';
  end if;

  select * into selected_table
  from public.restaurant_tables
  where id = p_table_id
    and is_active
    and capacity >= p_party_size
  for update;

  if not found then
    raise exception 'That table is not available for your party size.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.reservations as r
    where r.table_id = selected_table.id
      and r.status in ('pending'::public.reservation_status, 'confirmed'::public.reservation_status)
      and r.reservation_at < p_reservation_at + interval '2 hours'
      and r.reservation_at + interval '2 hours' > p_reservation_at
  ) then
    raise exception 'That table was just reserved. Please choose another table or time.' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as submitted(value)
    group by submitted.value ->> 'menu_item_id'
    having count(*) > 1
  ) then
    raise exception 'Each pre-order item can only be listed once.' using errcode = '22023';
  end if;

  insert into public.customers (full_name, email, phone)
  values (trim(p_full_name), normalized_email, trim(p_phone))
  on conflict (email) do nothing;

  select id into customer_id
  from public.customers
  where email = normalized_email;

  insert into public.reservations (
    customer_id, reservation_at, party_size, note, table_id
  )
  values (
    customer_id, p_reservation_at, p_party_size, trim(coalesce(p_note, '')), selected_table.id
  )
  returning id into reservation_id;

  for order_item in
    select submitted.value
    from jsonb_array_elements(p_items) as submitted(value)
  loop
    if jsonb_typeof(order_item) <> 'object' then
      raise exception 'Each pre-order item must be an object.' using errcode = '22023';
    end if;

    if coalesce(order_item ->> 'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Pre-order quantities must be whole numbers.' using errcode = '22023';
    end if;

    order_quantity := (order_item ->> 'quantity')::integer;
    if order_quantity not between 1 and 20 then
      raise exception 'Each pre-order quantity must be between 1 and 20.' using errcode = '22023';
    end if;

    select * into selected_menu_item
    from public.menu_items
    where id = (order_item ->> 'menu_item_id')::uuid
      and is_available
    for share;

    if not found then
      raise exception 'A selected menu item is no longer available.' using errcode = '22023';
    end if;

    insert into public.reservation_order_items (
      reservation_id, menu_item_id, item_name, quantity, unit_price_cents, currency
    )
    values (
      reservation_id,
      selected_menu_item.id,
      selected_menu_item.name,
      order_quantity,
      selected_menu_item.price_cents,
      selected_menu_item.currency
    );
  end loop;

  return reservation_id;
end;
$$;

alter table public.restaurant_tables enable row level security;
alter table public.menu_items enable row level security;
alter table public.reservation_order_items enable row level security;

drop policy if exists "Public can view active restaurant tables" on public.restaurant_tables;
drop policy if exists "Staff can view restaurant tables" on public.restaurant_tables;
create policy "Public can view active restaurant tables"
  on public.restaurant_tables for select to anon
  using (is_active);
create policy "Staff can view restaurant tables"
  on public.restaurant_tables for select to authenticated
  using (public.current_staff_role() is not null);

drop policy if exists "Public can view available menu items" on public.menu_items;
drop policy if exists "Staff can view all menu items" on public.menu_items;
create policy "Public can view available menu items"
  on public.menu_items for select to anon
  using (is_available);
create policy "Staff can view all menu items"
  on public.menu_items for select to authenticated
  using (public.current_staff_role() is not null);

drop policy if exists "Staff can view reservation pre-orders" on public.reservation_order_items;
create policy "Staff can view reservation pre-orders"
  on public.reservation_order_items for select to authenticated
  using (public.current_staff_role() is not null);

revoke all on public.restaurant_tables from anon, authenticated;
revoke all on public.menu_items from anon, authenticated;
revoke all on public.reservation_order_items from anon, authenticated;
grant select on public.restaurant_tables to anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant select on public.reservation_order_items to authenticated;

revoke execute on function public.create_reservation(text, text, text, integer, timestamptz, text)
  from anon, authenticated;
revoke all on function public.get_available_tables(timestamptz, integer) from public;
grant execute on function public.get_available_tables(timestamptz, integer) to anon, authenticated;
revoke all on function public.create_reservation_with_preorder(text, text, text, integer, timestamptz, text, uuid, jsonb)
  from public;
grant execute on function public.create_reservation_with_preorder(text, text, text, integer, timestamptz, text, uuid, jsonb)
  to anon, authenticated;
