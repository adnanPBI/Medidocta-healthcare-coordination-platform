begin;

alter table audit_events
  add column if not exists source_code text not null default 'DOMAIN',
  add column if not exists correlation_id text;

alter table audit_events
  drop constraint if exists audit_events_metadata_object_check;

alter table audit_events
  add constraint audit_events_metadata_object_check
  check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 65536
  );

create index if not exists idx_audit_actor_created
  on audit_events(actor_account_id, created_at desc);

create index if not exists idx_audit_action_created
  on audit_events(action_code, created_at desc);

create or replace function prevent_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit events are append-only'
    using errcode = '23514';
end;
$$;

drop trigger if exists trg_audit_event_immutable on audit_events;

create trigger trg_audit_event_immutable
before update or delete on audit_events
for each row execute function prevent_audit_event_mutation();

alter table outbox_events
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text;

alter table outbox_events
  drop constraint if exists outbox_events_last_error_message_check;

alter table outbox_events
  add constraint outbox_events_last_error_message_check
  check (
    last_error_message is null
    or char_length(last_error_message) <= 2000
  );

create index if not exists idx_outbox_claim
  on outbox_events(status, available_at, lease_expires_at, created_at);

create table if not exists outbox_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_event_id uuid not null references outbox_events(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  worker_id text not null,
  outcome text not null check (outcome in ('DELIVERED','FAILED')),
  error_code text,
  error_message text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (outbox_event_id, attempt_number),
  check (completed_at >= started_at),
  check (char_length(worker_id) between 1 and 160),
  check (error_message is null or char_length(error_message) <= 2000),
  check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 32768
  )
);

create index if not exists idx_outbox_attempt_event
  on outbox_delivery_attempts(outbox_event_id, attempt_number desc);

create or replace function prevent_delivery_attempt_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'delivery attempts are append-only'
    using errcode = '23514';
end;
$$;

drop trigger if exists trg_outbox_attempt_immutable on outbox_delivery_attempts;

create trigger trg_outbox_attempt_immutable
before update or delete on outbox_delivery_attempts
for each row execute function prevent_delivery_attempt_mutation();

create table if not exists notification_delivery_intents (
  id uuid primary key default gen_random_uuid(),
  source_outbox_event_id uuid references outbox_events(id) on delete set null,
  recipient_account_id uuid not null references accounts(id) on delete restrict,
  channel_code text not null,
  template_code text not null,
  locale text not null check (locale in ('fr','en')),
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING','PROCESSING','DELIVERED','FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  provider_message_id text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  check (char_length(channel_code) between 1 and 80),
  check (char_length(template_code) between 1 and 160),
  check (char_length(idempotency_key) between 8 and 200),
  check (last_error_message is null or char_length(last_error_message) <= 2000),
  check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 65536
  )
);

create index if not exists idx_notification_intent_claim
  on notification_delivery_intents(status, available_at, lease_expires_at, created_at);

create index if not exists idx_notification_recipient_created
  on notification_delivery_intents(recipient_account_id, created_at desc);

create table if not exists notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_intent_id uuid not null references notification_delivery_intents(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  worker_id text not null,
  channel_code text not null,
  provider_code text,
  provider_message_id text,
  outcome text not null check (outcome in ('DELIVERED','FAILED')),
  error_code text,
  error_message text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (notification_intent_id, attempt_number),
  check (completed_at >= started_at),
  check (char_length(worker_id) between 1 and 160),
  check (error_message is null or char_length(error_message) <= 2000),
  check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 32768
  )
);

drop trigger if exists trg_notification_attempt_immutable on notification_delivery_attempts;

create trigger trg_notification_attempt_immutable
before update or delete on notification_delivery_attempts
for each row execute function prevent_delivery_attempt_mutation();

create table if not exists file_objects (
  id uuid primary key default gen_random_uuid(),
  created_by_account_id uuid not null references accounts(id) on delete restrict,
  storage_backend_code text not null,
  storage_object_key text not null unique,
  original_filename text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (char_length(storage_backend_code) between 1 and 80),
  check (char_length(storage_object_key) between 1 and 1024),
  check (char_length(original_filename) between 1 and 255),
  check (char_length(content_type) between 1 and 255),
  check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 32768
  )
);

create index if not exists idx_file_created_by
  on file_objects(created_by_account_id, created_at desc);

create table if not exists file_attachment_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references file_objects(id) on delete restrict,
  resource_type text not null,
  resource_id uuid not null,
  relation_code text not null,
  attached_by_account_id uuid not null references accounts(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (file_id, resource_type, resource_id, relation_code),
  check (char_length(resource_type) between 1 and 80),
  check (char_length(relation_code) between 1 and 80),
  check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 32768
  )
);

create index if not exists idx_file_attachment_resource
  on file_attachment_links(resource_type, resource_id, created_at desc);

create or replace function prevent_file_metadata_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'file metadata/link records are append-only'
    using errcode = '23514';
end;
$$;

drop trigger if exists trg_file_object_immutable on file_objects;
create trigger trg_file_object_immutable
before update or delete on file_objects
for each row execute function prevent_file_metadata_mutation();

drop trigger if exists trg_file_attachment_immutable on file_attachment_links;
create trigger trg_file_attachment_immutable
before update or delete on file_attachment_links
for each row execute function prevent_file_metadata_mutation();

commit;
