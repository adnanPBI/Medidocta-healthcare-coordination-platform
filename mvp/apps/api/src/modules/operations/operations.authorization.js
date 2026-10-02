import {
  hasFacilityPermission,
  hasPlatformOversight
} from '../facility-rbac/facility-rbac.authorization.js';

export function canReadAppointmentOperations(context, appointment) {
  if (!context || !appointment) return false;
  if (hasPlatformOversight(context)) return true;
  if (
    context.doctorProfileId &&
    context.doctorProfileId === appointment.doctorId
  ) return true;
  return hasFacilityPermission(
    context,
    appointment.facilityId,
    'appointment.operations.read'
  );
}

export function requireAppointmentOperationsRead(context, appointment) {
  if (canReadAppointmentOperations(context, appointment)) return;
  const error = new Error('Appointment operations permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}

export function requireReceptionRead(context, facilityId) {
  if (
    hasPlatformOversight(context) ||
    hasFacilityPermission(context, facilityId, 'facility.reception.read')
  ) return;
  const error = new Error('Facility reception permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}

export function requireRoomRead(context, facilityId) {
  if (
    hasPlatformOversight(context) ||
    hasFacilityPermission(context, facilityId, 'room.read')
  ) return;
  const error = new Error('Facility room permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}
