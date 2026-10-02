import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogParityReport,
  catalogs,
  translate
} from '../src/localization.js';
import { presentApiError } from '../src/error-presentation.js';

test('FR and EN catalogs keep exact key parity', () => {
  const report = catalogParityReport();
  assert.deepEqual(report.missingByLocale.en, []);
  assert.deepEqual(report.extraByLocale.en, []);
  assert.ok(Object.keys(catalogs.fr).length >= 30);
});

test('critical booking and permission errors have localized presentation in both locales', () => {
  for (const locale of ['fr', 'en']) {
    for (const code of [
      'BOOKING_CONFLICT',
      'AVAILABILITY_VERSION_CONFLICT',
      'FORBIDDEN',
      'INTERNAL_ERROR'
    ]) {
      const key = `errors.${code}`;
      assert.notEqual(translate(locale, key), key);
      assert.ok(translate(locale, key).length > 8);
    }
  }
});

test('API presentation uses machine code/messageKey instead of backend prose as workflow logic', () => {
  const result = presentApiError({
    error: 'BOOKING_CONFLICT',
    messageKey: 'errors.BOOKING_CONFLICT',
    message: 'arbitrary backend text',
    requestId: 'req-123'
  }, 'fr');

  assert.equal(result.code, 'BOOKING_CONFLICT');
  assert.equal(result.messageKey, 'errors.BOOKING_CONFLICT');
  assert.equal(result.requestId, 'req-123');
  assert.notEqual(result.text, 'arbitrary backend text');
});
