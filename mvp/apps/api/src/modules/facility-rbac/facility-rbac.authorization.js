export function hasPlatformOversight(context) {
  return context?.permissions?.includes('admin.oversight') ?? false;
}

export function getFacilityMembership(context, facilityId) {
  return context?.facilityMemberships?.find(m => m.facilityId === facilityId) ?? null;
}

export function hasFacilityPermission(context, facilityId, permission) {
  if (hasPlatformOversight(context)) return true;
  const membership = getFacilityMembership(context, facilityId);
  return membership?.permissions?.includes(permission) ?? false;
}

export function requireFacilityPermission(context, facilityId, permission) {
  if (hasFacilityPermission(context, facilityId, permission)) return;
  const error = new Error('Facility-scoped permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}
