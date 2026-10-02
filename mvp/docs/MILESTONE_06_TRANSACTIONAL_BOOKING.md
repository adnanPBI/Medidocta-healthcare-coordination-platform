# Milestone 06 - Transactional booking + ONE canonical Appointment

## Objective

Implement the first production booking command around the project's non-negotiable appointment rule:

**there is one canonical Appointment record shared by Patient, Doctor and Healthcare Facility views.**

The milestone also establishes:
- idempotent booking creation;
- actor-versus-subject separation;
- backend/database revalidation;
- global Doctor occupancy acquisition inside the same transaction;
- deterministic conflict handling;
- append-only Appointment events;
- transactional outbox creation.

Unresolved lifecycle, rescheduling, cancellation, capacity and financial policy remain decision-gated.

## Canonical Appointment

The `appointments` table contains one resource identified by one `appointment_id`.

It stores:
- Patient subject profile ID;
- booking actor account ID;
- Doctor ID;
- Facility ID;
- Doctor-Facility affiliation ID;
- canonical availability schedule ID;
- schedule revision ID used for booking;
- UTC start/end instants;
- version;
- technical metadata;
- timestamps.

Database foreign keys guarantee that the Appointment's Doctor, Facility, affiliation, availability schedule and schedule revision belong to the same canonical relationship chain.

No PatientAppointment, DoctorAppointment or FacilityAppointment shadow table exists.

## Actor vs subject

The data model deliberately separates:

- `booked_by_account_id` - who performed the booking command;
- `patient_profile_id` - who the Appointment is for.

Because DR-003 is unresolved, the public API currently permits only a Patient to book for their own PatientProfile.

A different `subjectPatientProfileId` returns:

`409 BOOKING_FOR_ANOTHER_PERSON_NOT_ENABLED`

The schema is ready for approved proxy/dependent booking later without rewriting Appointment identity.

## Technical booking enablement

`doctor_facility_affiliations.booking_enabled` is a conservative technical safety gate and defaults to `false`.

It does not represent affiliation lifecycle state, contract acceptance or commercial authority.

An affiliation must be explicitly enabled by controlled backend/operations data before the booking command can commit. No public endpoint is added in this milestone to change that flag.

## Booking endpoint

`POST /v1/bookings/appointments`

Required header:

`Idempotency-Key: <8-128 character key>`

Body:
- `affiliationId`
- `scheduleRevisionId`
- `startsAt`
- `endsAt`
- optional `subjectPatientProfileId`, currently restricted to the authenticated PatientProfile

No cancellation, rescheduling, pricing, tax, room or arrival field is accepted.

Unknown fields are rejected rather than silently becoming product policy.

## Transaction sequence

The command performs the following inside one PostgreSQL transaction:

1. establish/lock the account + idempotency-key record;
2. reject reuse of the key with a different normalized request hash;
3. replay the original Appointment if the same key/request already completed;
4. lock/read the canonical Doctor-Facility affiliation + current availability schedule;
5. require the affiliation technical booking gate;
6. require that the client's `scheduleRevisionId` is still current;
7. revalidate that the requested interval lies inside a current recurring availability rule;
8. fail closed if an overlapping availability exception exists while DR-008 precedence is unresolved;
9. insert one canonical Appointment;
10. insert global Doctor occupancy for that Appointment;
11. append `APPOINTMENT_CREATED` event;
12. append `APPOINTMENT_CREATED` outbox event;
13. mark idempotency state COMPLETE;
14. append audit event;
15. commit.

If any step fails, the transaction rolls back Appointment, occupancy, event, outbox and idempotency completion together.

## Idempotency

`booking_idempotency` is unique by:

`(account_id, idempotency_key)`

The request hash is generated from normalized canonical booking fields.

Behavior:
- same key + same request after success -> original Appointment replayed;
- same key + changed request -> `409 IDEMPOTENCY_KEY_REUSE`;
- failed/rolled-back booking -> no partial COMPLETE record survives.

This addresses double-click/network retry behavior without client-only duplicate suppression.

## Backend revalidation

A displayed candidate slot is never trusted.

