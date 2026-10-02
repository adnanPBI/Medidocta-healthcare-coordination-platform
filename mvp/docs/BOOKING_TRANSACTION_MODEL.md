# Booking transaction model

## Command contract

The initial safe booking command is intentionally narrow:

`Authenticated Patient -> own PatientProfile -> selected DoctorFacilityAffiliation -> current schedule revision -> explicit UTC interval`

It is not a general administrative booking API.

## Canonical persistence chain

`Account(actor) -> PatientProfile(subject)`

`DoctorProfile + HealthcareFacility -> DoctorFacilityAffiliation -> AffiliationAvailabilitySchedule -> AvailabilityScheduleRevision`

`Appointment` references that canonical chain.

`DoctorOccupancyInterval` references the Appointment as source.

`AppointmentEvent` and `OutboxEvent` reference the same Appointment.

## Atomicity

The booking transaction is designed so these facts become visible together:

- Appointment exists;
- Doctor occupancy exists;
- APPOINTMENT_CREATED history exists;
- APPOINTMENT_CREATED outbox event exists;
- idempotency key is COMPLETE.

If Doctor occupancy conflicts, none of them survive.

## Why Appointment is inserted before occupancy

The occupancy record uses the Appointment ID as its source ID. Both inserts occur in the same transaction.

If the occupancy exclusion constraint rejects the interval, PostgreSQL rolls back the previously inserted Appointment before the transaction exits.

This preserves referential traceability without creating an orphan.

## Idempotency race behavior

Two requests from the same account using the same idempotency key race on the unique idempotency row.

The second transaction waits for the first conflict/commit resolution.

After a successful first commit:
- same hash -> original Appointment replay;
- changed hash -> IDEMPOTENCY_KEY_REUSE.

Separate idempotency keys racing for the same Doctor interval are resolved independently by the global Doctor occupancy exclusion constraint.

## Scheduling evidence

The Appointment stores the exact `schedule_revision_id` used by the booking transaction.

Technical metadata also records the recurring rule key/timezone evidence used for validation.

This is evidence, not a promise that the schedule revision remains current forever.

Later schedule changes do not silently rewrite historical Appointment references.

## Exception fail-closed behavior

Milestone 05 intentionally did not define exception precedence.

Therefore Milestone 06 does not guess.

If any exception window overlaps the requested booking interval, the initial booking command fails with:

`BOOKING_EXCEPTION_POLICY_UNRESOLVED`

Once DR-008 is approved, the booking policy evaluator can replace this conservative rule without changing Appointment identity or concurrency architecture.

## Lifecycle neutrality

The `appointments` table intentionally does not introduce a final business lifecycle status.

Creation is represented by the append-only technical event `APPOINTMENT_CREATED`.

Future lifecycle commands can use:
- Appointment `version`;
- append-only Appointment events;
- row/version locking;
- global occupancy updates;

after DR-004/005/006/021/022 are approved.

## Outbox boundary

The transaction writes an outbox event, not a provider call.

Future workers may deliver:
- in-app;
- email;
- SMS;
- WhatsApp;

only after the transaction commits and only after notification channel/consent policy is approved.

## Security/resource scope

Appointment read authorization is based on concrete relationships:
- matching PatientProfile;
- matching DoctorProfile;
- matching Facility membership with `appointment.read`;
- explicit internal oversight.

A top-level Facility registration role by itself does not imply Appointment access.
