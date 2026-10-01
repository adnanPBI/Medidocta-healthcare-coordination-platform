# Milestone 05 - Facility-specific availability + slot projection foundation

## Objective

Implement the scheduling substrate required by the Medidocta architecture without silently deciding unresolved scheduling policy.

The fixed architectural facts are:

- availability is scoped to the Doctor-Facility affiliation;
- the same Doctor may have different schedules at different facilities;
- displayed availability is a read projection, not booking authority;
- global Doctor occupancy spans all facilities;
- final booking must revalidate in the backend/database transaction.

## Canonical model

`DoctorFacilityAffiliation 1 -> 1 AffiliationAvailabilitySchedule 1 -> N AvailabilityScheduleRevision`

Each revision contains:

- an explicit IANA timezone;
- zero or more recurring weekly rules;
- zero or more exception windows;
- immutable metadata/audit history.

Recurring rules use ISO weekday numbers and local wall-clock start/end times. Exception windows are stored as absolute instants.

## Versioned schedule writes

The internal append primitive requires `expectedVersion`.

A write:

1. validates the proposed revision;
2. locks the canonical affiliation schedule;
3. compares `expectedVersion` to the current schedule version;
4. returns `AVAILABILITY_VERSION_CONFLICT` if stale;
5. appends an immutable revision;
6. appends immutable recurring rules/exceptions;
7. advances the canonical schedule version;
8. writes an audit event;
9. commits.

No availability mutation HTTP endpoint is exposed because DR-007 and related scheduling policy decisions are unresolved.

## Timezone handling

Every stored schedule revision requires an explicit valid IANA timezone such as `Africa/Douala`.

Engineering does **not** default Cameroon or any future market to a timezone in code. Which timezone is authoritative for a Facility/affiliation remains DR-012.

The projection engine uses the timezone saved on the selected schedule revision to convert recurring local wall-clock windows into UTC candidate intervals.

## Candidate slot projection

Read endpoint:

`GET /v1/affiliations/:affiliationId/availability/projection?from=<ISO>&to=<ISO>&slotMinutes=<N>`

The caller must supply:

- an offset-aware `from`;
- an offset-aware `to`;
- explicit `slotMinutes`.

There is intentionally no product default for slot duration.

The API enforces a **31-day technical query-size cap** to bound CPU/response size. This is not the Medidocta booking horizon and must not be presented as one.

The projection returns:

- recurring-rule-derived candidate slots;
- global Doctor occupancy conflicts;
- overlapping exception records;
- explicit policy-completeness flags.

Every candidate has `bookable: null`. The projection never claims a slot is bookable.

## Exception policy

Exception records are preserved and returned but are **not applied to candidate slots** in this milestone.

That is deliberate because DR-008 has not defined:

- closure vs leave vs holiday semantics;
- whether an exception opens or blocks time;
- precedence between rules and exceptions;
- precedence between multiple exceptions.

The API therefore reports:

`exceptionPrecedenceApplied: false`

and `policyCompleteness: PRODUCT_RULES_PENDING`.

## Global Doctor occupancy

`doctor_occupancy_intervals` is Doctor-scoped, not Facility-scoped.

A PostgreSQL GiST exclusion constraint prevents two occupancy intervals for the same Doctor from overlapping even if their source records belong to different facilities.

This implements the architecture requirement that the same Doctor cannot be committed to overlapping work in multiple places.

The occupancy helper translates the database exclusion violation into:

`409 DOCTOR_OCCUPANCY_CONFLICT`

The table is foundational only. Milestone 06 will decide how canonical appointments acquire/release occupancy inside the booking transaction.

## Read authorization

A schedule/projection may be read by:

- the Doctor who is party to the affiliation;
- Facility staff holding `availability.read` for that exact Facility;
- explicitly privileged Medidocta internal oversight.

There is no cross-Facility permission leakage.

## HTTP API

Implemented:

- `GET /v1/affiliations/:affiliationId/availability`
- `GET /v1/affiliations/:affiliationId/availability/projection`

Not implemented:

- create/update schedule HTTP endpoint;
- public/patient slot publishing endpoint;
- booking endpoint;
- exception-policy mutation endpoint.

## PRODUCT DECISION REQUIRED gates

### DR-007 - Availability ownership
Who may edit affiliation availability and how Doctor vs Facility changes interact.

### DR-008 - Availability exceptions
Exception categories, opening/blocking meaning and precedence.

### DR-010 - Working days
Whether contract working days are advisory or hard scheduling constraints.

### DR-012 - Timezone
Authoritative timezone policy for Cameroon and future countries.

### DR-043 - Booking horizon
How far in advance users may book.

### DR-044 - Availability granularity
Whether duration is fixed, specialty-specific, contract-specific or configurable.

### DR-045 - Breaks/buffers
Whether pre/post buffers occupy Doctor time and how they are calculated.

### DR-046 - Existing appointments
What happens when availability changes around already committed appointments.

## Acceptance criteria

1. One affiliation has one canonical schedule thread.
2. Schedule history is immutable and versioned.
3. Stale concurrent schedule edits cannot silently overwrite each other.
4. A schedule revision requires an explicit valid IANA timezone.
5. Recurring rules remain affiliation-specific.
6. Exceptions are preserved without inventing precedence.
7. Projection requires explicit slot duration and does not invent a product default.
8. Projection does not claim candidate slots are bookable.
9. Global Doctor occupancy conflicts across facilities are rejected by PostgreSQL.
10. Facility A availability permissions do not expose Facility B.
11. No public schedule mutation is exposed while ownership policy is unresolved.
12. Final booking authority remains reserved for the Milestone 06 transaction.
