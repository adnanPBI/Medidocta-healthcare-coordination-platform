# Milestone 07 - Reception, independent arrival facts, room allocation foundation and consultation operations

## Objective

Add the operational substrate required by Facility reception and consultation workflows without inventing unresolved Appointment lifecycle, arrival authority/reversibility or room-exclusivity rules.

The milestone keeps the core architecture intact:

- one canonical Appointment;
- Patient and Doctor arrival are independent facts attached to that Appointment;
- Facility rooms belong to one Healthcare Facility;
- room assignment is versioned against the same Appointment;
- consultation start/complete are append-only operational facts, not a hidden final lifecycle state machine.

## Independent arrival facts

`appointment_arrival_facts` stores one canonical first-arrival fact for each party kind:

- `PATIENT`
- `DOCTOR`

Each fact records:
- Appointment ID;
- party kind;
- arrival instant;
- recording account;
- semantic key;
- metadata;
- created timestamp.

Patient and Doctor arrival are intentionally independent. Recording one does not imply the other.

The facts are append-only at the database layer. Duplicate attempts for a party replay the already-recorded fact rather than creating a second arrival side effect.

No public mutation endpoint is exposed while DR-021 and DR-022 are unresolved.

If Medidocta later approves reversible arrival behavior, reversal should be represented by a new audited fact/event rather than deleting history.

## Consultation facts

`appointment_consultation_facts` stores append-only facts:

- `CONSULTATION_STARTED`
- `CONSULTATION_COMPLETED`

These facts do **not** define or enforce the complete Appointment lifecycle.

Milestone 07 does not enforce:
- who may start/complete a consultation;
- whether completion requires an arrival;
- whether consultation can restart;
- whether completion changes an Appointment lifecycle state;
- reversal/correction behavior.

Those remain under DR-004 and related product policy.

The internal append primitive is semantic-key idempotent so retries do not create duplicate side effects.

## Facility rooms

`facility_rooms` provides the minimal canonical room resource:
- Facility ID;
- stable room code;
- optional display name;
- ACTIVE/ARCHIVED technical status;
- version;
- opaque metadata.

No product-facing create/edit/archive endpoint is exposed in this milestone.

## Room assignment history

Each Appointment has one `appointment_room_assignment_thread`.

Room assignment changes are appended as immutable revisions:
- revision number;
- Room ID;
- Facility ID;
- recording account;
- assignment interval;
- metadata;
- created timestamp.

The room must belong to the same Healthcare Facility as the Appointment.

Optimistic `expectedVersion` prevents concurrent assignment edits from silently overwriting each other.

## Room exclusivity is deliberately not enforced

The source handover explicitly marks room exclusivity as PRODUCT DECISION REQUIRED.

Therefore Milestone 07 does **not** add a PostgreSQL room-overlap exclusion constraint and does not return `ROOM_CONFLICT`.

Two overlapping Appointments may currently have the same room in the technical foundation.

Read APIs explicitly return:

`roomExclusivityApplied: false`

Once Medidocta approves exclusive-room/capacity policy, a forward migration can add the approved constraint without changing canonical Appointment or room identities.

## AppointmentEvent integration

Successful internal operational commands also append to the existing canonical `appointment_events` history:

- `PATIENT_ARRIVED`
- `DOCTOR_ARRIVED`
- `CONSULTATION_STARTED`
- `CONSULTATION_COMPLETED`
- `ROOM_ASSIGNMENT_RECORDED`

Appointment events remain append-only.

Operational fact history is not used to silently manufacture a final Appointment state machine.

## Transactional outbox

Successful operational facts/room-assignment revisions append matching `outbox_events` in the same transaction.

No external provider is called in the operational command transaction.

This prepares analytics/notifications while preserving the transactional boundary established in Milestone 06.

## Reception read model

Implemented:

`GET /v1/facilities/:facilityId/reception/appointments?from=<ISO>&to=<ISO>`

The endpoint requires `facility.reception.read` for the exact Facility and returns canonical Appointments with:
- Patient profile ID;
- Doctor identity/display name;
- appointment interval/version;
- Patient/Doctor arrival facts;
- consultation facts;
- current room assignment;
- explicit policy flags.

The 31-day request cap is a technical response-size guard, not a product reception horizon.

## Operational read APIs

Implemented:

- `GET /v1/appointments/:appointmentId/operations`
- `GET /v1/facilities/:facilityId/reception/appointments`
- `GET /v1/facilities/:facilityId/rooms`
- `GET /v1/facilities/:facilityId/rooms/allocations`

Appointment operational detail is readable by:
- the Doctor who is party to the Appointment;
- Facility staff with `appointment.operations.read` for that exact Facility;
- explicit Medidocta platform oversight.

Patient access to internal operational detail is not assumed in this milestone.

Facility reception and room reads require their own exact Facility-scoped permissions.

## Internal write primitives

Implemented and tested, but **not exposed over HTTP**:

- `recordArrivalFactForAuthorizedActor(...)`
- `appendConsultationFactForAuthorizedActor(...)`
- `createFacilityRoomForAuthorizedActor(...)`
- `appendRoomAssignmentRevisionForAuthorizedActor(...)`

The caller must establish approved write authority before invoking these primitives.

This prevents engineering from inventing actor permissions while preserving the production-ready persistence/concurrency layer.

## PRODUCT DECISION REQUIRED gates

### DR-004 - Appointment lifecycle
Complete lifecycle states, allowed transitions and actors remain unresolved.

### DR-021 - Patient arrival
Who may mark Patient arrival and whether it is reversible remain unresolved.

### DR-022 - Doctor arrival
Who may mark Doctor arrival, Facility scoping and reversibility remain unresolved.

### Room exclusivity / capacity
The handover marks Facility room exclusivity as PRODUCT DECISION REQUIRED. No exclusive-room constraint is invented.

## Acceptance criteria

1. Patient and Doctor arrival are independent facts on the same canonical Appointment.
2. Duplicate arrival attempts do not create duplicate operational side effects.
3. Arrival facts are append-only.
4. Consultation start/complete are append-only facts, not a final lifecycle state machine.
5. Semantic-key retries of consultation facts are idempotent.
6. Rooms belong to one canonical Healthcare Facility.
7. An Appointment cannot be assigned a room from another Facility.
8. Room assignment history is immutable and versioned.
9. Stale concurrent room assignment edits return a version conflict.
10. Room overlap is not falsely rejected while exclusivity policy is unresolved.
11. Reception reads are exact to Facility resource scope.
12. Patient accounts do not automatically receive internal operational details.
13. No operational mutation HTTP route is exposed before write-authority policy approval.
14. Operational events/outbox entries are created transactionally with successful internal facts.
