export const SUPPORTED_LOCALES = Object.freeze(['fr', 'en']);
export const DEFAULT_LOCALE = 'fr';

const supported = new Set(SUPPORTED_LOCALES);

export function normalizeLocaleCandidate(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const base = raw.split(/[-_]/)[0];
  return supported.has(base) ? base : null;
}

export function parseAcceptLanguage(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part, index) => {
      const [tagPart, ...params] = part.trim().split(';');
      let quality = 1;
      for (const param of params) {
        const match = param.trim().match(/^q=([0-9.]+)$/i);
        if (match) {
          const parsed = Number(match[1]);
          quality = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
        }
      }
      return {
        locale: tagPart === '*' ? null : normalizeLocaleCandidate(tagPart),
        quality,
        index
      };
    })
    .filter(item => item.locale && item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map(item => item.locale)
    .filter((locale, index, all) => all.indexOf(locale) === index);
}

export function resolveLocale({
  explicitLocale,
  accountLocale,
  acceptLanguage,
  fallback = DEFAULT_LOCALE
} = {}) {
  const explicit = normalizeLocaleCandidate(explicitLocale);
  if (explicit) return explicit;

  const account = normalizeLocaleCandidate(accountLocale);
  if (account) return account;

  const accepted = parseAcceptLanguage(acceptLanguage);
  if (accepted[0]) return accepted[0];

  return normalizeLocaleCandidate(fallback) ?? DEFAULT_LOCALE;
}

export function resolveRequestLocale(request, fallback = DEFAULT_LOCALE) {
  return resolveLocale({
    explicitLocale: request?.query?.locale,
    accountLocale: request?.context?.account?.preferredLocale,
    acceptLanguage: request?.headers?.['accept-language'],
    fallback
  });
}

export function requireSupportedLocale(value, fieldName = 'locale') {
  const locale = normalizeLocaleCandidate(value);
  if (!locale) {
    const error = new Error(`${fieldName} must be fr or en`);
    error.statusCode = 422;
    error.code = 'UNSUPPORTED_LOCALE';
    error.messageKey = 'errors.UNSUPPORTED_LOCALE';
    throw error;
  }
  return locale;
}

export function messageKeyForErrorCode(code) {
  const safe = String(code ?? 'REQUEST_ERROR').trim().toUpperCase();
  return `errors.${/^[A-Z0-9_]+$/.test(safe) ? safe : 'REQUEST_ERROR'}`;
}

export function localizationMetadata(locale) {
  return {
    locale: normalizeLocaleCandidate(locale) ?? DEFAULT_LOCALE,
    supportedLocales: [...SUPPORTED_LOCALES],
    fallbackLocale: DEFAULT_LOCALE,
    errorPresentation: 'CLIENT_TRANSLATES_MACHINE_CODE'
  };
}
