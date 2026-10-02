# Milestone 09 - Responsive architecture + FR/EN localization hardening

## Objective

Implement the roadmap's responsive and bilingual architecture without creating separate Patient, Doctor, Facility, mobile, tablet or desktop applications.

The governing invariant remains:

**Authentication -> Role -> Permission -> Resource Scope -> Appropriate Interface**

Device width changes layout density and navigation presentation only. Locale changes presentation only. Neither may fork canonical business data, authorization, Appointment identity or backend capabilities.

## Source-aligned responsive behavior

The implementation follows the handover Responsive Matrix:

- **Phone:** stacked flows, drawer navigation, cards/filter drawer, agenda-first calendars and focused booking review.
- **Tablet:** adaptive rail/drawer, split filters/results, calendar/list hybrids and two-column detail where space permits.
- **Desktop/browser:** persistent navigation, filter rails, dense calendar/table views and operational side panels.

The code-level breakpoints are implementation details:

- phone: <= 767 px;
- tablet: 768-1199 px;
- desktop: >= 1200 px.

These breakpoint numbers are not business rules and may be tuned after complete Figma/device validation.

All concurrency-sensitive writes remain online and server-authoritative at every breakpoint.

## Shared application-shell contract

`mvp/apps/web/src/app-shell.js` defines a single application-shell projection from server-derived session context.

Inputs:
- canonical account/session context;
- server-derived roles;
- effective permissions;
- Facility memberships;
- Doctor affiliations;
- locale;
- viewport width.

Outputs:
- one navigation model;
- role contexts available within the same account;
- responsive presentation contract;
- canonical `/v1` API references.

The shell explicitly declares:

`deviceSpecificBusinessApi: false`

The canonical Appointment resource remains:

`/v1/appointments/:appointmentId`

for phone, tablet and desktop.

DR-001 remains open. The shell therefore exposes all server-resolved role contexts and does not invent a final product rule for automatic active-role selection.

## Locale resolution

Initial supported locale IDs are stable canonical values:

- `fr`
- `en`

The API resolver uses the following presentation precedence:

1. explicit request `?locale=fr|en`;
2. persisted `Account.preferred_locale`;
3. weighted `Accept-Language`;
4. French fallback.

Country variants such as `fr-CM` and `en-US` normalize to the initial canonical locale IDs.

This precedence is a technical presentation rule, not a business-data transformation.

## Persisted account locale

Implemented:

`PATCH /v1/accounts/me/preferences`

Current accepted field:

`preferredLocale: "fr" | "en"`

The preference is stored on the same Account and audited as `ACCOUNT_LOCALE_UPDATED` when it changes.

Changing locale does not create or copy:
- Account;
- PatientProfile;
- DoctorProfile;
- HealthcareFacility;
- Appointment;
- affiliation;
- taxonomy codes.

## Localization capability metadata

Implemented:

`GET /v1/localization/meta`

The response exposes:
- resolved locale;
- supported locale IDs;
- fallback locale;
- machine-error translation strategy;
- confirmation that canonical business records are not localized copies.

## Taxonomy/profile localization

Taxonomy and profile routes now use the same locale resolver.

Canonical taxonomy codes remain stable while labels are selected by locale with the existing French fallback behavior.

Locale never changes taxonomy IDs or resource identity.

## Error localization strategy

Backend APIs continue to return stable machine error codes.

Error payloads now include:
- `error` - machine code;
- `messageKey` - stable translation key;
- `locale` - resolved presentation locale;
- `message` - backend diagnostic/user-safe fallback prose;
- `requestId` - correlation handle.

Frontend workflow logic must branch on `error`, never on translated or English prose.

Example:

```json
{
  "error": "BOOKING_CONFLICT",
  "messageKey": "errors.BOOKING_CONFLICT",
  "locale": "fr",
  "message": "The Doctor is no longer available for the requested interval",
  "requestId": "req-123"
}
```

The shared web catalog renders the user-facing copy from the machine code/message key.

## Shared FR/EN catalog

`mvp/apps/web/src/localization.js` contains shared initial FR/EN UI vocabulary for:
- shell navigation;
- role labels;
- common controls;
- booking review/conflict states;
- critical stable API error codes.

Regression tests enforce exact key parity between FR and EN catalogs.

No workflow logic is based on translated text.

## Date/time/number/currency presentation

`mvp/apps/web/src/formatting.js` provides presentation-only formatting.

Rules:
- canonical instants remain ISO/UTC values;
- display requires an explicit IANA timezone;
- numbers use locale-aware formatting;
- currency display requires an explicit ISO-style currency code;
- localized display strings are never parsed back into canonical money/time values.

DR-012 still governs final Cameroon/future cross-border timezone policy. This milestone does not change availability recurrence semantics.

## Accessibility hardening

The deployed demonstrator now includes:
- skip-to-content navigation;
- semantic navigation landmark;
- keyboard-operable mobile drawer;
- Escape-to-close behavior;
- visible `:focus-visible` treatment;
- 44 px minimum mobile control targets;
- semantic tab states;
- semantic table headings/captions;
- live-region booking outcomes;
- French long-label wrapping;
- no hidden mobile navigation items;
- reduced-motion support;
- viewport safe-area support.

These are implementation hardening measures. Complete accessibility acceptance remains part of Milestone 10 and requires real screen/device/assistive-technology QA.

## Demonstrator localization hardening

The static client demonstrator now translates the complete interactive presentation rather than only its header/navigation.

Locale switching changes:
- role descriptions;
- Appointment field labels;
- RBAC table labels/content;
- architecture principles;
- Figma/decision register summaries;
- booking scenario descriptions;
- responsive/localization architecture;
- estimate labels;
- deliverable labels.

The canonical demo Appointment ID and booking machine codes remain unchanged.

The selected locale is remembered locally by the demonstrator only as a presentation convenience; production locale persistence uses the Account API.

## Figma validation boundaries

The original review still marks these as validation items:

- **FG-013** FR/EN layout;
- **FG-014** responsive Facility calendar;
- **FG-015** error/empty/loading states.

Milestone 09 provides implementation architecture and demonstrator hardening but does not claim complete Figma validation because the complete Figma source was not present in the review package.

## Acceptance criteria

1. Phone, tablet and desktop use one shell and the same canonical APIs.
2. No device-specific business database/API is introduced.
3. Every breakpoint keeps booking writes online/server-authoritative.
4. FR/EN catalog keys have parity.
5. Account locale preference persists without duplicating business records.
6. Weighted `Accept-Language` parsing is deterministic.
7. Explicit locale override does not mutate Account preference.
8. Taxonomy/profile labels use the shared locale policy.
9. API errors expose stable machine code + message key + locale + request ID.
10. Client error presentation does not depend on backend prose.
11. Canonical UTC instants require explicit display timezone.
12. All mobile navigation destinations remain reachable.
13. Critical interactive controls are keyboard operable.
14. French expansion/wrapping has regression coverage in the demonstrator shell.
15. DR-001 and DR-012 remain decision-gated rather than being invented.
