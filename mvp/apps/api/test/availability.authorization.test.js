import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReadAvailability,
  isDoctorAffiliationParty,
  requireAvailabilityRead
} from '../src/modules/availability/availability.authorization.js';

const affiliation = { doctorId: 'doctor-1', facilityId: 'facility-a' };

test('Doctor party may read its own affiliation availability', () => {
  const context = { doctorProfileId: 'doctor-1', permissions: [], facilityMemberships: [] };
  assert.equal(isDoctorAffiliationParty(context, affiliation), true);
  assert.equal(canReadAvailability(context, affiliation), true);
});

test('Facility availability permission is exact to Facility scope', () => {
  const context = {
    permissions: ['availability.read'],
    facilityMemberships: [{
      facilityId: 'facility-a',
      permissions: ['availability.read']
    }]
  };
  assert.equal(canReadAvailability(context, affiliation), true);
  assert.equal(canReadAvailability(context, { ...affiliation, facilityId: 'facility-b' }), false);
});

test('unrelated Doctor is denied even if another top-level permission exists', () => {
  const context = {
    doctorProfileId: 'doctor-2',
    permissions: ['availability.read'],
    facilityMemberships: []
  };
  assert.equal(canReadAvailability(context, affiliation), false);
  assert.throws(
    () => requireAvailabilityRead(context, affiliation),
    error => error.code === 'FORBIDDEN' && error.statusCode === 403
  );
});

test('platform oversight is explicit', () => {
  const context = { permissions: ['admin.oversight'], facilityMemberships: [] };
  assert.equal(canReadAvailability(context, affiliation), true);
});
