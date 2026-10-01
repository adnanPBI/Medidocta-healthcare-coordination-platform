export function can(context, permission, scope = {}) {
  if (!context || !Array.isArray(context.permissions)) return false;
  if (!context.permissions.includes(permission)) return false;

  if (scope.facilityId) {
    return context.facilityMemberships?.some(m =>
      m.facilityId === scope.facilityId && m.permissions.includes(permission)
    ) ?? false;
  }
  if (scope.doctorId && context.doctorProfileId !== scope.doctorId) return false;
  if (scope.patientId && context.patientProfileId !== scope.patientId) return false;
  return true;
}

export function requirePermission(context, permission, scope = {}) {
  if (can(context, permission, scope)) return;
  const error = new Error('Permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}
