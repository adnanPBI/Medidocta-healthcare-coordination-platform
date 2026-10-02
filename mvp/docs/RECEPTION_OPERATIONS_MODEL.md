# Reception and consultation operations model

## Principle

Operational workflow is represented as facts around the same canonical Appointment, not as role-specific copies.

`Appointment`
- Patient arrival fact
- Doctor arrival fact
- Consultation facts
- Room assignment thread/revisions
- AppointmentEvent history
- OutboxEvent history

## Why arrivals are separate

Patient and Doctor may arrive at different times and may be recorded by different authorized actors.

The persistence model therefore does not use one combined `ARRIVED` flag.

A Patient arrival fact never implies Doctor arrival, and vice versa.

## Why facts are append-only

Operational history can have audit/compliance value. Updating or deleting the historical fact would destroy who-recorded-what-and-when evidence.

Corrections/reversals, if Medidocta approves them, should append a compensating fact/event rather than mutate the original fact.

## Why consultation facts do not change Appointment state yet

The handover requires start/complete consultation operations but DR-004 still leaves the complete Appointment lifecycle unresolved.

Milestone 07 therefore stores factual start/complete events without assuming:
- a final status enum;
- a required predecessor;
- who may trigger each transition;
- whether a transition is reversible.

## Room allocation

A room assignment is versioned because reception may move an Appointment from one room to another.

The latest revision is the current projection, while older revisions remain immutable history.

The room resource and the Appointment must share the same Facility.

## No room-overlap constraint yet

CT-013 is explicitly policy-dependent.

Therefore the database does not currently prevent:

`Appointment A -> Room 1 -> 09:00-09:30`

and

`Appointment B -> Room 1 -> 09:00-09:30`

This is intentional, not an omission.

The room-allocation read surface carries `roomExclusivityApplied: false` so clients cannot mistake the foundation for approved exclusivity behavior.

## Read model vs write policy

The read model is production-capable now because resource visibility can be enforced safely.

Write mutations remain internal primitives until Medidocta approves who may:
- mark Patient arrival;
- mark Doctor arrival;
- start/complete consultation;
- create/archive rooms;
- assign/reassign rooms.

This keeps Authentication -> Role -> Permission -> Resource Scope -> Interface aligned with the project principle without manufacturing a Facility staff policy.
