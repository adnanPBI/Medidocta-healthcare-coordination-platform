import { requireSupportedLocale } from '../localization/localization.js';

const ALLOWED_FIELDS = new Set(['preferredLocale']);

function fail(code, message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  throw error;
}

export function validateAccountPreferencesPatch(input = {}) {
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) {
      fail('UNKNOWN_ACCOUNT_PREFERENCE_FIELD', `Unsupported preference field: ${key}`);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(input, 'preferredLocale')) {
    fail('EMPTY_ACCOUNT_PREFERENCES_PATCH', 'preferredLocale is required');
  }
  return {
    preferredLocale: requireSupportedLocale(input.preferredLocale, 'preferredLocale')
  };
}
