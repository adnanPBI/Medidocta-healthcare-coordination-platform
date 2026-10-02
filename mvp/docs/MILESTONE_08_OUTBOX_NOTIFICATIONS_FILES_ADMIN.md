# Milestone 08 - Transactional outbox worker, notification delivery foundation, file metadata and expanded audit/admin capabilities

## Objective

Complete the next infrastructure slice without inventing unresolved notification routing, consent, template, upload-provider, malware, retention or administrative business policy.

This milestone implements four foundations:

1. retry-safe transactional outbox processing;
2. provider-adapter notification delivery plumbing that requires an already-approved routing decision;
3. private-file metadata/attachment records without exposing file bytes or selecting a storage provider;
4. immutable audit history plus privileged operational/admin read and retry surfaces.

## Transactional outbox worker

The existing domain outbox remains the boundary between a committed domain transaction and asynchronous side effects.

The worker now supports:
- event-type-specific handler registration;
- PostgreSQL `FOR UPDATE SKIP LOCKED` claiming;
- worker identity;
- lease timestamps;
- stale-lease recovery;
- attempt counters;
- append-only delivery-attempt history;
- deterministic failure metadata;
- retry scheduling;
- lost-lease protection.

A worker may claim only event types for which it has an explicit handler.

There is deliberately no default catch-all handler. An unregistered event remains pending rather than being silently consumed.

### Provider failure behavior

If an external handler throws:
- the domain resource remains committed;
- the outbox event becomes `FAILED`;
- the delivery attempt is recorded;
- retry time is scheduled;
- an authorized Medidocta administrator may requeue the failed event.

A later successful delivery changes only the outbox delivery state.

This preserves CT-010: notification/provider failure cannot roll back the Appointment.

## Outbox administration

Privileged APIs:

- `GET /v1/admin/outbox-events`
- `POST /v1/admin/outbox-events/:eventId/retry`

Only explicit `admin.oversight` can access them.

Manual retry is permitted only for `FAILED` events and is written to the audit log as `OUTBOX_RETRY_REQUESTED`.

No API can delete or mutate delivery-attempt history.

## Notification delivery foundation

DR-023 remains unresolved:

> Which events use in-app/email/SMS/WhatsApp; what consent is required?

Therefore Milestone 08 does **not** automatically turn domain outbox events into notification recipients/channels/templates.

Instead it provides the policy-boundary primitive:

`createNotificationIntentForApprovedPolicy(...)`

The caller must explicitly provide:
- recipient account ID;
- channel code;
- template code;
- locale;
- idempotency key;
- payload;
- optional source outbox event ID.

No channel, recipient or template default exists.

This allows a future approved routing policy to plug in without redesigning delivery infrastructure.

## Notification delivery worker

`runNotificationDeliveryBatch(...)` accepts an explicit adapter registry such as:

`{ EMAIL: adapter, SMS: adapter }`

Only intents whose channel has a supplied adapter are claimable.

The worker provides:
- leased claiming;
- retry-safe attempt history;
- provider message ID storage;
- provider failure isolation;
- manual admin retry;
- lost-lease protection.

Privileged APIs:

- `GET /v1/admin/notification-intents`
- `POST /v1/admin/notification-intents/:intentId/retry`

The admin response explicitly reports:

- `automaticRoutingEnabled: false`
- `channelConsentPolicyResolved: false`
- `templatePolicyResolved: false`

No email/SMS/WhatsApp provider is selected or enabled by this milestone.

## File metadata foundation

The source API capability map requires private-object-storage-backed file objects and resource-bound access. The brief does not provide enough approved policy to choose a concrete provider, signed-URL duration, file-type allowlist, size limit, malware/quarantine workflow, retention period or deletion policy.

Milestone 08 therefore stores metadata only after an authorized caller has completed whatever approved storage/upload flow exists.

`file_objects` stores:
- creator account;
- storage backend code;
- opaque storage object key;
- original filename;
- content type;
- byte size;
- SHA-256;
- metadata;
- created timestamp.

`file_attachment_links` binds that file object to a canonical resource with:
- resource type;
- resource ID;
- relation code;
- attaching account;
- metadata;
- created timestamp.

Both records are append-only.

Internal primitives:

- `registerFileObjectForAuthorizedActor(...)`
- `attachFileObjectForAuthorizedActor(...)`

No public file upload endpoint is exposed.

No signed byte-access endpoint is exposed.

Admin read APIs:

- `GET /v1/admin/files`
- `GET /v1/admin/files/:fileId`

The response explicitly states that bytes are not accessible through the API and signed access is not implemented.

## Audit hardening

`audit_events` is now database-enforced append-only.

The schema also adds:
- `source_code`;
- optional `correlation_id`;
- metadata size/type constraint;
- actor/action/time indexes.

Privileged API:

`GET /v1/admin/audit-events`

Access requires both:
- `admin.oversight`;
- `audit.read`.

Filters support action/resource/actor/time window plus bounded pagination.

Normal user workflows do not receive audit access.

## PRODUCT DECISION REQUIRED / policy gaps

### DR-023 - Notification channels and consent
Still unresolved. No event-to-recipient/channel/template routing is automatically enabled.

### Templates
The source material does not define an approved template catalog or ownership workflow. No template catalog is invented.

### File upload/security policy
The source capability map calls out type/size/malware policy, but the Decision Register provided in the repository does not assign a dedicated DR number for those details. This milestone therefore does not invent:
- allowed MIME types/extensions;
- maximum upload sizes;
- malware engine/provider;
- quarantine/release rules;
- signed URL lifetime;
- storage provider;
- retention/deletion rules.

### Admin business operations
Milestone 08 exposes technical oversight/read/retry capabilities only. It does not create direct-DB shortcuts or invent new business-domain admin transitions.

## Acceptance criteria

1. Provider/handler failure does not roll back committed domain records.
2. Failed outbox work is retryable and has immutable attempt history.
3. Two workers can claim with PostgreSQL locking semantics without intentionally sharing the same claimed row.
4. Stale worker leases can be recovered.
5. Notification delivery requires an explicit channel adapter.
6. No notification routing is automatically enabled while DR-023 is unresolved.
7. Notification intent idempotency prevents duplicate delivery intents.
8. Provider delivery attempts are durable and retryable.
9. File metadata includes storage locator, size and SHA-256 but no file bytes.
10. File metadata/attachment links are append-only.
11. Public file upload/download/signed-access APIs are not fabricated.
12. Audit events are append-only at the database layer.
13. Audit/outbox/notification/file admin APIs require explicit Medidocta administrative scope.
14. Manual retry actions themselves are audited.
