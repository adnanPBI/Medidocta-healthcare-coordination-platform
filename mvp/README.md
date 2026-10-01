# Medidocta MVP implementation track

This directory is the production MVP implementation track. The repository-root static site remains the architecture/workflow demonstrator for the client; production code is built here so implementation can advance without pretending unfinished backend capabilities already exist in the demo.

## Milestone sequence

1. **Foundation, environments, CI/CD, identity/session** - implemented.
2. **Canonical Doctor/Facility profiles and taxonomy foundation** - implemented to the currently approved boundary; verification/search publishing remains gated.
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

## Local start

```bash
cd mvp
cp .env.example .env
docker compose up -d postgres
npm install
npm run migrate
npm run dev:api
```

Development identity request example:

```bash
curl -H 'x-dev-sub: demo-doctor-1' -H 'x-dev-email: doctor@example.test' \
  http://localhost:4000/v1/session/context

curl -X POST -H 'content-type: application/json' \
  -H 'x-dev-sub: demo-doctor-1' -H 'x-dev-email: doctor@example.test' \
  -d '{"role":"DOCTOR","preferredLocale":"fr"}' \
  http://localhost:4000/v1/accounts/bootstrap

curl -H 'x-dev-sub: demo-doctor-1' \
  http://localhost:4000/v1/doctors/me/profile

curl -X PATCH -H 'content-type: application/json' \
  -H 'x-dev-sub: demo-doctor-1' \
  -d '{"version":1,"displayName":"Dr Exemple","languageCodes":["fr","en"]}' \
  http://localhost:4000/v1/doctors/me/profile
```

## Product-decision discipline

The schema may be structurally capable of multiple roles, but the bootstrap endpoint creates exactly one approved initial role. It does not add additional roles to an existing account because DR-001/DR-040 remain **PRODUCT DECISION REQUIRED**.

Facility permission bundles are normalized but no invented role catalog is seeded while DR-016 remains unresolved. The Facility registration relationship permits scoped reading only when the role carries `facility.profile.read`; it does not silently establish permanent owner/admin authority.

Milestone 2 intentionally rejects unknown profile fields rather than turning unsupplied Figma details into an accidental API contract. See `docs/MILESTONE_02_PROFILES_TAXONOMY.md`.
