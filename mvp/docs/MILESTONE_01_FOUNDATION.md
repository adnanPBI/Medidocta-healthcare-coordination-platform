# Milestone 01 - Architecture foundation, environments, identity/session

## Objective
Establish a production-oriented backend foundation that preserves the non-negotiable ONE-platform architecture before business modules are added.

## Included functionality
- Canonical Account and top-level role storage.
- Patient/Doctor/Facility bootstrap records.
- Facility staff membership and permission-bundle foundation.
- Doctor-Facility affiliation foundation.
- OIDC-compatible request authentication.
- Server-derived session context.
- Resource-scope authorization helper.
- Audit event for registration bootstrap.
- Health/readiness routes.

## Acceptance criteria
1. Production process cannot start with the development authentication adapter.
2. An authenticated external subject can bootstrap exactly one initial Patient/Doctor/Facility role.
3. Repeating bootstrap for the same subject does not create a duplicate account or additional role.
4. Session context is derived from canonical PostgreSQL records, never client-provided role claims.
5. Facility-scoped permission checks require both the permission and matching facility membership.
6. Doctor affiliation context is returned from the canonical affiliation table.
7. No separate Patient/Doctor/Facility databases or appointment models are introduced.
8. French/English preference is a property of the same Account record.
9. Health readiness fails when the database cannot be reached.
10. Tests enforce authorization and production authentication guardrails.

## Explicitly not implemented yet
- Final profile fields / Figma screens.
- Verification case lifecycle.
- Facility staff bundle catalog (DR-016).
- Multi-role switching (DR-001/DR-040).
- Contracts/financial terms.
- Availability/slot generation.
- Canonical Appointment and booking transaction.
- Notification provider delivery.

These are sequenced into later milestones or blocked on PRODUCT DECISION REQUIRED items.
