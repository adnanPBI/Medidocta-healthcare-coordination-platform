begin;

insert into permission_definitions(code, description, delegation_scope) values
  ('facility.reception.read','Read Facility reception/operational appointment board','FACILITY_BUNDLE'),
  ('appointment.operations.read','Read operational facts for appointments in authorized Facility scope','FACILITY_BUNDLE'),
  ('room.read','Read Facility rooms and room allocation facts','FACILITY_BUNDLE'),
  ('room.manage','Manage Facility room resources/assignments when product policy permits','FACILITY_BUNDLE')
on conflict (code) do update
  set description = excluded.description,
      delegation_scope = excluded.delegation_scope;

create table if not exists facility_rooms (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references healthcare_facilities(id) on delete cascade,
  code text not null,
  display_name text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, code),
  unique (id, facility_id),
  check (char_length(code) between 1 and 80),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

create index if not exists idx_facility_rooms_facility_status
  on facility_rooms(facility_id, status, code);

create table if not exists appointment_arrival_facts (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  party_kind text not null check (party_kind in ('PATIENT','DOCTOR')),
  arrived_at timestamptz not null,
  recorded_by_account_id uuid not null references accounts(id) on delete restrict,
  semantic_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (appointment_id, party_kind),
  unique (appointment_id, semantic_key),
  check (char_length(semantic_key) between 1 and 160),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

create index if not exists idx_appointment_arrival_appointment
  on appointment_arrival_facts(appointment_id, party_kind);

create table if not exists appointment_consultation_facts (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  fact_code text not null check (
    fact_code in ('CONSULTATION_STARTED','CONSULTATION_COMPLETED')
  ),
  occurred_at timestamptz not null,
  recorded_by_account_id uuid not null references accounts(id) on delete restrict,
  semantic_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (appointment_id, semantic_key),
  check (char_length(semantic_key) between 1 and 160),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

create index if not exists idx_consultation_facts_appointment_time
  on appointment_consultation_facts(appointment_id, occurred_at, id);

create table if not exists appointment_room_assignment_threads (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into appointment_room_assignment_threads(appointment_id)
select a.id
from appointments a
on conflict (appointment_id) do nothing;

create or replace function ensure_appointment_room_assignment_thread()
returns trigger
language plpgsql
as $$
begin
  insert into appointment_room_assignment_threads(appointment_id)
  values (new.id)
  on conflict (appointment_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_appointment_room_assignment_thread on appointments;

create trigger trg_appointment_room_assignment_thread
after insert on appointments
for each row execute function ensure_appointment_room_assignment_thread();

create table if not exists appointment_room_assignment_revisions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references appointment_room_assignment_threads(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  room_id uuid not null,
  facility_id uuid not null,
  assigned_by_account_id uuid not null references accounts(id) on delete restrict,
  assignment_starts_at timestamptz not null,
  assignment_ends_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (thread_id, revision_number),
  constraint room_assignment_room_facility_fkey
    foreign key (room_id, facility_id)
    references facility_rooms(id, facility_id),
  check (assignment_ends_at > assignment_starts_at),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

create index if not exists idx_room_assignment_room_range
  on appointment_room_assignment_revisions(
    room_id,
    assignment_starts_at,
    assignment_ends_at
  );

create index if not exists idx_room_assignment_thread_revision
  on appointment_room_assignment_revisions(thread_id, revision_number desc);

create or replace function prevent_operational_fact_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'operational facts/revisions are append-only'
    using errcode = '23514';
end;
$$;

drop trigger if exists trg_arrival_fact_immutable on appointment_arrival_facts;
create trigger trg_arrival_fact_immutable
before update or delete on appointment_arrival_facts
for each row execute function prevent_operational_fact_mutation();

drop trigger if exists trg_consultation_fact_immutable on appointment_consultation_facts;
create trigger trg_consultation_fact_immutable
before update or delete on appointment_consultation_facts
for each row execute function prevent_operational_fact_mutation();

drop trigger if exists trg_room_assignment_revision_immutable on appointment_room_assignment_revisions;
create trigger trg_room_assignment_revision_immutable
before update or delete on appointment_room_assignment_revisions
for each row execute function prevent_operational_fact_mutation();

commit;
