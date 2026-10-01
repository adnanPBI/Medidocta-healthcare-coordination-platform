# Demonstrator architecture

The web demo is intentionally thin. Its job is to make the pre-development review inspectable by a client without turning the review assignment into unapproved MVP coding.

## Presentation layer

A single responsive web application shell renders role-specific views from one canonical demo dataset. The same feature surfaces adapt for mobile, tablet and desktop.

## Domain concepts represented

- Account / session context
- Patient profile
- Doctor profile
- Healthcare Facility
- Facility staff membership and resource scope
- Doctor-Facility affiliation
- Contract / financial context
- Availability projection
- Appointment
- Appointment events / arrival facts
- Idempotent booking behavior
- Notification/outbox boundary

## Production target illustrated by the demo

The handover recommends a server-authoritative backend and PostgreSQL canonical store. Booking/rescheduling must revalidate permissions, affiliation, availability and conflicts in a transaction. Doctor occupancy is global across facilities. A committed Appointment is the source of truth; frontend availability is a projection only.

## Localization

The demo switches between English and French labels while keeping the same record IDs and domain model. Production should use versioned translation catalogs, stable backend codes and locale-aware formatting.

## Security boundary

The demo contains no real PHI and no production authorization. Production authorization must enforce role -> permission -> resource scope on the server for every protected operation.
