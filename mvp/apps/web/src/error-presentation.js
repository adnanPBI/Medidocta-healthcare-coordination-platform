import { normalizeLocale, translate } from './localization.js';

export function presentApiError(payload = {}, localeValue = 'fr') {
  const locale = normalizeLocale(localeValue);
  const code = String(payload.error ?? 'REQUEST_ERROR').trim().toUpperCase();
  const messageKey = payload.messageKey || `errors.${code}`;
  const translated = translate(locale, messageKey);
  const resolvedText = translated === messageKey
    ? translate(locale, 'errors.REQUEST_ERROR')
    : translated;

  return {
    code,
    messageKey,
    text: resolvedText,
    requestId: payload.requestId ?? null,
    locale
  };
}
