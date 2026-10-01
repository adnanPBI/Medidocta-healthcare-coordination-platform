begin;

create extension if not exists btree_gist;

create table if not exists affiliation_availability_schedules (
  id uuid primary key default gen_random_uuid(),
  affiliation_id uuid not null unique references doctor_facility_affiliations(id) on delete cascade,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into affiliation_availability_schedules(affiliation_id)
select dfa.id
from doctor_facility_affiliations dfa
on conflict (affiliation_id) do nothing;

create or replace function ensure_affiliation_availability_schedule()
returns trigger
language plpgsql
as $$
begin
  insert into affiliation_availability_schedules(affiliation_id)
  values (new.id)
  on conflict (affiliation_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_affiliation_availability_schedule on doctor_facility_affiliations;

create trigger trg_affiliation_availability_schedule
after insert on doctor_facility_affiliations
for each row execute function ensure_affiliation_availability_schedule();

create table if not exists availability_schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references affiliation_availability_schedules(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  changed_by_account_id uuid not null references accounts(id) on delete restrict,
  timezone_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (schedule_id, revision_number),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

create table if not exists availability_recurring_rules (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null references availability_schedule_revisions(id) on delete cascade,
  rule_key text not null,
  iso_weekday smallint not null check (iso_weekday between 1 and 7),
  local_start time without time zone not null,
  local_end time without time zone not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (schedule_revision_id, rule_key),
  check (local_end > local_start),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

create table if not exists availability_exception_windows (
  id uuid primary key default gen_random_uuid(),
  schedule_revision_id uuid not null references availability_schedule_revisions(id) on delete cascade,
  exception_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (schedule_revision_id, exception_key),
  check (ends_at > starts_at),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

create or replace function prevent_availability_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'availability schedule revisions are immutable'
    using errcode = '23514';
end;
$$;

drop trigger if exists trg_availability_revision_immutable on availability_schedule_revisions;
create trigger trg_availability_revision_immutable
before update or delete on availability_schedule_revisions
for each row execute function prevent_availability_revision_mutation();

drop trigger if exists trg_availability_rule_immutable on availability_recurring_rules;
create trigger trg_availability_rule_immutable
before update or delete on availability_recurring_rules
for each row execute function prevent_availability_revision_mutation();

drop trigger if exists trg_availability_exception_immutable on availability_exception_windows;
create trigger trg_availability_exception_immutable
before update or delete on availability_exception_windows
for each row execute function prevent_availability_revision_mutation();

create table if not exists doctor_occupancy_intervals (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctor_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source_type text not null,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (jsonb_typeof(metadata) = 'object'),
  check (octet_length(metadata::text) <= 32768)
);

alter table doctor_occupancy_intervals
  drop constraint if exists doctor_occupancy_no_overlap;

alter table doctor_occupancy_intervals
  add constraint doctor_occupancy_no_overlap
  exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  );

create unique index if not exists ux_doctor_occupancy_source
  on doctor_occupancy_intervals(source_type, source_id)
  where source_id is not null;

create index if not exists idx_availability_schedule_affiliation
  on affiliation_availability_schedules(affiliation_id);

create index if not exists idx_availability_revision_schedule
  on availability_schedule_revisions(schedule_id, revision_number desc);

create index if not exists idx_availability_rule_revision_weekday
  on availability_recurring_rules(schedule_revision_id, iso_weekday, local_start);

create index if not exists idx_availability_exception_revision_range
  on availability_exception_windows using gist (
    schedule_revision_id,
    tstzrange(starts_at, ends_at, '[)')
  );

create index if not exists idx_doctor_occupancy_doctor_range
  on doctor_occupancy_intervals using gist (
    doctor_id,
    tstzrange(starts_at, ends_at, '[)')
  );

commit;
