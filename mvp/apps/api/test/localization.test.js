import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCALE,
  messageKeyForErrorCode,
  normalizeLocaleCandidate,
  parseAcceptLanguage,
  resolveLocale
} from '../src/modules/localization/localization.js';

test('locale candidates normalize country variants without changing canonical locale IDs', () => {
  assert.equal(normalizeLocaleCandidate('fr-CM'), 'fr');
  assert.equal(normalizeLocaleCandidate('EN_us'), 'en');
  assert.equal(normalizeLocaleCandidate('es'), null);
  assert.equal(DEFAULT_LOCALE, 'fr');
});

test('Accept-Language quality values are honored deterministically', () => {
  assert.deepEqual(
    parseAcceptLanguage('en-US;q=0.7, fr-CM;q=0.9, *;q=0.5'),
    ['fr', 'en']
  );
  assert.deepEqual(
    parseAcceptLanguage('de, en;q=0.8, fr;q=0'),
    ['en']
  );
});

test('locale resolution uses explicit request then account preference then Accept-Language then French fallback', () => {
  assert.equal(resolveLocale({
    explicitLocale: 'en',
    accountLocale: 'fr',
    acceptLanguage: 'fr'
  }), 'en');

  assert.equal(resolveLocale({
    explicitLocale: 'es',
    accountLocale: 'en',
    acceptLanguage: 'fr'
  }), 'en');

  assert.equal(resolveLocale({
    acceptLanguage: 'en-GB;q=0.8, fr;q=0.5'
  }), 'en');

  assert.equal(resolveLocale({ acceptLanguage: 'de' }), 'fr');
});

test('machine error codes map to stable client translation keys', () => {
  assert.equal(messageKeyForErrorCode('BOOKING_CONFLICT'), 'errors.BOOKING_CONFLICT');
  assert.equal(messageKeyForErrorCode('bad code'), 'errors.REQUEST_ERROR');
  assert.equal(messageKeyForErrorCode(null), 'errors.REQUEST_ERROR');
});
