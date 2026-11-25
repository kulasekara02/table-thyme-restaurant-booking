create extension if not exists pgcrypto;

do $$
begin
  create type public.staff_role as enum ('staff', 'admin');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reservation_status as enum (
    'pending',
    'confirmed',
    'cancelled',
    'completed'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.staff_role not null default 'staff',
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  reservation_at timestamptz not null,
  party_size integer not null check (party_size between 1 and 12),
  note text not null default '',
  status public.reservation_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists reservations_reservation_at_idx
  on public.reservations (reservation_at);
create index if not exists reservations_customer_id_idx
  on public.reservations (customer_id);

create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
$$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create or replace function public.create_reservation(
  p_full_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_reservation_at timestamptz,
  p_note text default ''
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

  insert into public.customers (full_name, email, phone)
  values (
    trim(p_full_name),
    normalized_email,
    trim(p_phone)
  )
  on conflict (email) do nothing;

  select id into customer_id
  from public.customers
  where email = normalized_email;

  insert into public.reservations (
    customer_id,
    reservation_at,
    party_size,
    note
  )
  values (
    customer_id,
    p_reservation_at,
    p_party_size,
    trim(coalesce(p_note, ''))
  )
  returning id into reservation_id;

  return reservation_id;
end;
$$;

create or replace function public.set_staff_role(
  p_target_user_id uuid,
  p_role public.staff_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null
     or public.current_staff_role() is distinct from 'admin'::public.staff_role then
    raise exception 'Only an administrator can change staff roles.' using errcode = '42501';
  end if;

  if p_target_user_id = (select auth.uid())
     and p_role <> 'admin'::public.staff_role then
    raise exception 'You cannot remove your own administrator access.' using errcode = '22023';
  end if;

  update public.profiles
  set role = p_role
  where id = p_target_user_id;

  if not found then
    raise exception 'Staff profile was not found.' using errcode = '22023';
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "Staff can view profiles" on public.profiles;
create policy "Staff can view profiles"
  on public.profiles for select to authenticated
  using (public.current_staff_role() is not null);

drop policy if exists "Staff can view customers" on public.customers;
create policy "Staff can view customers"
  on public.customers for select to authenticated
  using (public.current_staff_role() is not null);

drop policy if exists "Staff can view reservations" on public.reservations;
create policy "Staff can view reservations"
  on public.reservations for select to authenticated
  using (public.current_staff_role() is not null);

drop policy if exists "Staff can update reservation status" on public.reservations;
create policy "Staff can update reservation status"
  on public.reservations for update to authenticated
  using (public.current_staff_role() is not null)
  with check (public.current_staff_role() is not null);

revoke all on public.profiles from anon, authenticated;
revoke all on public.customers from anon, authenticated;
revoke all on public.reservations from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.customers to authenticated;
grant select on public.reservations to authenticated;
grant update (status) on public.reservations to authenticated;

revoke all on function public.current_staff_role() from public, anon;
grant execute on function public.current_staff_role() to authenticated;

revoke all on function public.create_reservation(text, text, text, integer, timestamptz, text) from public;
grant execute on function public.create_reservation(text, text, text, integer, timestamptz, text) to anon, authenticated;

revoke all on function public.set_staff_role(uuid, public.staff_role) from public, anon;
grant execute on function public.set_staff_role(uuid, public.staff_role) to authenticated;
