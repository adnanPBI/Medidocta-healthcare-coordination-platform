# Responsive and localization model

## One application, adaptive presentation

Medidocta does not route users into separate Patient, Doctor, Facility, phone, tablet or desktop products.

The application shell is derived from the authenticated server context:

`Account + Roles + Permissions + Resource Scope -> Navigation/Interface`

Viewport mode then changes only presentation:

`Interface + Width -> Phone | Tablet | Desktop layout`

It does not change resource identity or authorization.

## Responsive projection

### Phone
- drawer navigation;
- stacked primary flows;
- card/list discovery;
- agenda-first scheduling;
- focused booking confirmation.

### Tablet
- adaptive rail/drawer;
- split-view discovery;
- calendar/list hybrids;
- two-column detail where space permits.

### Desktop
- persistent navigation;
- dense tables/calendars;
- persistent filters;
- side panels.

The same `appointment_id` is used everywhere.

## Locale projection

Locale is a presentation projection over canonical records.

`Canonical resource + locale -> localized labels/formatting`

It must never become:

`Canonical resource + locale -> duplicate business resource`

Stable codes/IDs include:
- Appointment ID;
- taxonomy codes;
- permission codes;
- status/event/error codes;
- resource IDs.

## Locale precedence

Authenticated request:

`explicit locale -> Account.preferred_locale -> Accept-Language -> fr`

Unauthenticated request:

`explicit locale -> Accept-Language -> fr`

Only `fr` and `en` are canonical initial locale identifiers. Country variants normalize to those identifiers.

## Error contract

The backend is responsible for:
- stable machine error code;
- safe fallback message;
- request/correlation ID;
- message translation key;
- resolved locale metadata.

The client is responsible for:
- translating the message key;
- layout/wrapping;
- accessible focus/error association;
- choosing presentation appropriate to the current viewport.

Translated strings never determine control flow.

## Formatting boundary

Canonical values:
- UTC instants;
- IANA timezone identifiers where recurrence/display requires them;
- numeric values;
- ISO currency code where applicable.

Presentation:
- `Intl.DateTimeFormat`;
- `Intl.NumberFormat`;
- locale-aware currency formatting.

Localized display strings never become persistence input without explicit parsing/validation architecture.

## Accessibility boundary

Responsive design is not considered complete merely because content fits a narrow screen.

Shared shell requirements include:
- keyboard reachability;
- logical focus;
- visible focus;
- semantic landmarks/headings;
- touch-target sizing;
- no navigation removal merely due to width;
- reduced-motion handling;
- long FR label wrapping.

Milestone 10 remains responsible for full accessibility/security/performance acceptance hardening.
