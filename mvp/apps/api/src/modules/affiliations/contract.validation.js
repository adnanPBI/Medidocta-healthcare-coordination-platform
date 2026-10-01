const MAX_JSON_BYTES = 64 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(code, message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  throw error;
}

function objectPayload(value, name) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_CONTRACT_PAYLOAD', `${name} must be a JSON object`);
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_JSON_BYTES) {
    fail('CONTRACT_PAYLOAD_TOO_LARGE', `${name} exceeds 64 KiB`);
  }
  return value;
}

function optionalDate(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!DATE.test(text)) fail('INVALID_CONTRACT_DATE', `${name} must be YYYY-MM-DD`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    fail('INVALID_CONTRACT_DATE', `${name} is not a valid calendar date`);
  }
  return text;
}

export function validateContractProposalRevision(input = {}) {
  const proposalPayload = objectPayload(input.proposalPayload, 'proposalPayload');
  const financialTermsPayload = objectPayload(input.financialTermsPayload, 'financialTermsPayload');
  const proposedEffectiveFrom = optionalDate(input.proposedEffectiveFrom, 'proposedEffectiveFrom');
  const proposedEffectiveUntil = optionalDate(input.proposedEffectiveUntil, 'proposedEffectiveUntil');

  if (
    proposedEffectiveFrom &&
    proposedEffectiveUntil &&
    proposedEffectiveUntil < proposedEffectiveFrom
  ) {
    fail('INVALID_CONTRACT_DATE_RANGE', 'proposedEffectiveUntil must not precede proposedEffectiveFrom');
  }

  return {
    proposalPayload,
    financialTermsPayload,
    proposedEffectiveFrom,
    proposedEffectiveUntil
  };
}
