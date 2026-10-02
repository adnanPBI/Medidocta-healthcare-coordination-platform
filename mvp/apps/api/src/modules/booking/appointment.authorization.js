import {
  hasFacilityPermission,
  hasPlatformOversight
} from '../facility-rbac/facility-rbac.authorization.js';

export function canReadAppointment(context, appointment) {
  if (!context || !appointment) return false;
  if (hasPlatformOversight(context)) return true;
  if (
    context.patientProfileId &&
    context.patientProfileId === appointment.patientProfileId
  ) return true;
  if (
    context.doctorProfileId &&
    context.doctorProfileId === appointment.doctorId
  ) return true;
  return hasFacilityPermission(
    context,
    appointment.facilityId,
    'appointment.read'
  );
}

export function requireAppointmentRead(context, appointment) {
  if (canReadAppointment(context, appointment)) return;
  const error = new Error('Appointment permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}

export function requireSelfPatientBooking(context, requestedSubjectPatientId) {
  if (!context?.permissions?.includes('appointment.create') || !context.patientProfileId) {
    const error = new Error('Patient booking permission required');
    error.statusCode = 403;
    error.code = 'FORBIDDEN';
    throw error;
  }

  if (
    requestedSubjectPatientId &&
    requestedSubjectPatientId !== context.patientProfileId
  ) {
    const error = new Error('Booking for another person is not enabled until product policy is approved');
    error.statusCode = 409;
    error.code = 'BOOKING_FOR_ANOTHER_PERSON_NOT_ENABLED';
    throw error;
  }

  return context.patientProfileId;
}
