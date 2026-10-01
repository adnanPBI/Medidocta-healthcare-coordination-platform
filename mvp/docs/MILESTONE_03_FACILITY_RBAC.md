# Milestone 03 - Facility Staff + RBAC/resource scope

## Objective
Implement the security-critical Facility-scoped authorization substrate without inventing Medidocta's final receptionist/scheduling/finance/admin role catalog or self-service staff-management workflow.

## Implemented

### Facility-delegatable permission boundary
Every permission now has a delegation scope:
- `PLATFORM_ONLY`
- `FACILITY_BUNDLE`

Only explicitly Facility-delegatable permissions may be attached to a Facility permission bundle. PostgreSQL enforces this through a trigger, so an application bug cannot place `admin.oversight`, `verification.manage`, or another platform-only permission into Facility staff access.

### Resource-scope integrity
A staff membership's bundle must belong to the **same Healthcare Facility**. A composite foreign key prevents cross-Facility bundle assignment at the database layer.

An ACTIVE staff membership must have a bundle. Archived bundles immediately stop contributing permissions to authenticated session context.

### Server-derived effective access
Session context now resolves:
- membership ID;
- exact Facility ID;
- bundle ID/code/name/status/version;
- membership version;
- only ACTIVE bundle permissions.

Authorization never accepts a Facility ID or permission set asserted by the client.

### Read APIs
- `GET /v1/facilities/:facilityId/rbac/delegatable-permissions`
- `GET /v1/facilities/:facilityId/rbac/me`
- `GET /v1/facilities/:facilityId/staff`
- `GET /v1/facilities/:facilityId/permission-bundles`

Staff and bundle lists require exact Facility-scoped permissions. A permission held for Facility A does not authorize Facility B.

### Account lifecycle hardening
Registered protected routes now reject `SUSPENDED` and `CLOSED` accounts with `ACCOUNT_INACTIVE`.

## Permission capabilities introduced
- `facility.staff.read`
- `facility.bundle.read`
- `facility.bundle.manage`

The existing `facility.staff.manage` capability remains defined. No default Facility role receives these capabilities automatically.

## Acceptance criteria
1. A Facility bundle cannot contain platform-only privileges.
2. A membership cannot reference another Facility's bundle.
3. An ACTIVE membership has an explicit bundle.
4. Only ACTIVE bundle permissions appear in session context.
5. An archived bundle immediately loses authorization power.
6. Facility A permissions cannot access Facility B staff/bundles.
7. Facility registration alone does not imply staff-management authority.
8. Medidocta platform oversight remains a separate explicit internal capability.
9. Suspended/closed accounts cannot call protected Facility APIs.
10. All permission decisions are derived server-side from canonical PostgreSQL relationships.

## Deliberately gated

### DR-002 - Facility ownership/bootstrap
The registration account is **not** silently promoted to permanent owner/admin. It may identify the registered Facility but does not receive Facility staff-management permissions from this milestone.

### DR-016 - Facility staff role catalog/custom bundles
No receptionist/scheduling/finance/admin bundle catalog is seeded. No product-facing create/edit/assign/invite staff mutation API is enabled until Medidocta approves:
- default role/bundle names;
- exact permissions per bundle;
- whether custom bundles are allowed;
- who may create/edit/assign them;
- invitation and activation lifecycle.

### DR-047 - sensitive field visibility
RBAC infrastructure is ready for field/resource policies, but appointment-sensitive field visibility is not invented here.

## Test coverage
PostgreSQL integration tests verify:
- exact Facility scope;
- registration account has no implicit staff-admin power;
- delegatable permission catalog excludes platform privileges;
- DB trigger rejects `admin.oversight` in a Facility bundle;
- DB composite FK rejects cross-Facility bundle assignment;
- archived bundle permissions disappear;
- inactive accounts are denied.
