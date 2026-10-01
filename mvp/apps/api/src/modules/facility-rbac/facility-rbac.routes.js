import {
  getFacilityMembership,
  hasPlatformOversight,
  requireFacilityPermission
} from './facility-rbac.authorization.js';
import {
  assertFacilityExists,
  listDelegatablePermissions,
  listFacilityBundles,
  listFacilityStaff
} from './facility-rbac.service.js';

export async function registerFacilityRbacRoutes(app, deps) {
  app.get('/v1/facilities/:facilityId/rbac/delegatable-permissions', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = request.params.facilityId;
    requireFacilityPermission(request.context, facilityId, 'facility.bundle.read');
    await assertFacilityExists(deps.pool, facilityId);
    return { facilityId, items: await listDelegatablePermissions(deps.pool) };
  });

  app.get('/v1/facilities/:facilityId/rbac/me', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = request.params.facilityId;
    await assertFacilityExists(deps.pool, facilityId);
    const membership = getFacilityMembership(request.context, facilityId);
    const registeredFacility = request.context.registeredFacilities?.some(f => f.facilityId === facilityId) ?? false;

    if (!membership && !registeredFacility && !hasPlatformOversight(request.context)) {
      const error = new Error('No relationship to requested Healthcare Facility');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }

    return {
      facilityId,
      platformOversight: hasPlatformOversight(request.context),
      registeredFacility,
      membership: membership ? {
        membershipId: membership.membershipId,
        bundleId: membership.bundleId,
        bundleCode: membership.bundleCode,
        bundleName: membership.bundleName,
        bundleStatus: membership.bundleStatus,
        bundleVersion: membership.bundleVersion,
        status: membership.status,
        version: membership.version
      } : null,
      effectiveFacilityPermissions: membership?.permissions ?? []
    };
  });

  app.get('/v1/facilities/:facilityId/staff', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = request.params.facilityId;
    requireFacilityPermission(request.context, facilityId, 'facility.staff.read');
    return { facilityId, items: await listFacilityStaff(deps.pool, facilityId) };
  });

  app.get('/v1/facilities/:facilityId/permission-bundles', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = request.params.facilityId;
    requireFacilityPermission(request.context, facilityId, 'facility.bundle.read');
    return { facilityId, items: await listFacilityBundles(deps.pool, facilityId) };
  });
}
