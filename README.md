# Medidocta - Pre-Development Architecture & Workflow Demonstrator

This repository contains the **interactive client demonstrator** plus the **editable technical-review source package** for Medidocta.

> **Scope:** pre-development technical review and architecture demonstrator. This repository is intentionally **not a production healthcare MVP** and does not contain real patient data, production authentication, production payments, or live clinical workflows.

## Core architecture principle

Medidocta is **ONE platform**, not separate Patient, Doctor and Healthcare Facility applications:

`Authentication -> Role -> Permissions -> Resource Scope -> Appropriate Interface`

The same account and canonical server-side data are used on smartphone, tablet and browser. The platform has **ONE canonical Appointment record**. Patient, Doctor, Facility and Medidocta Administration see role-appropriate projections of that same resource. Doctor-Facility affiliation is first-class because contract terms, working days and availability are facility-specific.

## What the interactive demo shows

- Role switching within one shared application shell: Patient, Doctor, Facility and Administration.
- The **same `appointment_id`** displayed from different role perspectives.
- Doctor-Facility affiliation with different terms and availability per facility.
- A concurrency simulator for same-slot and cross-facility Doctor conflicts.
- Server-authoritative booking flow: validate -> transactional protection -> commit canonical Appointment -> async outbox delivery.
- RBAC with explicit resource scope.
- Full FR/EN presentation switch across interactive role, booking, RBAC, review and responsive content without duplicating domain data.
- Figma validation register and `PRODUCT DECISION REQUIRED` register.
- MVP planning summary and downloadable editable source artifacts.
- Responsive shared shell: mobile drawer/agenda-first presentation, tablet adaptive rail/hybrid views and desktop dense operational views, all using the same canonical resources.

## Run locally

No framework build is required. Serve the repository root with any static server:

```bash
npm run serve
```

Then open `http://localhost:4173`. Run the JavaScript syntax check with `npm run check`.

## Deployment

The project is a dependency-free static site and includes `vercel.json`; it can be connected directly to Vercel. It can also be hosted as a Render Static Site with a no-op build command such as `echo ready` and publish directory `.`.

## Important implementation boundary

The demo **visualizes and exercises the proposed architecture**. It does not claim the following are production-implemented: real identity verification, PHI/medical data storage, provider integrations, production database exclusion constraints/locks, SMS/email delivery, observability, backups, or security/compliance operations. Those belong to the subsequent MVP implementation contract.

## Handover

The repository exposes the editable source layer under `public/deliverables`, including architecture principles, canonical ownership, RBAC, concurrency tests, workflow wiring, localization/responsive matrices, Figma gaps, decision register, Mermaid diagrams, and release QA notes.

The formatted DOCX/PDF/XLSX client-release package remains the formal handover representation produced from the same review sources.

## Release

Client-release baseline: **v1.1**. MVP implementation has now reached **Milestone 09 responsive + FR/EN hardening** on the same repository.
