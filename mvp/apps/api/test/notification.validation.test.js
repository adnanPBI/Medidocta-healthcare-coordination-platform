import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNotificationIntent } from '../src/modules/notifications/notification.validation.js';

const accountId = '11111111-1111-4111-8111-111111111111';
const outboxId = '22222222-2222-4222-8222-222222222222';

test('notification intent requires explicit recipient, channel, template and locale', () => {
  const value = validateNotificationIntent({
    sourceOutboxEventId: outboxId,
    recipientAccountId: accountId,
    channelCode: 'TEST_EMAIL',
    templateCode: 'APPOINTMENT_CREATED_TEST',
    locale: 'fr',
    idempotencyKey: 'notify:test:1234',
    payload: { appointmentId: 'a' }
  });
  assert.equal(value.recipientAccountId, accountId);
  assert.equal(value.channelCode, 'TEST_EMAIL');
  assert.equal(value.templateCode, 'APPOINTMENT_CREATED_TEST');
  assert.equal(value.locale, 'fr');
});

test('notification routing does not invent a default channel or template', () => {
  assert.throws(
    () => validateNotificationIntent({
      recipientAccountId: accountId,
      locale: 'fr',
      idempotencyKey: 'notify:test:1234'
    }),
    error => error.code === 'INVALID_NOTIFICATION_REQUEST'
  );
});

test('notification locale is limited to the approved platform locales', () => {
  assert.throws(
    () => validateNotificationIntent({
      recipientAccountId: accountId,
      channelCode: 'TEST_EMAIL',
      templateCode: 'TEST',
      locale: 'es',
      idempotencyKey: 'notify:test:1234'
    }),
    error => error.code === 'INVALID_NOTIFICATION_LOCALE'
  );
});
