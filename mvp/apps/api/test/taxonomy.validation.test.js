import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCountryCode,
  normalizeLocale,
  normalizeTaxonomyCode
} from '../src/modules/taxonomy/taxonomy.validation.js';

test('locale negotiation supports fr/en and falls back conservatively', () => {
  assert.equal(normalizeLocale('en-CA'), 'en');
  assert.equal(normalizeLocale('fr-FR'), 'fr');
  assert.equal(normalizeLocale('es'), 'fr');
});

test('taxonomy codes are stable machine identifiers', () => {
  assert.equal(normalizeTaxonomyCode('cardiology.v2'), 'cardiology.v2');
  assert.throws(() => normalizeTaxonomyCode('not allowed!'), error => error.code === 'INVALID_TAXONOMY_CODE');
});

test('city country filter uses two-letter ISO codes', () => {
  assert.equal(normalizeCountryCode('cm'), 'CM');
  assert.throws(() => normalizeCountryCode('Cameroon'), error => error.code === 'INVALID_COUNTRY_CODE');
});
