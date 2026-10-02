import { DateTime } from 'luxon';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function fail(code, message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

function uuid(value, name) {
  const text = String(value ?? '').trim();
  if (!UUID.test(text)) fail('INVALID_BOOKING_REQUEST', `${name} must be a UUID`);
  return text.toLowerCase();
}

function instant(value, name) {
  const text = String(value ?? '').trim();
  if (!/[zZ]|[+-]\d\d:\d\d$/.test(text)) {
    fail('INVALID_BOOKING_INSTANT', `${name} must be an ISO-8601 instant with offset`);
  }
  const parsed = DateTime.fromISO(text, { setZone: true });
  if (!parsed.isValid) fail('INVALID_BOOKING_INSTANT', `${name} is not a valid ISO-8601 instant`);
  return parsed.toUTC();
}

export function validateIdempotencyKey(value) {
  const key = String(value ?? '').trim();
  if (!IDEMPOTENCY.test(key)) {
    fail(
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key must be 8-128 characters using letters, digits, dot, underscore, colon or hyphen',
      400
    );
  }
  return key;
}

export function validateCreateBooking(input = {}) {
  const allowed = new Set([
    'affiliationId',
    'scheduleRevisionId',
    'startsAt',
    'endsAt',
    'subjectPatientProfileId'
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) fail('UNKNOWN_BOOKING_FIELD', `Unsupported booking field: ${key}`);
  }

  const startsAt = instant(input.startsAt, 'startsAt');
  const endsAt = instant(input.endsAt, 'endsAt');
  if (endsAt.toMillis() <= startsAt.toMillis()) {
    fail('INVALID_BOOKING_INTERVAL', 'endsAt must be later than startsAt');
  }

  return {
    affiliationId: uuid(input.affiliationId, 'affiliationId'),
    scheduleRevisionId: uuid(input.scheduleRevisionId, 'scheduleRevisionId'),
    startsAt,
    endsAt,
    subjectPatientProfileId: input.subjectPatientProfileId == null
      ? null
      : uuid(input.subjectPatientProfileId, 'subjectPatientProfileId')
  };
}
