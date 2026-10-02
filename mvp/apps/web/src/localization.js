export const SUPPORTED_LOCALES = Object.freeze(['fr', 'en']);
export const DEFAULT_LOCALE = 'fr';

export const catalogs = Object.freeze({
  fr: Object.freeze({
    'app.name': 'Medidocta',
    'app.onePlatform': 'Une plateforme',
    'nav.home': 'Accueil',
    'nav.search': 'Recherche',
    'nav.appointments': 'Rendez-vous',
    'nav.profile': 'Profil',
    'nav.facilities': 'Établissements',
    'nav.staff': 'Équipe',
    'nav.notifications': 'Notifications',
    'nav.files': 'Fichiers',
    'nav.audit': 'Audit',
    'nav.admin': 'Administration',
    'nav.settings': 'Paramètres',
    'roles.PATIENT': 'Patient',
    'roles.DOCTOR': 'Médecin',
    'roles.FACILITY': 'Établissement de santé',
    'roles.MEDIDOCTA_ADMIN': 'Administration Medidocta',
    'common.loading': 'Chargement…',
    'common.empty': 'Aucun élément à afficher',
    'common.retry': 'Réessayer',
    'common.close': 'Fermer',
    'common.menu': 'Menu',
    'common.language': 'Langue',
    'common.save': 'Enregistrer',
    'booking.review': 'Vérifier le rendez-vous',
    'booking.confirm': 'Confirmer la réservation',
    'booking.conflict': 'Ce créneau n’est plus disponible. Actualisez les disponibilités et réessayez.',
    'booking.stale': 'Les disponibilités ont changé. Actualisez avant de continuer.',
    'errors.BOOKING_CONFLICT': 'Ce créneau n’est plus disponible.',
    'errors.AVAILABILITY_VERSION_CONFLICT': 'Les disponibilités ont changé. Actualisez avant de continuer.',
    'errors.BOOKING_OUTSIDE_AVAILABILITY': 'Le créneau demandé n’est plus dans les disponibilités actuelles.',
    'errors.BOOKING_EXCEPTION_POLICY_UNRESOLVED': 'Ce créneau ne peut pas être réservé tant que la règle d’exception n’est pas confirmée.',
    'errors.FORBIDDEN': 'Vous n’avez pas l’autorisation d’effectuer cette action.',
    'errors.ACCOUNT_NOT_REGISTERED': 'Un compte Medidocta enregistré est requis.',
    'errors.ACCOUNT_INACTIVE': 'Ce compte Medidocta n’est pas actif.',
    'errors.UNSUPPORTED_LOCALE': 'La langue demandée n’est pas prise en charge.',
    'errors.INVALID_BOOKING_REQUEST': 'Les informations de réservation sont invalides.',
    'errors.IDEMPOTENCY_KEY_REUSE': 'Cette demande a déjà été utilisée avec des données différentes.',
    'errors.PROFILE_VERSION_CONFLICT': 'Le profil a changé. Actualisez avant d’enregistrer.',
    'errors.ROOM_ASSIGNMENT_VERSION_CONFLICT': 'L’affectation de salle a changé. Actualisez avant d’enregistrer.',
    'errors.REQUEST_ERROR': 'La demande n’a pas pu être traitée.',
    'errors.INTERNAL_ERROR': 'Une erreur inattendue est survenue.'
  }),
  en: Object.freeze({
    'app.name': 'Medidocta',
    'app.onePlatform': 'One platform',
    'nav.home': 'Home',
    'nav.search': 'Search',
    'nav.appointments': 'Appointments',
    'nav.profile': 'Profile',
    'nav.facilities': 'Facilities',
    'nav.staff': 'Staff',
    'nav.notifications': 'Notifications',
    'nav.files': 'Files',
    'nav.audit': 'Audit',
    'nav.admin': 'Administration',
    'nav.settings': 'Settings',
    'roles.PATIENT': 'Patient',
    'roles.DOCTOR': 'Doctor',
    'roles.FACILITY': 'Healthcare Facility',
    'roles.MEDIDOCTA_ADMIN': 'Medidocta Administration',
    'common.loading': 'Loading…',
    'common.empty': 'Nothing to display',
    'common.retry': 'Retry',
    'common.close': 'Close',
    'common.menu': 'Menu',
    'common.language': 'Language',
    'common.save': 'Save',
    'booking.review': 'Review appointment',
    'booking.confirm': 'Confirm booking',
    'booking.conflict': 'This slot is no longer available. Refresh availability and try again.',
    'booking.stale': 'Availability changed. Refresh before continuing.',
    'errors.BOOKING_CONFLICT': 'This slot is no longer available.',
    'errors.AVAILABILITY_VERSION_CONFLICT': 'Availability changed. Refresh before continuing.',
    'errors.BOOKING_OUTSIDE_AVAILABILITY': 'The requested slot is no longer within current availability.',
    'errors.BOOKING_EXCEPTION_POLICY_UNRESOLVED': 'This slot cannot be booked until the exception rule is confirmed.',
    'errors.FORBIDDEN': 'You do not have permission to perform this action.',
    'errors.ACCOUNT_NOT_REGISTERED': 'A registered Medidocta account is required.',
    'errors.ACCOUNT_INACTIVE': 'This Medidocta account is not active.',
    'errors.UNSUPPORTED_LOCALE': 'The requested language is not supported.',
    'errors.INVALID_BOOKING_REQUEST': 'The booking information is invalid.',
    'errors.IDEMPOTENCY_KEY_REUSE': 'This request key was already used with different data.',
    'errors.PROFILE_VERSION_CONFLICT': 'The profile changed. Refresh before saving.',
    'errors.ROOM_ASSIGNMENT_VERSION_CONFLICT': 'The room assignment changed. Refresh before saving.',
    'errors.REQUEST_ERROR': 'The request could not be processed.',
    'errors.INTERNAL_ERROR': 'An unexpected error occurred.'
  })
});

export function normalizeLocale(value, fallback = DEFAULT_LOCALE) {
  const raw = String(value ?? '').trim().toLowerCase();
  const base = raw.split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(base) ? base : fallback;
}

export function translate(localeValue, key, params = {}) {
  const locale = normalizeLocale(localeValue);
  const template = catalogs[locale]?.[key] ?? catalogs[DEFAULT_LOCALE]?.[key] ?? key;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
  );
}

export function catalogParityReport() {
  const [first, ...rest] = SUPPORTED_LOCALES;
  const baseline = new Set(Object.keys(catalogs[first]));
  const missingByLocale = {};
  const extraByLocale = {};

  for (const locale of rest) {
    const keys = new Set(Object.keys(catalogs[locale]));
    missingByLocale[locale] = [...baseline].filter(key => !keys.has(key)).sort();
    extraByLocale[locale] = [...keys].filter(key => !baseline.has(key)).sort();
  }

  return { missingByLocale, extraByLocale };
}
