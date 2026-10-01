begin;

insert into role_definitions(code, description, is_internal) values
  ('PATIENT','Patient platform role',false),
  ('DOCTOR','Doctor platform role',false),
  ('FACILITY','Healthcare Facility registration/account role',false),
  ('MEDIDOCTA_VERIFIER','Internal verification role',true),
  ('MEDIDOCTA_SUPPORT','Internal support role',true),
  ('MEDIDOCTA_ADMIN','Internal platform administration role',true)
on conflict (code) do nothing;

insert into permission_definitions(code, description) values
  ('session.context.read','Read own resolved session context'),
  ('profile.patient.read','Read own patient profile'),
  ('profile.patient.update','Update own patient profile'),
  ('profile.doctor.read','Read own doctor profile'),
  ('profile.doctor.update','Update own doctor profile'),
  ('facility.profile.read','Read facility profile in authorized scope'),
  ('facility.profile.update','Update facility profile in authorized scope'),
  ('facility.staff.manage','Manage facility staff memberships/bundles in authorized scope'),
  ('search.public.read','Read published Doctor/Facility discovery records'),
  ('availability.read','Read bookable availability projection'),
  ('availability.update','Update affiliation-scoped availability when authorized'),
  ('appointment.create','Create an appointment when booking policy permits'),
  ('appointment.read','Read an appointment in authorized resource scope'),
  ('appointment.manage','Run approved appointment lifecycle operations'),
  ('affiliation.read','Read Doctor-Facility affiliation when a party/authorized staff'),
  ('affiliation.manage','Run approved affiliation workflow actions'),
  ('contract.read','Read contract/financial terms in authorized scope'),
  ('contract.manage','Run approved proposal/counter/decision actions'),
  ('verification.read','Read verification case/evidence in authorized scope'),
  ('verification.manage','Review/decide verification in authorized scope'),
  ('audit.read','Read authorized audit history'),
  ('admin.oversight','Use privileged Medidocta administration capabilities')
on conflict (code) do nothing;

-- Conservative top-level permissions only. Facility staff bundle membership is deliberately
-- data-driven because DR-016 (staff role catalog/custom bundles) is PRODUCT DECISION REQUIRED.
insert into role_permissions(role_code, permission_code) values
  ('PATIENT','session.context.read'),
  ('PATIENT','profile.patient.read'),
  ('PATIENT','profile.patient.update'),
  ('PATIENT','search.public.read'),
  ('PATIENT','availability.read'),
  ('PATIENT','appointment.create'),
  ('PATIENT','appointment.read'),
  ('DOCTOR','session.context.read'),
  ('DOCTOR','profile.doctor.read'),
  ('DOCTOR','profile.doctor.update'),
  ('DOCTOR','search.public.read'),
  ('DOCTOR','affiliation.read'),
  ('DOCTOR','availability.read'),
  ('DOCTOR','appointment.read'),
  ('FACILITY','session.context.read'),
  ('FACILITY','facility.profile.read'),
  ('FACILITY','search.public.read'),
  ('FACILITY','appointment.read'),
  ('MEDIDOCTA_VERIFIER','session.context.read'),
  ('MEDIDOCTA_VERIFIER','verification.read'),
  ('MEDIDOCTA_VERIFIER','verification.manage'),
  ('MEDIDOCTA_SUPPORT','session.context.read'),
  ('MEDIDOCTA_SUPPORT','appointment.read'),
  ('MEDIDOCTA_ADMIN','session.context.read'),
  ('MEDIDOCTA_ADMIN','admin.oversight'),
  ('MEDIDOCTA_ADMIN','audit.read')
on conflict do nothing;

commit;
