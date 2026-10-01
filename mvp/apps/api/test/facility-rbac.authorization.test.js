import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFacilityMembership,
  hasFacilityPermission,
  hasPlatformOversight,
  requireFacilityPermission
} from '../src/modules/facility-rbac/facility-rbac.authorization.js';

const context = {
  permissions: ['facility.staff.read', 'admin.none'],
  facilityMemberships: [
    {
      facilityId: 'facility-a',
      permissions: ['facility.staff.read', 'facility.bundle.read']
    }
  ]
};

test('Facility permissions are exact to membership resource scope', () => {
  assert.equal(hasFacilityPermission(context, 'facility-a', 'facility.staff.read'), true);
  assert.equal(hasFacilityPermission(context, 'facility-b', 'facility.staff.read'), false);
  assert.equal(hasFacilityPermission(context, 'facility-a', 'facility.staff.manage'), false);
});

test('membership lookup returns only the matching Facility relationship', () => {
  assert.equal(getFacilityMembership(context, 'facility-a')?.facilityId, 'facility-a');
  assert.equal(getFacilityMembership(context, 'facility-b'), null);
});

test('platform oversight is explicit and not inferred from another permission', () => {
  assert.equal(hasPlatformOversight(context), false);
  assert.equal(hasPlatformOversight({ permissions: ['admin.oversight'] }), true);
});

test('requireFacilityPermission returns a stable forbidden error', () => {
  assert.throws(
    () => requireFacilityPermission(context, 'facility-b', 'facility.staff.read'),
    error => error.code === 'FORBIDDEN' && error.statusCode === 403
  );
});
