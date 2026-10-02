# Asynchronous delivery and file metadata model

## Domain commit boundary

A domain transaction writes its canonical record and an `outbox_events` row together.

After commit, a worker may asynchronously process the outbox event.

A delivery failure therefore changes asynchronous delivery state, not the already-committed domain aggregate.

## Outbox state

`PENDING -> PROCESSING -> DELIVERED`

or

`PENDING -> PROCESSING -> FAILED -> PENDING/PROCESSING -> DELIVERED`

Worker leases prevent a permanently stuck `PROCESSING` row after process failure.

Expired leases are converted into a recorded failed attempt before the row becomes retryable.

## Handler registry

The worker requires an explicit mapping:

`event_type -> handler`

Unknown/unregistered event types are not claimed.

This prevents silently treating every domain event as a notification.

## Notification policy boundary

The notification subsystem is deliberately downstream of product policy.

A domain event does not itself answer:
- who should receive it;
- whether consent exists;
- whether delivery is in-app/email/SMS/WhatsApp;
- which template applies.

A future routing policy must make those decisions first, then create a `notification_delivery_intent`.

## Notification adapter boundary

Notification delivery adapters receive an already-resolved intent:

- recipient account ID;
- explicit channel code;
- explicit template code;
- locale;
- payload;
- attempt number.

Adapters are transport integrations only. They do not decide business recipients or consent.

## At-least-once behavior

Both outbox and notification delivery use retryable at-least-once processing.

Therefore:
- handlers/adapters should use downstream idempotency keys where supported;
- internal delivery-intent creation is idempotent;
- delivery attempts are stored immutably;
- administrators may requeue failed work through guarded services.

Exactly-once external delivery is not claimed.

## File object boundary

Medidocta stores file metadata separately from object bytes.

`FileObject`
- identifies where the private object resides;
- stores integrity/size/content metadata;
- does not expose bytes.

`FileAttachmentLink`
- binds the file to a canonical Medidocta resource;
- does not create a duplicate file object.

The design supports future verification/support/document workflows while leaving storage/security/retention policy open.

## Audit boundary

Audit records capture structured security/domain/admin facts and are append-only.

They are not a general application log and should not contain passwords, tokens, raw authorization headers, or unnecessary health/PHI content.

Administrative retry actions generate new audit records rather than rewriting previous ones.
