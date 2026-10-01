# Medidocta - Pre-Development Technical Review, Architecture & MVP Estimation

**Release baseline:** v1.1  
**Purpose:** implementation-ready technical review. This is not MVP coding.

## 0. Governing architecture principle

Medidocta is one platform. Patient, Doctor and Healthcare Facility are roles/account contexts within that platform:

**Authentication -> Role -> Permission -> Resource Scope -> Appropriate Interface**

The same account and canonical server-side data must be available on smartphone, tablet and browser. There is one canonical Appointment record. Doctor-Facility affiliation is first-class because contract, financial terms, working days and availability are facility-specific.

### Architecture invariants
1. No separate Patient/Doctor/Facility application databases.
2. No separate role-specific appointment copies.
3. Returning authentication resolves server-side role/permission context.
4. Device type never creates a separate account or business-data source.
5. Appointment writes go through one canonical backend capability.
6. Doctor occupancy is global across facilities.
7. Facility staff permissions are facility/resource-scoped.
8. Frontend availability is a projection, never booking authority.
9. FR/EN changes labels/templates, never canonical business records.
10. Medidocta Administration uses privileged policies over the same domain records.
11. Patient-arrived and Doctor-arrived are independent facts/events.
12. Notification delivery follows commit through an outbox/worker boundary.

---

# 1. Executive technical review

## Readiness assessment
The business concept and core role boundaries are sufficiently mature to define a coherent technical architecture, domain model, authorization model and development plan. The principal pre-development risks are not basic feasibility; they are ambiguity in detailed business rules, incomplete Figma validation, concurrency semantics, facility-staff scope, appointment lifecycle ownership, and exact verification/contract/notification rules.

## Highest-priority blockers before production implementation
- Complete screen-by-screen Figma traceability.
- Approve final appointment lifecycle and actor permissions.
- Approve booking-for-another-person actor/subject/consent rules.
- Approve availability ownership, exceptions and precedence.
- Approve facility staff role catalog and finance boundaries.
- Approve contract proposal/counter/effective-term states.
- Approve notification channels/consent and verification evidence rules.
- Confirm booking capacity, duration, buffer and timezone policy.

## Recommended next step
Resolve Blocker/High decision items against the complete Figma, then freeze the domain/API contracts for the first implementation milestone.

---

# 2. Figma gap & cleanup report

The complete Figma source was not supplied with the review package. No screen-level finding is represented as observed fact. The repository therefore carries a structured validation register with provisional direction and severity.

### Blocker
- One-platform application shell and post-login role resolution.
- Canonical appointment identity across role views.
- Booking conflict/stale availability/retry UX.
- Protected-action permission/error states.

### High
- Doctor multi-facility context.
- Facility staff resource-scope/financial boundaries.
- Contract proposal/counter/version flows.
- Facility-specific availability editor.
- Cancellation/rescheduling.
- Booking for another person.
- Doctor/Facility verification.
- Arrival and consultation workflow.

### Medium/Low
- Responsive dense calendars.
- FR/EN expansion/wrapping.
- Loading/empty/error states.
- Duplicate/obsolete frames after owner confirmation.

See `Figma_Gap_Register.csv`.

---

# 3. Product / module map

## Shared platform foundation
- Identity & Session
- Session Context
- Profiles
- Taxonomies / Search
- Files
- Notifications
- Audit / Support

## Patient
- Registration/profile
- Doctor/Facility/specialty search
- Availability browse
- Booking
- Upcoming/detail/history
- Notifications/settings/support

## Doctor
- Professional profile and verification
- Facility discovery
- Doctor-Facility affiliations
- Contracts/proposals/counter-proposals
- Working days
- Facility-specific availability
- Appointments
- Arrival/consultation workflows
- Notifications/settings/support

## Healthcare Facility
- Registration/profile/verification
- Doctor search and affiliations
- Contracts/proposals
- Doctor availability
- Appointment calendar/management
- Reception operations
- Patient/Doctor arrival
- Rooms and room assignment
- Staff/RBAC
- Operational dashboards
- Financial information for authorized staff only

