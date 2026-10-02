import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCreateBooking,
  validateIdempotencyKey,
  validateResourceId
} from '../src/modules/booking/booking.validation.js';

const affiliationId = '11111111-1111-4111-8111-111111111111';
const scheduleRevisionId = '22222222-2222-4222-8222-222222222222';

test('booking request normalizes canonical identifiers and UTC instants', () => {
  const value = validateCreateBooking({
    affiliationId,
    scheduleRevisionId,
    startsAt: '2026-10-05T09:00:00+01:00',
    endsAt: '2026-10-05T09:30:00+01:00'
  });
  assert.equal(value.affiliationId, affiliationId);
  assert.equal(value.scheduleRevisionId, scheduleRevisionId);
  assert.equal(value.startsAt.toISO(), '2026-10-05T08:00:00.000Z');
  assert.equal(value.endsAt.toISO(), '2026-10-05T08:30:00.000Z');
});

test('booking request refuses unknown product fields', () => {
  assert.throws(
    () => validateCreateBooking({
      affiliationId,
      scheduleRevisionId,
      startsAt: '2026-10-05T08:00:00Z',
      endsAt: '2026-10-05T08:30:00Z',
      cancellationPolicy: 'invented'
    }),
    error => error.code === 'UNKNOWN_BOOKING_FIELD'
  );
});

test('booking intervals require explicit offset-aware instants', () => {
  assert.throws(
    () => validateCreateBooking({
      affiliationId,
      scheduleRevisionId,
      startsAt: '2026-10-05T08:00:00',
      endsAt: '2026-10-05T08:30:00Z'
    }),
    error => error.code === 'INVALID_BOOKING_INSTANT'
  );
});

test('idempotency keys have a stable safe format', () => {
  assert.equal(validateIdempotencyKey('booking:abc-123'), 'booking:abc-123');
  assert.throws(
    () => validateIdempotencyKey('short'),
    error => error.code === 'INVALID_IDEMPOTENCY_KEY' && error.statusCode === 400
  );
});

test('resource IDs are validated before PostgreSQL casts', () => {
  assert.equal(validateResourceId(affiliationId, 'affiliationId'), affiliationId);
  assert.throws(
    () => validateResourceId('not-a-uuid', 'appointmentId'),
    error => error.code === 'INVALID_BOOKING_REQUEST'
  );
});
