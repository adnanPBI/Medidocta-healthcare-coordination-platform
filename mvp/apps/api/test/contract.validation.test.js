import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContractProposalRevision } from '../src/modules/affiliations/contract.validation.js';

test('proposal foundation preserves unopinionated JSON payloads', () => {
  const input = {
    proposalPayload: { note: 'terms under review', customField: { nested: true } },
    financialTermsPayload: { currency: 'XAF', arbitraryStructure: [1, 2, 3] },
    proposedEffectiveFrom: '2026-11-01',
    proposedEffectiveUntil: '2026-12-31'
  };
  assert.deepEqual(validateContractProposalRevision(input), input);
});

test('payloads must be JSON objects', () => {
  assert.throws(
    () => validateContractProposalRevision({ proposalPayload: [] }),
    error => error.code === 'INVALID_CONTRACT_PAYLOAD'
  );
});

test('date range is structurally valid without deciding effective-term policy', () => {
  assert.throws(
    () => validateContractProposalRevision({
      proposedEffectiveFrom: '2026-12-01',
      proposedEffectiveUntil: '2026-11-01'
    }),
    error => error.code === 'INVALID_CONTRACT_DATE_RANGE'
  );
});

test('invalid calendar dates are rejected', () => {
  assert.throws(
    () => validateContractProposalRevision({ proposedEffectiveFrom: '2026-02-30' }),
    error => error.code === 'INVALID_CONTRACT_DATE'
  );
});
