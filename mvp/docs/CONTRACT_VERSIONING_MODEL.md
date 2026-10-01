# Contract versioning model

## Purpose

This model separates **technical history** from **business lifecycle**.

The system can safely preserve every commercial proposal before Medidocta decides the exact proposal/counter/accept/effective-state workflow.

## Structure

`DoctorFacilityAffiliation 1 ── 1 AffiliationContractThread 1 ── N ContractProposalRevision`

The affiliation identifies the Doctor/Facility relationship. The contract thread is the stable container. Revisions are immutable snapshots.

## Revision semantics

A revision means only:

> "this payload was appended as revision N by account X at time T."

It does not mean:
- accepted;
- rejected;
- countered;
- active;
- expired;
- effective for billing;
- legally binding.

Those meanings remain behind the product decision register.

## Financial terms payload

`financial_terms_payload` is an object rather than a premature fixed schema. This prevents engineering from inventing:
- fee types;
- percentage/flat-fee formulas;
- tax treatment;
- payment timing;
- settlement ownership;
- cancellation economics;
- currency conversion.

Once Medidocta approves those rules, the payload can be promoted into typed columns/tables through a forward migration while retaining historical revisions.

## History and audit

Proposal revisions cannot be updated or deleted. Corrections are represented by another revision.

The audit log records the actor, contract thread, affiliation and revision number for every application-level append.

## Effective terms

The optional proposed effective dates are proposal metadata only. The MVP does not select an effective revision or apply financial terms to appointments. That behavior remains blocked on DR-015 and later appointment-pricing design.
