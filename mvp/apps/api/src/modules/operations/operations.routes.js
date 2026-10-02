import { getAppointment } from '../booking/booking.service.js';
import {
  requireAppointmentOperationsRead,
  requireReceptionRead,
  requireRoomRead
} from './operations.authorization.js';
import {
  getAppointmentOperations,
  listFacilityReceptionAppointments,
  listFacilityRoomAllocations,
  listFacilityRooms
} from './operations.service.js';
import {
  validateOperationalWindow,
  validateOperationResourceId
} from './operations.validation.js';

export async function registerOperationsRoutes(app, deps) {
  app.get('/v1/appointments/:appointmentId/operations', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const appointmentId = validateOperationResourceId(
      request.params.appointmentId,
      'appointmentId'
    );
    const appointment = await getAppointment(deps.pool, appointmentId);
    requireAppointmentOperationsRead(request.context, appointment);
    return getAppointmentOperations(deps.pool, appointmentId);
  });

  app.get('/v1/facilities/:facilityId/reception/appointments', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = validateOperationResourceId(
      request.params.facilityId,
      'facilityId'
    );
    requireReceptionRead(request.context, facilityId);
    const { from, to } = validateOperationalWindow(request.query ?? {});
    return listFacilityReceptionAppointments(deps.pool, facilityId, from, to);
  });

  app.get('/v1/facilities/:facilityId/rooms', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = validateOperationResourceId(
      request.params.facilityId,
      'facilityId'
    );
    requireRoomRead(request.context, facilityId);
    return {
      facilityId,
      items: await listFacilityRooms(deps.pool, facilityId)
    };
  });

  app.get('/v1/facilities/:facilityId/rooms/allocations', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = validateOperationResourceId(
      request.params.facilityId,
      'facilityId'
    );
    requireRoomRead(request.context, facilityId);
    const { from, to } = validateOperationalWindow(request.query ?? {});
    return listFacilityRoomAllocations(deps.pool, facilityId, from, to);
  });
}
