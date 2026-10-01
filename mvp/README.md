# Medidocta MVP implementation track

This directory is the production MVP implementation track. The repository-root static site remains the architecture/workflow demonstrator for the client; production code is built here so implementation can advance without pretending unfinished backend capabilities already exist in the demo.

## Milestone sequence

1. **Foundation, environments, CI/CD, identity/session** - implemented.
2. **Canonical Doctor/Facility profiles and taxonomy foundation** - implemented to the currently approved boundary; verification/search publishing remains gated.
3. **Facility staff, RBAC and resource scope** - security substrate and read APIs implemented; product mutation flows remain decision-gated.
4. **Doctor-Facility affiliations and contract/versioned financial-term foundation** - canonical read model and append-only proposal substrate implemented; lifecycle/authority/effective-term mutations remain decision-gated.
5. **Facility-specific availability and slot projection** - versioned schedule history, explicit IANA timezone handling, candidate slot projection and global Doctor occupancy foundation implemented; scheduling policy mutations remain decision-gated.
6. Transactional booking and canonical Appointment.
7. Reception, arrival, rooms and consultation operations.
8. Notifications, files, audit and administration.
9. Responsive + FR/EN hardening.
10. Security/performance/accessibility/acceptance and production readiness.

## Milestone 1 implemented

- Fastify API skeleton with security headers and restricted CORS.
- OIDC/JWKS authentication adapter plus development-only identity mode.
- Production guard that refuses `AUTH_MODE=dev`.
- PostgreSQL pool and readiness/liveness endpoints.
- Idempotent account bootstrap for approved initial roles: Patient, Doctor, Facility.
- `GET /v1/session/context` resolving roles, permissions, facility memberships and Doctor affiliations server-side.
- Normalized identity/RBAC/facility-membership/affiliation foundation schema.
- Conservative permission seed.
- Append-only account bootstrap audit event.

## Milestone 2 implemented

- Canonical Doctor profile with optimistic versioning.
- Canonical Healthcare Facility profile with optimistic versioning.
- Normalized specialty, city and language taxonomies using stable codes + localized FR/EN labels.
- Doctor specialty and language relationships.
- Public taxonomy read APIs.
- Permission-aware Doctor self profile APIs.
- Permission-aware Facility profile APIs.
- Registered-Facility references in server-derived session context.
- Facility update stays blocked unless explicit `facility.profile.update` is granted in resource scope.
- Specialty and city catalogs are intentionally not invented or seeded.
- Verification lifecycle and public search/discoverability remain gated by product decisions/Figma validation.
- PostgreSQL-backed API integration test in CI.
- Checksum-protected migration runner.

## Milestone 3 implemented

- Facility-delegatable permission boundary enforced in PostgreSQL.
- Exact Facility bundle/membership resource scope.
- Cross-Facility bundle assignment blocked by composite foreign key.
- ACTIVE membership requires a bundle.
- Archived bundles immediately lose authorization power.
- Facility staff/bundle read APIs require exact scoped permissions.
- Self-scope API exposes the authenticated account's effective Facility permissions.
- Platform-only privileges cannot be inserted into Facility bundles.
- Suspended/closed accounts are rejected by protected MVP routes.
- No default receptionist/scheduling/finance/admin bundle catalog has been invented.
- No staff invitation/assignment/bundle mutation workflow has been exposed while DR-002/DR-016 remain unresolved.

See `docs/MILESTONE_03_FACILITY_RBAC.md` and `docs/RBAC_SECURITY_MODEL.md`.

## Milestone 4 implemented

- Canonical Doctor-to-Healthcare-Facility affiliation read model.
- Multi-Facility Doctor affiliations remain tied to one global Doctor profile.
- Exactly one contract thread per affiliation, including automatic creation for future affiliations.
- Immutable, monotonically versioned contract proposal revisions.
- Structurally validated but semantically uninterpreted proposal and financial-term JSON.
- Optional proposed effective dates stored as proposal metadata only.
- Doctor-party and exact Facility-scoped contract/affiliation read authorization.
- Transactionally locked proposal revision sequencing plus audit events.
- No product-facing affiliation/contract mutation routes while DR-013/DR-014/DR-015/DR-042 remain unresolved.

See `docs/MILESTONE_04_AFFILIATIONS_CONTRACTS.md` and `docs/CONTRACT_VERSIONING_MODEL.md`.

## Milestone 5 implemented

- One canonical availability schedule thread per Doctor-Facility affiliation.
- Immutable versioned schedule revisions with optimistic `expectedVersion` conflict protection.
- Explicit IANA timezone per schedule revision; no hard-coded Cameroon/future-market default.
- Recurring weekly rules stored as local wall-clock intervals.
- Exception windows preserved as absolute instants without inventing precedence.
- Permission-aware availability read and projection APIs.
- Explicit `slotMinutes` query input; no product granularity default.
- 31-day technical projection-query cap, explicitly not a booking horizon.
- Candidate slots never claim `bookable=true`.
- Global Doctor occupancy table with PostgreSQL exclusion constraint across all facilities.
- Stable `DOCTOR_OCCUPANCY_CONFLICT` translation for future booking integration.
- No schedule mutation HTTP route while DR-007/008/010/012/043/044/045/046 remain unresolved.

See `docs/MILESTONE_05_AVAILABILITY_PROJECTION.md` and `docs/AVAILABILITY_PROJECTION_MODEL.md`.

## Local start

```bash
cd mvp
cp .env.example .env
docker compose up -d postgres
npm install
npm run migrate
npm run dev:api
```

## Product-decision discipline

The schema may be structurally capable of multiple roles, but the bootstrap endpoint creates exactly one approved initial role. It does not add additional roles to an existing account because DR-001/DR-040 remain **PRODUCT DECISION REQUIRED**.

Facility permission bundles are normalized but no invented role catalog is seeded while DR-016 remains unresolved. The Facility registration relationship does not silently establish permanent owner/admin or commercial authority.

Milestone 2 intentionally rejects unknown profile fields rather than turning unsupplied Figma details into an accidental API contract.

Milestone 4 deliberately separates technical contract history from business contract lifecycle. Proposal/counter/accept/reject/expire/suspend semantics, commercial authority, effective-term rules and affiliation initiation/state transitions remain behind DR-013/DR-014/DR-015/DR-042.

Milestone 5 deliberately separates candidate slot projection from booking authority. Exception precedence, working-day enforcement, timezone policy, booking horizon, duration/granularity, buffers and behavior around existing appointments remain behind DR-007/DR-008/DR-010/DR-012/DR-043/DR-044/DR-045/DR-046.
