import { normalizeLocale } from './localization.js';
import { responsiveContract } from './responsive.js';

const NAV_ITEMS = Object.freeze([
  { id: 'home', labelKey: 'nav.home', href: '/app', permission: null },
  { id: 'search', labelKey: 'nav.search', href: '/app/search', permission: 'search.public.read' },
  { id: 'appointments', labelKey: 'nav.appointments', href: '/app/appointments', permission: 'appointment.read' },
  { id: 'profile', labelKey: 'nav.profile', href: '/app/profile', anyPermission: ['profile.patient.read', 'profile.doctor.read', 'facility.profile.read'] },
  { id: 'facilities', labelKey: 'nav.facilities', href: '/app/facilities', anyPermission: ['affiliation.read', 'facility.profile.read'] },
  { id: 'staff', labelKey: 'nav.staff', href: '/app/facility-staff', permission: 'facility.staff.manage' },
  { id: 'notifications', labelKey: 'nav.notifications', href: '/app/notifications', permission: null },
  { id: 'audit', labelKey: 'nav.audit', href: '/app/admin/audit', permission: 'audit.read' },
  { id: 'admin', labelKey: 'nav.admin', href: '/app/admin', permission: 'admin.oversight' },
  { id: 'settings', labelKey: 'nav.settings', href: '/app/settings', permission: 'session.context.read' }
]);

function hasPermission(permissions, item) {
  if (!item.permission && !item.anyPermission) return true;
  if (item.permission && permissions.has(item.permission)) return true;
  if (item.anyPermission?.some(permission => permissions.has(permission))) return true;
  return false;
}

export function buildApplicationShell({
  sessionContext,
  width,
  locale
}) {
  if (!sessionContext?.account?.id) {
    throw new TypeError('registered sessionContext with account is required');
  }

  const permissions = new Set(sessionContext.permissions ?? []);
  const roleContexts = (sessionContext.roles ?? []).map(item => item.role);
  const resolvedLocale = normalizeLocale(locale ?? sessionContext.account.preferredLocale);

  return {
    platform: 'MEDIDOCTA',
    singleApplication: true,
    accountId: sessionContext.account.id,
    locale: resolvedLocale,
    roleContexts,
    facilityMemberships: sessionContext.facilityMemberships ?? [],
    doctorAffiliations: sessionContext.doctorAffiliations ?? [],
    navigation: NAV_ITEMS.filter(item => hasPermission(permissions, item)),
    responsive: responsiveContract(width),
    canonicalApi: {
      base: '/v1',
      appointmentResource: '/v1/appointments/:appointmentId',
      sessionContext: '/v1/session/context',
      deviceSpecificBusinessApi: false
    }
  };
}
