import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessFacilityProfile,
  requireDoctorProfileAccess
} from '../src/modules/profiles/profile.authorization.js';

test('registration account may read only when the role grants the requested permission', () => {
  const facility = { id: 'facility-1', registrationAccountId: 'account-1' };
  const context = {
    account: { id: 'account-1' },
    permissions: ['facility.profile.read'],
    facilityMemberships: []
  };
  assert.equal(canAccessFacilityProfile(context, facility, 'facility.profile.read'), true);
  assert.equal(canAccessFacilityProfile(context, facility, 'facility.profile.update'), false);
});

test('facility membership permission is resource-scoped', () => {
  const context = {
    account: { id: 'account-other' },
    permissions: ['facility.profile.update'],
    facilityMemberships: [
      { facilityId: 'facility-a', permissions: ['facility.profile.update'] }
    ]
  };
  assert.equal(canAccessFacilityProfile(context, { id: 'facility-a', registrationAccountId: 'x' }, 'facility.profile.update'), true);
  assert.equal(canAccessFacilityProfile(context, { id: 'facility-b', registrationAccountId: 'x' }, 'facility.profile.update'), false);
});

test('doctor access requires a canonical doctor profile', () => {
  assert.throws(() => requireDoctorProfileAccess({
    doctorProfileId: null,
    permissions: ['profile.doctor.read']
  }, 'profile.doctor.read'), error => error.code === 'DOCTOR_PROFILE_NOT_FOUND');
});
