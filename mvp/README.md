# Medidocta MVP implementation track

This directory is the production MVP implementation track. The repository-root static site remains the architecture/workflow demonstrator for the client; production code is built here so implementation can advance without pretending unfinished backend capabilities already exist in the demo.

## Milestone sequence

1. **Foundation, environments, CI/CD, identity/session** - started here.
2. Canonical profiles, taxonomy/search, verification.
3. Facility staff, RBAC and resource scope.
4. Doctor-Facility affiliations and contracts.
5. Facility-specific availability and slot projection.
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
- Conservative permission seed. Facility staff bundles remain configurable and unseeded while DR-016 is unresolved.
- Append-only account bootstrap audit event.
- Pure authorization policy tests and config safety tests.

## Local start

```bash
cd mvp
cp .env.example .env
docker compose up -d postgres
psql "$DATABASE_URL" -f db/migrations/001_identity_session_context.sql
psql "$DATABASE_URL" -f db/migrations/002_foundation_rbac_seed.sql
npm install
npm run dev:api
```

Development identity request example:

```bash
curl -H 'x-dev-sub: demo-patient-1' -H 'x-dev-email: patient@example.test' \
  http://localhost:4000/v1/session/context

curl -X POST -H 'content-type: application/json' \
  -H 'x-dev-sub: demo-patient-1' -H 'x-dev-email: patient@example.test' \
  -d '{"role":"PATIENT","preferredLocale":"fr"}' \
  http://localhost:4000/v1/accounts/bootstrap
```

## Product-decision discipline

The schema may be structurally capable of multiple roles, but the bootstrap endpoint creates exactly one approved initial role. It does not add additional roles to an existing account because DR-001/DR-040 remain **PRODUCT DECISION REQUIRED**. Similarly, facility permission bundles are normalized but no invented role catalog is seeded while DR-016 remains unresolved.
