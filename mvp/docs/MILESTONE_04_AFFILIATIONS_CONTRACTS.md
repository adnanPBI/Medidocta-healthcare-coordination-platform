# Milestone 04 - Doctor-Facility affiliation + contract/financial-term foundation

## Objective

Establish the canonical Doctor ↔ Healthcare Facility relationship and an append-only, versioned contract proposal substrate without turning unresolved commercial workflow questions into accidental product rules.

The governing invariant remains:

**one Doctor profile + many Facility-specific affiliations + one canonical affiliation record per Doctor/Facility pair + one contract thread per affiliation.**

## Implemented

### Canonical affiliation identity

The existing `doctor_facility_affiliations` record remains the canonical relationship between one Doctor and one Healthcare Facility.

The MVP now exposes permission-aware read surfaces for:
- the authenticated Doctor's affiliations;
- authorized Facility-scoped affiliation lists;
- a single affiliation by canonical ID.

A Doctor may therefore hold multiple Facility affiliations without duplicating the global Doctor profile.

### One contract thread per affiliation

Every affiliation receives exactly one `affiliation_contract_threads` row:
- existing affiliations are backfilled by migration;
- future affiliations receive a thread automatically through a database trigger;
- the thread version is the latest appended proposal revision number.

The thread does **not** imply that commercial terms are accepted, effective, active, expired or suspended.

### Append-only proposal revisions

`contract_proposal_revisions` stores immutable revisions:
- monotonically increasing revision number;
- actor account ID;
- generic proposal JSON object;
- generic financial-terms JSON object;
- optional proposed effective-from/effective-until dates;
- immutable creation timestamp.

The JSON payloads are intentionally structurally validated but semantically uninterpreted. Engineering has not invented consultation-fee, commission, tax, settlement, currency or other financial business rules.

Database triggers reject UPDATE and DELETE against proposal revisions.

### Concurrency

The internal append primitive:
1. begins a database transaction;
2. locks the affiliation's contract thread;
3. derives the next revision number from the locked thread version;
4. inserts the immutable revision;
5. advances the thread version;
6. appends an audit event;
7. commits.

Concurrent proposal writes therefore cannot reuse the same revision number.

### Authorization

Doctor-side:
- a Doctor party may read its own affiliation and contract thread/revisions.

Facility-side:
- affiliation access requires `affiliation.read` in the exact Facility scope;
- contract access requires `contract.read` in the exact Facility scope.

A Facility registration account is **not** treated as commercial authority merely because it created the Facility record.

Medidocta internal `admin.oversight` remains an explicit privileged path.

## HTTP API

Implemented read APIs:
- `GET /v1/doctors/me/affiliations`
- `GET /v1/facilities/:facilityId/affiliations`
- `GET /v1/affiliations/:affiliationId`
- `GET /v1/affiliations/:affiliationId/contract`
- `GET /v1/affiliations/:affiliationId/contract/revisions?limit=1..100`

No affiliation or contract mutation HTTP endpoint is exposed in this milestone.

## Infrastructure-only append primitive

`appendContractProposalRevisionForAuthorizedActor(...)` exists as a tested backend primitive but is intentionally not routed to HTTP.

Its caller must first establish commercial authority. That authority is not implemented until the following product decisions are approved.

## PRODUCT DECISION REQUIRED gates

### DR-013 - Contract states
Medidocta must approve proposal/counter/accept/reject/expire/suspend states and transitions.

### DR-014 - Commercial authority
Medidocta must decide which Facility staff roles may propose, counter, accept or otherwise change financial terms.

### DR-015 - Effective terms
Medidocta must define when agreed terms become effective and how historical appointment pricing/terms are snapshotted.

### DR-042 - Affiliation lifecycle
Medidocta must approve initiation, invitation/request, acceptance, suspension and termination behavior.

Until these are resolved:
- no product-facing proposal/counter/accept endpoint exists;
- no affiliation initiation/status mutation API exists;
- no revision is labeled "accepted" or "effective";
- proposed effective dates are stored only as proposal data.

## Acceptance criteria

1. A Doctor can have multiple Facility affiliations against one global Doctor profile.
2. Each Doctor/Facility pair remains unique.
3. Each affiliation has exactly one canonical contract thread.
4. Contract revisions are append-only and monotonically versioned.
5. Two concurrent append operations cannot claim the same revision number.
6. Doctor A cannot read Doctor B's affiliation merely because both are Doctors.
7. Facility A permissions do not grant access to Facility B affiliations/contracts.
8. Facility registration alone does not grant commercial access.
9. Proposal/financial data is not interpreted into invented business policy.
10. Contract mutations remain unreachable over HTTP until DR-013/014/015/042 are resolved.
11. Every appended proposal revision produces an audit event.
