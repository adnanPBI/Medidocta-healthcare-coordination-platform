begin;

alter table permission_definitions
  add column if not exists delegation_scope text not null default 'PLATFORM_ONLY';

alter table permission_definitions
  drop constraint if exists permission_definitions_delegation_scope_check;

alter table permission_definitions
  add constraint permission_definitions_delegation_scope_check
  check (delegation_scope in ('PLATFORM_ONLY','FACILITY_BUNDLE'));

insert into permission_definitions(code, description, delegation_scope) values
  ('facility.staff.read','Read Facility staff memberships in authorized Facility scope','FACILITY_BUNDLE'),
  ('facility.bundle.read','Read Facility permission bundles in authorized Facility scope','FACILITY_BUNDLE'),
  ('facility.bundle.manage','Manage Facility permission bundles when product policy permits','FACILITY_BUNDLE')
on conflict (code) do update
  set description = excluded.description,
      delegation_scope = excluded.delegation_scope;

update permission_definitions
set delegation_scope = 'FACILITY_BUNDLE'
where code in (
  'facility.profile.read',
  'facility.profile.update',
  'facility.staff.manage',
  'search.public.read',
  'affiliation.read',
  'affiliation.manage',
  'contract.read',
  'contract.manage',
  'availability.read',
  'availability.update',
  'appointment.read',
  'appointment.manage'
);

alter table facility_permission_bundles
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists updated_at timestamptz not null default now();

alter table facility_staff_memberships
  add column if not exists version integer not null default 1 check (version > 0);

alter table facility_permission_bundles
  drop constraint if exists facility_permission_bundles_id_facility_unique;

alter table facility_permission_bundles
  add constraint facility_permission_bundles_id_facility_unique unique (id, facility_id);

alter table facility_staff_memberships
  drop constraint if exists facility_staff_memberships_bundle_id_fkey;

alter table facility_staff_memberships
  drop constraint if exists facility_staff_memberships_bundle_facility_fkey;

alter table facility_staff_memberships
  add constraint facility_staff_memberships_bundle_facility_fkey
  foreign key (bundle_id, facility_id)
  references facility_permission_bundles(id, facility_id);

alter table facility_staff_memberships
  drop constraint if exists facility_staff_active_requires_bundle;

alter table facility_staff_memberships
  add constraint facility_staff_active_requires_bundle
  check (status <> 'ACTIVE' or bundle_id is not null);

do $
begin
  if exists (
    select 1
    from facility_bundle_permissions fbp
    join permission_definitions pd on pd.code = fbp.permission_code
    where pd.delegation_scope <> 'FACILITY_BUNDLE'
  ) then
    raise exception 'existing Facility bundle contains a non-delegatable permission';
  end if;
end;
$;

create or replace function enforce_facility_delegatable_permission()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from permission_definitions pd
    where pd.code = new.permission_code
      and pd.delegation_scope = 'FACILITY_BUNDLE'
  ) then
    raise exception 'permission % is not delegatable to Facility bundles', new.permission_code
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_facility_bundle_permission_scope on facility_bundle_permissions;

create trigger trg_facility_bundle_permission_scope
before insert or update on facility_bundle_permissions
for each row execute function enforce_facility_delegatable_permission();

create index if not exists idx_facility_staff_facility_status
  on facility_staff_memberships(facility_id, status);

create index if not exists idx_facility_bundle_facility_status
  on facility_permission_bundles(facility_id, status);

commit;
