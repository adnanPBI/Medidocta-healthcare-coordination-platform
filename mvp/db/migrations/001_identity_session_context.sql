begin;

create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  external_subject text not null unique,
  email text,
  preferred_locale text not null default 'fr' check (preferred_locale in ('fr','en')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists role_definitions (
  code text primary key,
  description text not null,
  is_internal boolean not null default false
);

create table if not exists permission_definitions (
  code text primary key,
  description text not null
);

create table if not exists role_permissions (
  role_code text not null references role_definitions(code) on delete cascade,
  permission_code text not null references permission_definitions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table if not exists account_roles (
  account_id uuid not null references accounts(id) on delete cascade,
  role_code text not null references role_definitions(code),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','ARCHIVED')),
  created_at timestamptz not null default now(),
  primary key (account_id, role_code)
);

create table if not exists patient_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  verification_status text not null default 'UNVERIFIED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists healthcare_facilities (
  id uuid primary key default gen_random_uuid(),
  registration_account_id uuid references accounts(id) on delete set null,
  verification_status text not null default 'UNVERIFIED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists facility_permission_bundles (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid references healthcare_facilities(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  unique (facility_id, code)
);

create table if not exists facility_bundle_permissions (
  bundle_id uuid not null references facility_permission_bundles(id) on delete cascade,
  permission_code text not null references permission_definitions(code) on delete cascade,
  primary key (bundle_id, permission_code)
);

create table if not exists facility_staff_memberships (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references healthcare_facilities(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  bundle_id uuid references facility_permission_bundles(id),
  status text not null default 'ACTIVE' check (status in ('INVITED','ACTIVE','SUSPENDED','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, account_id)
);

create table if not exists doctor_facility_affiliations (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctor_profiles(id) on delete cascade,
  facility_id uuid not null references healthcare_facilities(id) on delete cascade,
  status text not null default 'PENDING',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, facility_id)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_account_id uuid references accounts(id) on delete set null,
  action_code text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_roles_account on account_roles(account_id) where status = 'ACTIVE';
create index if not exists idx_facility_membership_account on facility_staff_memberships(account_id) where status = 'ACTIVE';
create index if not exists idx_affiliation_doctor on doctor_facility_affiliations(doctor_id) where status <> 'ARCHIVED';
create index if not exists idx_audit_resource on audit_events(resource_type, resource_id, created_at desc);

commit;
