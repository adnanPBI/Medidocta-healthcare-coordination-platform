# Milestone 02 - Canonical Doctor/Facility profiles and taxonomy foundation

## Objective
Add the smallest production-safe profile and taxonomy contract that can be implemented without inventing unresolved Figma fields, verification rules, location/search policy, or facility ownership policy.

## Implemented

### Canonical Doctor profile
- Own-profile read and update APIs.
- Minimal fields: display name, public bio, specialties and languages.
- Optimistic `profile_version` concurrency guard.
- Specialty and language join tables rather than duplicated text fields.
- One primary specialty at most.
- Audit event on successful update.

### Canonical Healthcare Facility profile
- Permission-aware profile read API.
- Minimal fields: display name, public summary and city taxonomy reference.
- Optimistic `profile_version` concurrency guard.
- Update API exists but requires `facility.profile.update`; that permission is intentionally not granted to the registration role while DR-002/DR-016 remain unresolved.
- Registration-account relationship is used for read scoping only and is not treated as a silently invented permanent owner/admin policy.
- Audit event on successful update.

### Taxonomies
- Stable machine codes plus localized FR/EN labels.
- Language, specialty and city catalogs.
- Public read APIs for active taxonomy terms.
- Only `fr` and `en` are seeded because those are explicitly required platform locales.
- Specialty and city catalogs remain empty until Medidocta approves the canonical list/source.

### Session context
- Adds registered Facility references to the authenticated account context.
- Does not grant Facility ownership/admin permissions by itself.

## API surface

- `GET /v1/taxonomies/languages?locale=fr|en`
- `GET /v1/taxonomies/specialties?locale=fr|en`
- `GET /v1/taxonomies/cities?locale=fr|en&country=CM`
- `GET /v1/doctors/me/profile`
- `PATCH /v1/doctors/me/profile`
- `GET /v1/facilities/:facilityId/profile`
- `PATCH /v1/facilities/:facilityId/profile`

Profile PATCH commands require the current `version`. A stale write returns `PROFILE_VERSION_CONFLICT`.

## Acceptance criteria
1. Doctor profile data is canonical and keyed by one DoctorProfile ID.
2. A Doctor can update only the profile linked to the authenticated account.
3. Specialty/language values must exist and be ACTIVE taxonomy terms.
4. Unknown Figma-dependent fields are rejected rather than silently persisted.
5. Stale profile writes return 409 and do not overwrite newer data.
6. Facility reads require both permission and matching registration/membership/internal scope.
7. Facility writes require explicit `facility.profile.update` in matching scope.
8. Registration does not silently create a permanent Facility admin role.
9. Taxonomy labels localize while taxonomy codes remain canonical.
10. Specialty/city values are not invented by engineering.
11. Integration tests exercise real PostgreSQL migrations and API boundaries.

## Deliberately deferred
- Complete Doctor/Facility Figma field set.
- Public Doctor/Facility search results and discoverability/publishing policy.
- Verification case/evidence lifecycle (DR-019).
- Canonical city/location source and distance/map behavior (DR-032).
- Facility owner/admin bootstrap policy (DR-002).
- Facility staff role catalog/custom bundles (DR-016).
- Appointment-sensitive field visibility (DR-047).

These remain PRODUCT DECISION REQUIRED / FIGMA VALIDATION REQUIRED.
