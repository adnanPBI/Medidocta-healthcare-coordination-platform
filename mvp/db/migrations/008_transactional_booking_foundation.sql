begin;

alter table doctor_facility_affiliations
  add column if not exists booking_enabled boolean not null default false;

alter table doctor_facility_affiliations
  drop constraint if exists doctor_facility_affiliations_id_doctor_facility_unique;

alter table doctor_facility_affiliations
  add constraint doctor_facility_affiliations_id_doctor_facility_unique
  unique (id, doctor_id, facility_id);

alter table affiliation_availability_schedules
  drop constraint if exists affiliation_availability_schedules_affiliation_id_id_unique;

alter table affiliation_availability_schedules
  add constraint affiliation_availability_schedules_affiliation_id_id_unique
  unique (affiliation_id, id);

alter table availability_schedule_revisions
  drop constraint if exists availability_schedule_revisions_id_schedule_unique;

alter table availability_schedule_revisions
  add constraint availability_schedule_revisions_id_schedule_unique
  unique (id, schedule_id);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references patient_profiles(id) on delete restrict,
  booked_by_account_id uuid not null references accounts(id) on delete restrict,
  doctor_id uuid not null references doctor_profiles(id) on delete restrict,
  facility_id uuid not null references healthcare_facilities(id) on delete restrict,
  affiliation_id uuid not null,
  availability_schedule_id uuid not null,
  schedule_revision_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768),
  constraint appointments_affiliation_party_fkey
    foreign key (affiliation_id, doctor_id, facility_id)
    references doctor_facility_affiliations(id, doctor_id, facility_id),
  constraint appointments_affiliation_schedule_fkey
    foreign key (affiliation_id, availability_schedule_id)
    references affiliation_availability_schedules(affiliation_id, id),
  constraint appointments_schedule_revision_fkey
    foreign key (schedule_revision_id, availability_schedule_id)
    references availability_schedule_revisions(id, schedule_id)
);

create index if not exists idx_appointments_patient_time
  on appointments(patient_profile_id, starts_at desc);

create index if not exists idx_appointments_doctor_time
  on appointments(doctor_id, starts_at desc);

create index if not exists idx_appointments_facility_time
  on appointments(facility_id, starts_at desc);

create table if not exists appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  event_code text not null,
  actor_account_id uuid references accounts(id) on delete set null,
  semantic_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (appointment_id, sequence_number),
  unique (appointment_id, semantic_key),
  check (jsonb_typeof(payload) = 'object'),
  check (octet_length(payload::text) <= 32768)
);

create or replace function prevent_appointment_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'appointment events are append-only'
    using errcode = '23514';
end;
$$;

drop trigger if exists trg_appointment_event_immutable on appointment_events;

create trigger trg_appointment_event_immutable
before update or delete on appointment_events
for each row execute function prevent_appointment_event_mutation();

create table if not exists booking_idempotency (
  account_id uuid not null references accounts(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS','COMPLETE')),
  appointment_id uuid references appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, idempotency_key),
  check (char_length(idempotency_key) between 8 and 128),
  check (request_hash ~ '^[0-9a-f]{64}$'),
  check (
    (status = 'IN_PROGRESS' and appointment_id is null)
    or (status = 'COMPLETE' and appointment_id is not null)
  )
);

create index if not exists idx_booking_idempotency_appointment
  on booking_idempotency(appointment_id)
  where appointment_id is not null;

create table if not exists outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','DELIVERED','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aggregate_type, aggregate_id, event_key),
  check (jsonb_typeof(payload) = 'object'),
  check (octet_length(payload::text) <= 65536)
);

create index if not exists idx_outbox_pending
  on outbox_events(status, available_at, created_at)
  where status in ('PENDING','FAILED');

commit;
