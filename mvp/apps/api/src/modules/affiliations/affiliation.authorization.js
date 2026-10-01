import {
  hasFacilityPermission,
  hasPlatformOversight
} from '../facility-rbac/facility-rbac.authorization.js';

export function isDoctorParty(context, affiliation) {
  return Boolean(
    context?.doctorProfileId &&
    affiliation?.doctorId &&
    context.doctorProfileId === affiliation.doctorId
  );
}

export function canReadAffiliation(context, affiliation) {
  if (!context || !affiliation) return false;
  if (hasPlatformOversight(context)) return true;
  if (isDoctorParty(context, affiliation)) return true;
  return hasFacilityPermission(context, affiliation.facilityId, 'affiliation.read');
}

export function canReadContract(context, affiliation) {
  if (!context || !affiliation) return false;
  if (hasPlatformOversight(context)) return true;
  if (isDoctorParty(context, affiliation)) return true;
  return hasFacilityPermission(context, affiliation.facilityId, 'contract.read');
}

export function requireAffiliationRead(context, affiliation) {
  if (canReadAffiliation(context, affiliation)) return;
  const error = new Error('Affiliation permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}

export function requireContractRead(context, affiliation) {
  if (canReadContract(context, affiliation)) return;
  const error = new Error('Contract permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}
