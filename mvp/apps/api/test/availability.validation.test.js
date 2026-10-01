import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAvailabilityRevision,
  validateProjectionQuery,
  validateTimezoneName
} from '../src/modules/availability/availability.validation.js';

test('availability revision requires explicit IANA timezone and optimistic version', () => {
  const value = validateAvailabilityRevision({
    expectedVersion: 0,
    timezoneName: 'Africa/Douala',
    recurringRules: [{
      ruleKey: 'monday-am',
      isoWeekday: 1,
      localStart: '09:00',
      localEnd: '12:00'
    }],
    exceptions: []
  });
  assert.equal(value.expectedVersion, 0);
  assert.equal(value.timezoneName, 'Africa/Douala');
  assert.equal(value.recurringRules[0].localStart, '09:00:00');
});

test('invalid timezone is rejected instead of defaulting policy', () => {
  assert.throws(
    () => validateTimezoneName('Cameroon/Default'),
    error => error.code === 'INVALID_TIMEZONE'
  );
});

test('same-day recurring rule range must be structurally ordered', () => {
  assert.throws(
    () => validateAvailabilityRevision({
      expectedVersion: 0,
      timezoneName: 'Africa/Douala',
      recurringRules: [{
        ruleKey: 'overnight',
        isoWeekday: 1,
        localStart: '22:00',
        localEnd: '06:00'
      }]
    }),
    error => error.code === 'INVALID_AVAILABILITY_TIME_RANGE'
  );
});

test('exceptions are stored structurally without choosing precedence', () => {
  const value = validateAvailabilityRevision({
    expectedVersion: 2,
    timezoneName: 'Africa/Douala',
    recurringRules: [],
    exceptions: [{
      exceptionKey: 'closure-1',
      startsAt: '2026-10-05T09:00:00+01:00',
      endsAt: '2026-10-05T10:00:00+01:00',
      kindCode: 'CLOSURE_UNINTERPRETED',
      metadata: { reason: 'test' }
    }]
  });
  assert.equal(value.exceptions[0].kindCode, 'CLOSURE_UNINTERPRETED');
});

test('projection requires explicit slot minutes and offset-aware window', () => {
  const q = validateProjectionQuery({
    from: '2026-10-05T00:00:00Z',
    to: '2026-10-06T00:00:00Z',
    slotMinutes: '30'
  });
  assert.equal(q.slotMinutes, 30);

  assert.throws(
    () => validateProjectionQuery({
      from: '2026-10-05T00:00:00Z',
      to: '2026-10-06T00:00:00Z'
    }),
    error => error.code === 'INVALID_SLOT_MINUTES'
  );
});

test('31 day technical query cap is not treated as product booking horizon', () => {
  assert.throws(
    () => validateProjectionQuery({
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-15T00:00:00Z',
      slotMinutes: 30
    }),
    error => error.code === 'PROJECTION_WINDOW_TOO_LARGE'
  );
});