At booking time the backend verifies:
- the affiliation still exists;
- the affiliation is technically enabled for booking;
- the selected schedule revision is still current;
- the interval still fits a recurring rule in that revision;
- no unresolved exception overlaps;
- the Doctor can acquire global occupancy.

A stale projection returns:

`409 AVAILABILITY_VERSION_CONFLICT`

An interval outside current recurring availability returns:

`409 BOOKING_OUTSIDE_AVAILABILITY`

An interval overlapping an unresolved exception returns:

`409 BOOKING_EXCEPTION_POLICY_UNRESOLVED`

## Deterministic double-booking conflict

Global Doctor occupancy is inserted before commit using the Milestone 05 PostgreSQL GiST exclusion constraint.

An overlapping interval for the same Doctor, including a different Healthcare Facility, becomes:

`409 BOOKING_CONFLICT`

The Appointment insert occurs in the same transaction, so a rejected conflict leaves no orphan Appointment, event, outbox row or occupancy record.

## Appointment events

`appointment_events` is append-only.

Milestone 06 writes only:

`APPOINTMENT_CREATED`

This is a technical creation event, not an invented business lifecycle state.

Update/delete of historical events is rejected by PostgreSQL.

Cancellation, rescheduling, arrival and consultation transitions are not exposed until their respective product rules are approved.

## Transactional outbox

Every committed booking writes:

- aggregate type: `APPOINTMENT`
- event type: `APPOINTMENT_CREATED`
- status: `PENDING`

inside the same transaction as the Appointment.

No notification provider is called inside the booking transaction.

Therefore a future email/SMS/WhatsApp provider failure cannot roll back a committed Appointment.

Milestone 08 will add worker/provider delivery behavior.

## Shared Appointment reads

The same Appointment can be read through party/resource authorization by:
- its Patient;
- its Doctor;
- Facility staff with `appointment.read` for that exact Facility;
- explicit Medidocta platform oversight.

Implemented APIs:
- `GET /v1/appointments/:appointmentId`
- `GET /v1/appointments/:appointmentId/events`
- `GET /v1/patients/me/appointments`
- `GET /v1/doctors/me/appointments`
- `GET /v1/facilities/:facilityId/appointments`

All return the canonical `appointments` rows rather than role-specific copies.

## PRODUCT DECISION REQUIRED gates

### DR-003 - Booking for another person
Proxy/dependent booking, relationship and consent are not enabled.

### DR-004 - Appointment lifecycle
No complete state machine is invented.

### DR-005 - Cancellation
No cancellation command exists.

### DR-006 - Rescheduling
No reschedule command exists.

### DR-009 - Capacity
The fixed architecture requirement that one Doctor cannot be in overlapping committed occupancy is enforced. No group/capacity exception model is invented.

### DR-021 / DR-022 - Arrival
Patient/Doctor arrival facts are not written in this milestone.

### DR-049 - Financial history
No contract/fee/commission snapshot is attached to the Appointment.

### DR-050 - Currency/tax
No currency or tax rule is invented.

Scheduling decisions from Milestone 05 also remain gated:
DR-007, DR-008, DR-010, DR-012, DR-043, DR-044, DR-045 and DR-046.

## Acceptance criteria

1. Exactly one canonical Appointment record represents a booking.
2. Patient, Doctor and authorized Facility staff read the same Appointment ID.
3. Actor and Patient subject are separate persisted identities.
4. Booking for another person is blocked until policy approval.
5. Same account/key/request is idempotently replayed.
6. Same account/key/different request is rejected.
7. A stale schedule revision cannot commit.
8. Booking outside the current recurring schedule cannot commit.
9. Unresolved overlapping exception policy fails closed.
10. Same-Doctor overlap in one Facility is rejected.
11. Same-Doctor overlap across different Facilities is rejected.
12. Failed conflict leaves no orphan Appointment.
13. Appointment event and outbox rows are created only with a committed Appointment.
14. Outbox creation is transactional and provider delivery is deferred.
15. Cancellation/rescheduling/lifecycle/financial rules are not fabricated.
