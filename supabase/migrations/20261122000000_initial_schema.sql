create extension if not exists pgcrypto;

create table if not exists public.periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year text,
  start_date text not null default '',
  end_date text not null default '',
  status text not null default 'draft',
  description text not null default '',
  source_file text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  username text not null unique,
  email text,
  full_name text not null,
  role text not null check (role in ('admin', 'operator')),
  is_active boolean not null default true,
  password_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.master_data (
  id uuid primary key,
  type text not null,
  value text not null,
  is_active boolean not null default true,
  sort_order integer
);

create table if not exists public.divisions (
  id uuid primary key,
  period_id uuid references public.periods(id) on delete cascade,
  code text not null,
  name text not null,
  alias text,
  category text,
  leader_name text,
  coordinator_name text,
  required_count integer not null default 0,
  notes text,
  sort_order integer,
  source_file text,
  source_sheet text,
  is_active boolean not null default true
);

create table if not exists public.personnel (
  id uuid primary key,
  code text not null unique,
  full_name text not null,
  gender text,
  birth_place text,
  birth_date text,
  origin text,
  korwil text,
  phone text,
  phone_raw text,
  address text,
  status text not null default 'aktif',
  notes text,
  source_file text,
  source_sheet text,
  source_row integer,
  fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.assignments (
  id uuid primary key,
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  period_id uuid references public.periods(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  position_id text,
  position_name text not null default 'Anggota',
  start_date text not null default '',
  end_date text not null default '',
  status text not null default 'aktif',
  notes text,
  source_file text,
  source_sheet text,
  source_row integer,
  created_at timestamptz not null default now()
);

create table if not exists public.supervisors (
  id uuid primary key,
  period_id uuid references public.periods(id) on delete cascade,
  name text not null,
  group_name text not null,
  phone text,
  notes text,
  status text not null default 'aktif',
  source_file text,
  source_sheet text
);

create table if not exists public.work_assignments (
  id uuid primary key,
  supervisor_id uuid not null references public.supervisors(id) on delete cascade,
  period_id uuid references public.periods(id) on delete cascade,
  name text not null,
  notes text,
  status text not null default 'aktif',
  source_file text,
  source_sheet text,
  source_row integer
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null default ''
);

create table if not exists public.operator_permissions (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period_id uuid references public.periods(id) on delete cascade,
  division_id uuid references public.divisions(id) on delete cascade,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_move boolean not null default false,
  can_manage_assignments boolean not null default false,
  can_import boolean not null default false,
  can_export boolean not null default false,
  can_view_reports boolean not null default false
);

create table if not exists public.activity_logs (
  id uuid primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  period_id uuid references public.periods(id) on delete set null,
  division_id uuid references public.divisions(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.backups (
  id uuid primary key,
  file_name text not null,
  created_by text not null,
  size bigint not null default 0,
  summary jsonb,
  snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key,
  file_name text not null,
  period_id uuid references public.periods(id) on delete set null,
  created_by text not null,
  status text not null default 'preview',
  summary jsonb,
  backup_id uuid references public.backups(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.import_rows (
  id uuid primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  status text not null default 'berhasil',
  raw_data jsonb not null default '{}'::jsonb,
  mapped_data jsonb not null default '{}'::jsonb,
  message text not null default '',
  source_sheet text not null default '',
  source_row integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists divisions_period_id_idx on public.divisions (period_id);
create index if not exists assignments_personnel_id_idx on public.assignments (personnel_id);
create index if not exists assignments_division_id_idx on public.assignments (division_id);
create index if not exists assignments_period_id_idx on public.assignments (period_id);
create index if not exists personnel_fingerprint_idx on public.personnel (fingerprint);
create index if not exists operator_permissions_profile_id_idx on public.operator_permissions (profile_id);
create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists import_rows_batch_id_idx on public.import_rows (batch_id);

alter table public.periods enable row level security;
alter table public.profiles enable row level security;
alter table public.master_data enable row level security;
alter table public.divisions enable row level security;
alter table public.personnel enable row level security;
alter table public.assignments enable row level security;
alter table public.supervisors enable row level security;
alter table public.work_assignments enable row level security;
alter table public.settings enable row level security;
alter table public.operator_permissions enable row level security;
alter table public.activity_logs enable row level security;
alter table public.backups enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

grant usage on schema public to service_role, anon, authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
