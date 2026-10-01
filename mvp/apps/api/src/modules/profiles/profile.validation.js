import { normalizeTaxonomyCode } from '../taxonomy/taxonomy.validation.js';

const DOCTOR_FIELDS = new Set(['version', 'displayName', 'publicBio', 'specialtyCodes', 'primarySpecialtyCode', 'languageCodes']);
const FACILITY_FIELDS = new Set(['version', 'displayName', 'publicSummary', 'cityCode']);

function fail(code, message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  throw error;
}

function ensureKnownFields(input, allowed) {
  for (const key of Object.keys(input ?? {})) {
    if (!allowed.has(key)) fail('UNKNOWN_PROFILE_FIELD', `Unsupported profile field: ${key}`);
  }
}

function version(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) fail('INVALID_PROFILE_VERSION', 'version must be a positive integer');
  return parsed;
}

function nullableText(value, name, max) {
  if (value === null) return null;
  if (typeof value !== 'string') fail('INVALID_PROFILE_FIELD', `${name} must be a string or null`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) fail('PROFILE_FIELD_TOO_LONG', `${name} must be at most ${max} characters`);
  return trimmed;
}

function codes(value, name, max = 20) {
  if (!Array.isArray(value)) fail('INVALID_PROFILE_FIELD', `${name} must be an array`);
  if (value.length > max) fail('TOO_MANY_PROFILE_VALUES', `${name} may contain at most ${max} values`);
  return [...new Set(value.map(normalizeTaxonomyCode))];
}

export function validateDoctorProfilePatch(input = {}) {
  ensureKnownFields(input, DOCTOR_FIELDS);
  const out = { version: version(input.version) };
  if ('displayName' in input) out.displayName = nullableText(input.displayName, 'displayName', 120);
  if ('publicBio' in input) out.publicBio = nullableText(input.publicBio, 'publicBio', 2000);
  if ('specialtyCodes' in input) out.specialtyCodes = codes(input.specialtyCodes, 'specialtyCodes');
  if ('languageCodes' in input) out.languageCodes = codes(input.languageCodes, 'languageCodes');
  if ('primarySpecialtyCode' in input) {
    out.primarySpecialtyCode = input.primarySpecialtyCode === null ? null : normalizeTaxonomyCode(input.primarySpecialtyCode);
  }
  if (out.primarySpecialtyCode && out.specialtyCodes && !out.specialtyCodes.includes(out.primarySpecialtyCode)) {
    fail('PRIMARY_SPECIALTY_NOT_SELECTED', 'primarySpecialtyCode must be present in specialtyCodes');
  }
  if (Object.keys(out).length === 1) fail('EMPTY_PROFILE_PATCH', 'At least one profile field must be supplied');
  return out;
}

export function validateFacilityProfilePatch(input = {}) {
  ensureKnownFields(input, FACILITY_FIELDS);
  const out = { version: version(input.version) };
  if ('displayName' in input) out.displayName = nullableText(input.displayName, 'displayName', 160);
  if ('publicSummary' in input) out.publicSummary = nullableText(input.publicSummary, 'publicSummary', 2000);
  if ('cityCode' in input) out.cityCode = input.cityCode === null ? null : normalizeTaxonomyCode(input.cityCode);
  if (Object.keys(out).length === 1) fail('EMPTY_PROFILE_PATCH', 'At least one profile field must be supplied');
  return out;
}