## Medidocta Administration
- Patient/Doctor/Facility management
- Verification
- Affiliations/contracts/appointments
- Operational oversight/support
- Audit history
- Permissions/settings
- Founding Partner management where applicable

---

# 4. Recommended technical architecture

## Frontend
One responsive web application codebase. Role-specific interfaces are route/layout projections of server-derived authorization context.

## Backend
Modular service-oriented backend (modular monolith is appropriate for MVP) with clear domain ownership:
- Identity/Session
- Profiles/Search
- Verification
- Facility Staff
- Affiliations
- Contracting
- Scheduling
- Booking/Appointments
- Rooms/Operations
- Notifications
- Files
- Audit/Admin

## Database
PostgreSQL as canonical transactional store. Use foreign keys, unique constraints, range/exclusion constraints where appropriate, version columns, and transaction boundaries around booking/state changes.

## Background work
Transactional outbox written inside the same transaction as the domain change. Workers deliver notifications, projection/index updates and non-authoritative side effects.

## File storage
Private object storage with opaque IDs and short-lived signed access, never unrestricted public medical/verification evidence URLs.

## Infrastructure
Separate development/staging/production environments; CI/CD, migrations, secrets management, structured logs, metrics, alerting and backup/restore drills.

---

# 5. Data model / ERD

Minimum canonical entities:
- Account
- AccountRole
- PatientProfile
- DoctorProfile
- HealthcareFacility
- FacilityStaffMembership
- RoleDefinition / Permission
- DoctorFacilityAffiliation
- Contract
- FinancialTerms
- AvailabilityRule
- AvailabilityException
- SlotProjection / SlotInstance if materialized
- Appointment
- AppointmentEvent
- Room
- VerificationCase / VerificationEvidence
- Notification
- OutboxEvent
- FileObject
- AuditEvent
- BookingIdempotency
- FoundingPartnerStatus where applicable

Key rule: facility-specific Doctor data belongs to `DoctorFacilityAffiliation` or its owned children, not to the global Doctor profile.

---

# 6. RBAC & resource-scope model

Authorization is not just a role name.

**Effective access = Role/Bundle + Permission + Resource Scope + State/Relationship Policy**

Examples:
- Patient may read own appointment, not arbitrary appointments.
- Doctor may manage availability only for own approved affiliation.
- Reception may operate appointments for its facility but not automatically view finance.
- Facility finance may view/respond to financial terms only for its facility.
- Internal verification staff require explicit verification permission/scope.
- Medidocta Admin actions remain permissioned and audited.

See `RBAC_Matrix.csv`.

---

# 7. Booking & availability architecture

## Availability model
Recurring rules and exceptions are affiliation-scoped. A slot shown to the client is a projection only.

## Authoritative booking transaction
1. Authenticate and resolve actor context.
2. Authorize command and resource scope.
3. Validate Doctor-Facility affiliation and booking subject.
4. Revalidate availability/rules.
5. Apply idempotency control.
6. Enforce global Doctor overlap across all facilities.
7. Enforce any approved facility/capacity/room constraints.
8. Insert/update canonical Appointment and AppointmentEvent.
9. Insert outbox event.
10. Commit.
11. Only then deliver notifications asynchronously.

## Concurrency
The backend/database must prevent:
- two patients taking the same unavailable capacity;
- the same Doctor being booked for overlapping times;
- the same Doctor being booked simultaneously in different facilities.

Recommended PostgreSQL shape: time range + exclusion/locking strategy keyed globally to Doctor, with transactionally consistent capacity/idempotency checks.

## Rescheduling
Uses the same overlap/availability guards as initial booking. If reschedule fails, the original appointment remains valid.

## Cancellation
Guarded by appointment state/version and approved actor/policy. Occupancy is released only on committed cancellation.

See `Concurrency_Test_Matrix.csv`.

---

# 8. API / backend capability map

The repository includes `API_Capability_Map.csv`. The capability map is intentionally not a coded API contract; it defines owning modules, canonical resources, authorization scope, consistency requirements and unresolved decisions.

