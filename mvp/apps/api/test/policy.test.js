import test from 'node:test';
import assert from 'node:assert/strict';
import { can, requirePermission } from '../src/modules/authorization/policy.js';

const context = {
  permissions: ['appointment.read', 'availability.update'],
  patientProfileId: 'patient-1',
  doctorProfileId: 'doctor-1',
  facilityMemberships: [
    { facilityId: 'facility-a', permissions: ['appointment.read'] }
  ]
};

test('global permission is recognized', () => {
  assert.equal(can(context, 'appointment.read'), true);
  assert.equal(can(context, 'contract.manage'), false);
});

test('facility scope must match membership and permission', () => {
  assert.equal(can(context, 'appointment.read', { facilityId: 'facility-a' }), true);
  assert.equal(can(context, 'appointment.read', { facilityId: 'facility-b' }), false);
  assert.equal(can(context, 'availability.update', { facilityId: 'facility-a' }), false);
});

test('profile scopes are exact', () => {
  assert.equal(can(context, 'appointment.read', { patientId: 'patient-1' }), true);
  assert.equal(can(context, 'appointment.read', { patientId: 'patient-2' }), false);
});

test('requirePermission throws a stable forbidden error', () => {
  assert.throws(() => requirePermission(context, 'contract.manage'), error => {
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.statusCode, 403);
    return true;
  });
});
