import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReadAppointmentOperations,
  requireReceptionRead,
  requireRoomRead
} from '../src/modules/operations/operations.authorization.js';

const appointment = {
  patientProfileId: 'patient-1',
  doctorId: 'doctor-1',
  facilityId: 'facility-a'
};

test('Doctor party may read operational facts for its own Appointment', () => {
  assert.equal(canReadAppointmentOperations({
    doctorProfileId: 'doctor-1',
    permissions: [],
    facilityMemberships: []
  }, appointment), true);
});

test('Patient party is not automatically given internal operational details', () => {
  assert.equal(canReadAppointmentOperations({
    patientProfileId: 'patient-1',
    permissions: ['appointment.read'],
    facilityMemberships: []
  }, appointment), false);
});

test('Facility operational access is exact to Facility permission scope', () => {
  assert.equal(canReadAppointmentOperations({
    permissions: ['appointment.operations.read'],
    facilityMemberships: [{
      facilityId: 'facility-a',
      permissions: ['appointment.operations.read']
    }]
  }, appointment), true);

  assert.equal(canReadAppointmentOperations({
    permissions: ['appointment.operations.read'],
    facilityMemberships: [{
      facilityId: 'facility-b',
      permissions: ['appointment.operations.read']
    }]
  }, appointment), false);
});

test('reception and room reads require their explicit Facility capabilities', () => {
  const context = {
    permissions: ['facility.reception.read', 'room.read'],
    facilityMemberships: [{
      facilityId: 'facility-a',
      permissions: ['facility.reception.read', 'room.read']
    }]
  };
  assert.doesNotThrow(() => requireReceptionRead(context, 'facility-a'));
  assert.doesNotThrow(() => requireRoomRead(context, 'facility-a'));
  assert.throws(
    () => requireReceptionRead(context, 'facility-b'),
    error => error.code === 'FORBIDDEN'
  );
  assert.throws(
    () => requireRoomRead(context, 'facility-b'),
    error => error.code === 'FORBIDDEN'
  );
});
