create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from public, anon, authenticated;

comment on table public.admin_users is
  'Allowlist server-side de usuarios autorizados para administrar la boda.';
