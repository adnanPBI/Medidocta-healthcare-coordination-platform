# Demo acceptance checklist

The client-facing demonstrator should be accepted when all of the following are true:

1. Patient, Doctor, Facility and Admin experiences are views inside one application shell.
2. Role switching does not create duplicate user or appointment objects.
3. A canonical appointment (`APT-1042`) is shown with the same identity from multiple role perspectives.
4. Doctor-Facility affiliation visibly carries facility-specific schedule and commercial context.
5. Cross-facility Doctor overlap is rejected by the booking simulator.
6. Same-slot competing booking is rejected by the booking simulator.
7. Idempotent retry demonstrates replay rather than duplicate creation.
8. FR/EN toggling changes presentation copy without changing record identity.
9. RBAC presentation includes resource scope, not only role names.
10. Figma gaps and unresolved product decisions are explicitly distinguished.
11. Download links expose the editable technical-review source package.
12. Mobile layout remains usable and does not create a separate product experience.

## Not represented as production-complete

- Real authentication/session provider
- Real relational persistence / PostgreSQL exclusion constraints
- Real notifications or provider webhooks
- Real healthcare or patient data
- Compliance certification
- Production monitoring, backups or secrets infrastructure
