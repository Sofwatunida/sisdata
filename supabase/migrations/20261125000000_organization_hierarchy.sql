create extension if not exists pgcrypto;

create table if not exists public.bidangs (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references public.periods(id) on delete cascade,
  name text not null,
  notes text not null default '',
  sort_order integer,
  source_file text,
  source_sheet text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.bidang_coordinators (
  id uuid primary key default gen_random_uuid(),
  bidang_id uuid not null references public.bidangs(id) on delete cascade,
  personnel_id uuid references public.personnel(id) on delete set null,
  name text not null default '',
  phone text not null default '',
  notes text not null default '',
  sort_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.divisions add column if not exists bidang_id uuid references public.bidangs(id) on delete set null;
alter table public.divisions add column if not exists leader_personnel_id uuid references public.personnel(id) on delete set null;
alter table public.divisions add column if not exists leader_phone text not null default '';
alter table public.divisions add column if not exists is_archived boolean not null default false;
alter table public.divisions add column if not exists archived_at timestamptz;

alter table public.operator_permissions add column if not exists bidang_id uuid references public.bidangs(id) on delete cascade;
alter table public.activity_logs add column if not exists bidang_id uuid references public.bidangs(id) on delete set null;

create index if not exists bidangs_period_id_idx on public.bidangs (period_id);
create index if not exists bidang_coordinators_bidang_id_idx on public.bidang_coordinators (bidang_id);
create index if not exists bidang_coordinators_personnel_id_idx on public.bidang_coordinators (personnel_id);
create index if not exists divisions_bidang_id_idx on public.divisions (bidang_id);
create index if not exists divisions_leader_personnel_id_idx on public.divisions (leader_personnel_id);
create index if not exists operator_permissions_bidang_id_idx on public.operator_permissions (bidang_id);
create index if not exists activity_logs_bidang_id_idx on public.activity_logs (bidang_id);

create unique index if not exists bidangs_period_name_key
  on public.bidangs (
    coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
  );

alter table public.bidangs enable row level security;
alter table public.bidang_coordinators enable row level security;

grant all on public.bidangs to service_role;
grant all on public.bidang_coordinators to service_role;
grant select on public.bidangs to anon, authenticated;
grant select on public.bidang_coordinators to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
