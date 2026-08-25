create extension if not exists pgcrypto;

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  couple_name text not null,
  wedding_date timestamptz,
  timezone text,
  price_per_guest numeric(12, 2) not null default 0,
  payment_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weddings_price_per_guest_nonnegative check (price_per_guest >= 0)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  contact_name text,
  email text,
  phone text,
  guest_count integer not null,
  attendance_status text not null default 'pending',
  payment_method text,
  payment_status text not null default 'pending',
  total_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_guest_count_range check (guest_count between 1 and 20),
  constraint registrations_attendance_status_valid check (attendance_status in ('pending', 'confirmed', 'cancelled')),
  constraint registrations_payment_method_valid check (payment_method is null or payment_method in ('mercadopago', 'cash')),
  constraint registrations_payment_status_valid check (payment_status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint registrations_total_amount_nonnegative check (total_amount >= 0)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  document_number text,
  age_category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_age_category_valid check (age_category is null or age_category in ('adult', 'child'))
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  external_reference text,
  amount numeric(12, 2) not null,
  currency text not null default 'ARS',
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_valid check (provider in ('mercadopago', 'cash')),
  constraint payments_amount_nonnegative check (amount >= 0),
  constraint payments_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create index registrations_wedding_id_idx on public.registrations(wedding_id);
create index registrations_payment_status_idx on public.registrations(payment_status);
create index registrations_attendance_status_idx on public.registrations(attendance_status);
create index registrations_wedding_payment_status_idx on public.registrations(wedding_id, payment_status);
create index guests_registration_id_idx on public.guests(registration_id);
create index payments_registration_id_idx on public.payments(registration_id);
create unique index payments_provider_payment_id_unique_idx
  on public.payments(provider, provider_payment_id) where provider_payment_id is not null;
create index payments_external_reference_idx on public.payments(external_reference);
create index payments_status_idx on public.payments(status);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger weddings_set_updated_at before update on public.weddings
for each row execute function public.set_updated_at();
create trigger registrations_set_updated_at before update on public.registrations
for each row execute function public.set_updated_at();
create trigger guests_set_updated_at before update on public.guests
for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();

alter table public.weddings enable row level security;
alter table public.registrations enable row level security;
alter table public.guests enable row level security;
alter table public.payments enable row level security;

-- No policies are created in Sprint 05: anon and authenticated roles fail closed.
