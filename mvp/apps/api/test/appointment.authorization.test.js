import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReadAppointment,
  requireSelfPatientBooking
} from '../src/modules/booking/appointment.authorization.js';

const appointment = {
  patientProfileId: 'patient-1',
  doctorId: 'doctor-1',
  facilityId: 'facility-a'
};

test('the same canonical Appointment is readable by its Patient and Doctor parties', () => {
  assert.equal(canReadAppointment({
    patientProfileId: 'patient-1',
    permissions: [],
    facilityMemberships: []
  }, appointment), true);

  assert.equal(canReadAppointment({
    doctorProfileId: 'doctor-1',
    permissions: [],
    facilityMemberships: []
  }, appointment), true);
});

test('Facility access is exact to appointment.read resource scope', () => {
  assert.equal(canReadAppointment({
    permissions: ['appointment.read'],
    facilityMemberships: [{
      facilityId: 'facility-a',
      permissions: ['appointment.read']
    }]
  }, appointment), true);

  assert.equal(canReadAppointment({
    permissions: ['appointment.read'],
    facilityMemberships: [{
      facilityId: 'facility-b',
      permissions: ['appointment.read']
    }]
  }, appointment), false);
});

test('booking-for-another-person is blocked while DR-003 is unresolved', () => {
  const context = {
    patientProfileId: 'patient-1',
    permissions: ['appointment.create']
  };
  assert.equal(requireSelfPatientBooking(context, null), 'patient-1');
  assert.equal(requireSelfPatientBooking(context, 'patient-1'), 'patient-1');
  assert.throws(
    () => requireSelfPatientBooking(context, 'patient-2'),
    error => error.code === 'BOOKING_FOR_ANOTHER_PERSON_NOT_ENABLED'
  );
});
