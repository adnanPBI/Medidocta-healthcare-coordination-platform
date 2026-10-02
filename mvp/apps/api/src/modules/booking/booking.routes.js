import {
  validateCreateBooking,
  validateIdempotencyKey,
  validateResourceId
} from './booking.validation.js';
import {
  requireAppointmentRead,
  requireSelfPatientBooking
} from './appointment.authorization.js';
import { requireFacilityPermission } from '../facility-rbac/facility-rbac.authorization.js';
import {
  appointmentListLimit,
  createAppointmentBooking,
  getAppointment,
  listAppointmentEvents,
  listDoctorAppointments,
  listFacilityAppointments,
  listPatientAppointments
} from './booking.service.js';

function requirePermission(context, permission) {
  if (context?.permissions?.includes(permission)) return;
  const error = new Error('Permission denied');
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}

export async function registerBookingRoutes(app, deps) {
  app.post('/v1/bookings/appointments', {
    preHandler: deps.requireRegisteredContext
  }, async (request, reply) => {
    const idempotencyKey = validateIdempotencyKey(request.headers['idempotency-key']);
    const input = validateCreateBooking(request.body ?? {});
    const patientProfileId = requireSelfPatientBooking(
      request.context,
      input.subjectPatientProfileId
    );

    const result = await createAppointmentBooking(deps.pool, {
      actorAccountId: request.context.account.id,
      patientProfileId,
      idempotencyKey,
      input
    });

    reply.code(result.idempotentReplay ? 200 : 201);
    return result;
  });

  app.get('/v1/appointments/:appointmentId', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const appointmentId = validateResourceId(request.params.appointmentId, 'appointmentId');
    const appointment = await getAppointment(deps.pool, appointmentId);
    requireAppointmentRead(request.context, appointment);
    return appointment;
  });

  app.get('/v1/appointments/:appointmentId/events', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const appointmentId = validateResourceId(request.params.appointmentId, 'appointmentId');
    const appointment = await getAppointment(deps.pool, appointmentId);
    requireAppointmentRead(request.context, appointment);
    return {
      appointmentId,
      items: await listAppointmentEvents(deps.pool, appointmentId)
    };
  });

  app.get('/v1/patients/me/appointments', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requirePermission(request.context, 'appointment.read');
    if (!request.context.patientProfileId) {
      const error = new Error('Patient profile not found for this account');
      error.statusCode = 404;
      error.code = 'PATIENT_PROFILE_NOT_FOUND';
      throw error;
    }
    return {
      patientProfileId: request.context.patientProfileId,
      items: await listPatientAppointments(
        deps.pool,
        request.context.patientProfileId,
        appointmentListLimit(request.query?.limit)
      )
    };
  });

  app.get('/v1/doctors/me/appointments', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requirePermission(request.context, 'appointment.read');
    if (!request.context.doctorProfileId) {
      const error = new Error('Doctor profile not found for this account');
      error.statusCode = 404;
      error.code = 'DOCTOR_PROFILE_NOT_FOUND';
      throw error;
    }
    return {
      doctorId: request.context.doctorProfileId,
      items: await listDoctorAppointments(
        deps.pool,
        request.context.doctorProfileId,
        appointmentListLimit(request.query?.limit)
      )
    };
  });

  app.get('/v1/facilities/:facilityId/appointments', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = validateResourceId(request.params.facilityId, 'facilityId');
    requireFacilityPermission(request.context, facilityId, 'appointment.read');
    return {
      facilityId,
      items: await listFacilityAppointments(
        deps.pool,
        facilityId,
        appointmentListLimit(request.query?.limit)
      )
    };
  });
}
