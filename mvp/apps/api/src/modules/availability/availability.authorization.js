import {
  hasFacilityPermission,
  hasPlatformOversight
} from '../facility-rbac/facility-rbac.authorization.js';

export function isDoctorAffiliationParty(context, affiliation) {
  return Boolean(
    context?.doctorProfileId &&
    affiliation?.doctorId &&
    context.doctorProfileId === affiliation.doctorId
  );
}

export function canReadAvailability(context, affiliation) {
  if (!context || !affiliation) return false;
  if (hasPlatformOversight(context)) return true;
  if (isDoctorAffiliationParty(context, affiliation)) return true;
  return hasFacilityPermission(context, affiliation.facilityId, 'availability.read');
}

export function requireAvailabilityRead(context, affiliation) {
  if (canReadAvailability(context, affiliation)) return;
  const error = new Error('Availability permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}
