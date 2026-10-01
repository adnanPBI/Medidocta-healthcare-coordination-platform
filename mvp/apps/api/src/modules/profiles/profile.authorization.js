import { requirePermission } from '../authorization/policy.js';

export function requireDoctorProfileAccess(context, permission) {
  if (!context?.doctorProfileId) {
    const error = new Error('Doctor profile not found for this account');
    error.statusCode = 404;
    error.code = 'DOCTOR_PROFILE_NOT_FOUND';
    throw error;
  }
  requirePermission(context, permission, { doctorId: context.doctorProfileId });
}

export function canAccessFacilityProfile(context, facility, permission) {
  if (!context || !facility) return false;
  if (context.permissions?.includes('admin.oversight')) return true;
  if (!context.permissions?.includes(permission)) return false;

  if (facility.registrationAccountId === context.account?.id) return true;
  return context.facilityMemberships?.some(m =>
    m.facilityId === facility.id &&
    m.permissions.includes(permission)
  ) ?? false;
}

export function requireFacilityProfileAccess(context, facility, permission) {
  if (canAccessFacilityProfile(context, facility, permission)) return;
  const error = new Error('Facility profile permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}
