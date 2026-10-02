import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  formatInstant,
  formatNumber
} from '../src/formatting.js';

test('the same canonical UTC instant renders through an explicit display timezone', () => {
  const fr = formatInstant('2026-10-05T08:00:00Z', {
    locale: 'fr',
    timeZone: 'Africa/Douala'
  });
  const en = formatInstant('2026-10-05T08:00:00Z', {
    locale: 'en',
    timeZone: 'Africa/Douala'
  });
  assert.ok(fr.length > 5);
  assert.ok(en.length > 5);
  assert.notEqual(fr, en);
});

test('number and currency formatting is presentation-only and locale-aware', () => {
  assert.notEqual(
    formatNumber(1234.5, { locale: 'fr' }),
    formatNumber(1234.5, { locale: 'en' })
  );
  assert.ok(formatCurrency(25000, 'XAF', { locale: 'fr' }).length > 4);
  assert.throws(() => formatCurrency(10, 'XX', { locale: 'fr' }), /currencyCode/);
});

test('instant display requires an explicit timezone', () => {
  assert.throws(
    () => formatInstant('2026-10-05T08:00:00Z', { locale: 'fr' }),
    /timeZone/
  );
});
