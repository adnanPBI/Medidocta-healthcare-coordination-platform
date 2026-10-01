# Availability projection model

## Separation of concerns

Medidocta scheduling is separated into four layers:

1. **Canonical schedule history** - versioned affiliation-specific recurring rules and exception data.
2. **Candidate projection** - derived time intervals suitable for UI display and later policy filtering.
3. **Global Doctor occupancy** - authoritative database-level overlap protection across facilities.
4. **Booking transaction** - future Milestone 06 authority that revalidates all policy and persists the canonical Appointment.

A frontend slot is never a reservation.

## Recurring rule representation

A rule stores:

- `iso_weekday` (1 = Monday, 7 = Sunday);
- `local_start`;
- `local_end`;
- stable `rule_key`;
- opaque metadata.

Rules are interpreted in the IANA timezone of their schedule revision.

Overnight rules are not accepted by this foundation. If Medidocta needs them, they can be represented as two same-day rules or enabled later after product confirmation.

## Exceptions

Exceptions store:

- absolute `starts_at`;
- absolute `ends_at`;
- stable `exception_key`;
- optional free-form `kind_code`;
- opaque metadata.

No exception kind has code-defined business semantics in Milestone 05.

## Projection contract

Projection parameters are explicit inputs, not hidden product rules:

- `from`
- `to`
- `slotMinutes`

The engine finds recurring rules for each local date, creates fixed-size candidate intervals, converts them to UTC and marks intersections with global Doctor occupancy.

It also returns overlapping exception windows separately.

A client must not infer `bookable=true` from `projectionStatus=CANDIDATE`.

## Occupancy contract

Global occupancy uses half-open intervals `[start, end)`.

Therefore:

- 09:00-09:30 and 09:30-10:00 do not overlap;
- 09:00-09:30 and 09:29-10:00 do overlap.

The same Doctor is protected globally regardless of Facility ID.

The source columns are intentionally generic so Milestone 06 can attach canonical Appointment occupancy without redesigning the overlap constraint.

## Future Milestone 06 integration

The booking transaction should:

1. authorize the actor/subject;
2. load the selected affiliation;
3. revalidate the current schedule revision;
4. apply approved exception/working-day/horizon/duration/buffer policy;
5. attempt the global Doctor occupancy insert in the same transaction as the Appointment;
6. persist one canonical Appointment;
7. persist an outbox event;
8. commit;
9. deliver notifications asynchronously.

Any conflict before commit must leave no canonical Appointment and no occupancy residue.
