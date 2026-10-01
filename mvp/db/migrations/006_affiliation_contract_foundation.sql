begin;

create table if not exists affiliation_contract_threads (
  id uuid primary key default gen_random_uuid(),
  affiliation_id uuid not null unique references doctor_facility_affiliations(id) on delete cascade,
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into affiliation_contract_threads(affiliation_id)
select dfa.id
from doctor_facility_affiliations dfa
on conflict (affiliation_id) do nothing;

create or replace function ensure_affiliation_contract_thread()
returns trigger
language plpgsql
as $$
begin
  insert into affiliation_contract_threads(affiliation_id)
  values (new.id)
  on conflict (affiliation_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_affiliation_contract_thread on doctor_facility_affiliations;

create trigger trg_affiliation_contract_thread
after insert on doctor_facility_affiliations
for each row execute function ensure_affiliation_contract_thread();

create table if not exists contract_proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  contract_thread_id uuid not null references affiliation_contract_threads(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  proposed_by_account_id uuid not null references accounts(id) on delete restrict,
  proposal_payload jsonb not null default '{}'::jsonb,
  financial_terms_payload jsonb not null default '{}'::jsonb,
  proposed_effective_from date,
  proposed_effective_until date,
  created_at timestamptz not null default now(),
  unique (contract_thread_id, revision_number),
  check (
    proposed_effective_from is null
    or proposed_effective_until is null
    or proposed_effective_until >= proposed_effective_from
  ),
  check (jsonb_typeof(proposal_payload) = 'object'),
  check (jsonb_typeof(financial_terms_payload) = 'object'),
  check (octet_length(proposal_payload::text) <= 65536),
  check (octet_length(financial_terms_payload::text) <= 65536)
);

create or replace function prevent_contract_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'contract proposal revisions are immutable'
    using errcode = '23514';
end;
$$;

drop trigger if exists trg_contract_revision_immutable on contract_proposal_revisions;

create trigger trg_contract_revision_immutable
before update or delete on contract_proposal_revisions
for each row execute function prevent_contract_revision_mutation();

create index if not exists idx_affiliation_doctor_facility
  on doctor_facility_affiliations(doctor_id, facility_id);

create index if not exists idx_contract_revision_thread_created
  on contract_proposal_revisions(contract_thread_id, revision_number desc);

create index if not exists idx_contract_revision_actor
  on contract_proposal_revisions(proposed_by_account_id, created_at desc);

commit;
