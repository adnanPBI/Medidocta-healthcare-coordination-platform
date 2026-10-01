import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReadAffiliation,
  canReadContract,
  isDoctorParty
} from '../src/modules/affiliations/affiliation.authorization.js';

const affiliation = { doctorId: 'doctor-1', facilityId: 'facility-a' };

test('Doctor party may read its own affiliation and contract', () => {
  const context = { doctorProfileId: 'doctor-1', permissions: [], facilityMemberships: [] };
  assert.equal(isDoctorParty(context, affiliation), true);
  assert.equal(canReadAffiliation(context, affiliation), true);
  assert.equal(canReadContract(context, affiliation), true);
});

test('another Doctor is not treated as a party', () => {
  const context = { doctorProfileId: 'doctor-2', permissions: ['affiliation.read'], facilityMemberships: [] };
  assert.equal(isDoctorParty(context, affiliation), false);
  assert.equal(canReadAffiliation(context, affiliation), false);
});

test('Facility staff access is exact to Facility and permission', () => {
  const context = {
    permissions: ['affiliation.read', 'contract.read'],
    facilityMemberships: [{
      facilityId: 'facility-a',
      permissions: ['affiliation.read', 'contract.read']
    }]
  };
  assert.equal(canReadAffiliation(context, affiliation), true);
  assert.equal(canReadContract(context, affiliation), true);
  assert.equal(canReadAffiliation(context, { ...affiliation, facilityId: 'facility-b' }), false);
});

test('platform oversight remains explicit', () => {
  const context = { permissions: ['admin.oversight'], facilityMemberships: [] };
  assert.equal(canReadAffiliation(context, affiliation), true);
  assert.equal(canReadContract(context, affiliation), true);
});