Core endpoints/capabilities expected:
- Identity/session/context
- Profiles/search/taxonomy
- Verification
- Facility staff
- Affiliations
- Contracts/terms
- Availability
- Booking
- Appointments/lifecycle
- Rooms/operations
- Notifications
- Files
- Audit/admin

---

# 9. Responsive architecture

One application, one account, one API and one set of canonical records.

- Phone: stacked flows, drawers/action sheets, agenda-first calendars.
- Tablet: hybrid split views.
- Desktop/browser: persistent filters, dense calendars/tables and side panels.

Concurrency-sensitive writes remain online/server-authoritative. If a PWA/offline shell is later approved, offline state must never represent booking success before server commit.

See `Responsive_Matrix.csv`.

---

# 10. FR/EN localization architecture

- Stable canonical IDs/status codes.
- Translation catalogs for UI strings.
- Stable backend machine error codes.
- Locale-aware rendering of date/time/number/currency.
- UTC appointment instants plus facility IANA timezone for recurrence/display policy.
- Notification template key + locale + version.
- Canonical taxonomies with localized labels.
- No duplicate Patient/Doctor/Facility/Appointment records by language.

See `Localization_Matrix.csv`.

---

# 11. Security & operations review

## Authentication/session
- Modern identity provider or equivalent secure implementation.
- Secure refresh/session rotation.
- Session/device revocation.
- Rate limiting and credential-stuffing defense.
- Optional MFA subject to product decision.

## Authorization
- Server-side policy checks on every protected operation.
- Never trust client role/facility claims.
- Object/resource-level authorization.

## Sensitive data
- Minimize healthcare-related data in MVP.
- Encrypt in transit and at rest.
- Private files/evidence.
- No secrets or sensitive payloads in logs.
- Data retention/deletion policy requires founder/legal input.

## Auditability
Audit privileged actions, verification decisions, permission changes, financial-term changes and appointment lifecycle changes.

## Operations
- Isolated environments.
- Automated deploy/migrations.
- Secrets manager.
- Monitoring/alerting.
- Backup/restore testing.
- Error correlation IDs.
- Security incident and access-review procedures.

Jurisdiction-specific privacy/compliance obligations require legal review for Cameroon and expansion countries; this technical package does not invent legal requirements.

---

# 12. Decision register

Every unresolved business rule is explicit and marked **PRODUCT DECISION REQUIRED**. See `Decision_Register.csv`.

---

# 13. Full MVP development estimate

Current planning baseline:

| Measure | Estimate |
|---|---:|
| Base engineering | 3,440 hours |
| Base estimated cost | CAD 262,725 |
| Planning reserve | 15% |
| Reserved engineering envelope | 3,956 hours |
| Reserved estimated cost | CAD 302,133.75 |
| Planned implementation | 26 weeks |
| Schedule reserve | +2 weeks |

## Recommended implementation sequence
1. Architecture foundation, environments, CI/CD, identity/session.
2. Canonical profiles, taxonomy/search, verification.
3. Facility staff, RBAC/resource scope.
4. Affiliations and contracts.
5. Scheduling/availability.
6. Transactional booking and canonical appointment.
7. Reception/arrival/rooms/consultation operations.
8. Notifications/files/audit/admin.
9. Responsive and FR/EN hardening.
10. Security/performance/accessibility/acceptance hardening and production-readiness.

Each implementation milestone must include objective, included functionality, deliverables, dependencies, engineering hours, calendar duration, team, CAD cost, acceptance criteria, assumptions and risks.

---

# 14. Demo interpretation

The repository's deployed demo is a technical demonstrator. It shows:
- one application shell;
- role-specific perspectives;
- one canonical appointment ID;
- multi-facility Doctor affiliation;
- backend-authoritative conflict scenarios;
- RBAC/resource scope;
- FR/EN presentation;
- review registers and estimate summary.

It does **not** represent real production authentication, PHI storage, transactional PostgreSQL implementation, provider notifications, monitoring, backups or compliance certification as already built.
