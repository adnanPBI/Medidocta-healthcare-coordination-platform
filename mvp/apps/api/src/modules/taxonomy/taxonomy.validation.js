const LOCALES = new Set(['fr', 'en']);
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export function normalizeLocale(value, fallback = 'fr') {
  if (!value) return fallback;
  const normalized = String(value).trim().toLowerCase().split(/[-_]/)[0];
  return LOCALES.has(normalized) ? normalized : fallback;
}

export function normalizeTaxonomyCode(value) {
  const code = String(value ?? '').trim();
  if (!CODE.test(code)) {
    const error = new Error('Invalid taxonomy code');
    error.statusCode = 422;
    error.code = 'INVALID_TAXONOMY_CODE';
    throw error;
  }
  return code;
}

export function normalizeCountryCode(value) {
  if (!value) return null;
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    const error = new Error('country must be an ISO 3166-1 alpha-2 code');
    error.statusCode = 422;
    error.code = 'INVALID_COUNTRY_CODE';
    throw error;
  }
  return code;
}
