import { normalizeLocale } from './localization.js';

const LOCALE_TAGS = Object.freeze({
  fr: 'fr-CM',
  en: 'en-CM'
});

function localeTag(localeValue) {
  return LOCALE_TAGS[normalizeLocale(localeValue)];
}

export function formatInstant(isoInstant, {
  locale = 'fr',
  timeZone,
  dateStyle = 'medium',
  timeStyle = 'short'
} = {}) {
  if (!timeZone) throw new TypeError('timeZone is required for instant display');
  const value = new Date(isoInstant);
  if (Number.isNaN(value.getTime())) throw new TypeError('isoInstant must be a valid instant');

  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone,
    dateStyle,
    timeStyle
  }).format(value);
}

export function formatNumber(value, {
  locale = 'fr',
  minimumFractionDigits,
  maximumFractionDigits
} = {}) {
  return new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits,
    maximumFractionDigits
  }).format(value);
}

export function formatCurrency(value, currencyCode, {
  locale = 'fr'
} = {}) {
  const currency = String(currencyCode ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new TypeError('currencyCode must be an ISO 4217-style three-letter code');
  }
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'currency',
    currency
  }).format(value);
}
