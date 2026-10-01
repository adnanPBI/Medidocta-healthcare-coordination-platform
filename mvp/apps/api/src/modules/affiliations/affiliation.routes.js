import {
  requireAffiliationRead,
  requireContractRead
} from './affiliation.authorization.js';
import {
  getAffiliation,
  getContractThread,
  listContractRevisions,
  listDoctorAffiliations,
  listFacilityAffiliations
} from './affiliation.service.js';
import { requireFacilityPermission } from '../facility-rbac/facility-rbac.authorization.js';

function parseLimit(value) {
  if (value === undefined) return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    const error = new Error('limit must be an integer from 1 to 100');
    error.statusCode = 422;
    error.code = 'INVALID_LIMIT';
    throw error;
  }
  return parsed;
}

export async function registerAffiliationRoutes(app, deps) {
  app.get('/v1/doctors/me/affiliations', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    if (!request.context.doctorProfileId) {
      const error = new Error('Doctor profile not found for this account');
      error.statusCode = 404;
      error.code = 'DOCTOR_PROFILE_NOT_FOUND';
      throw error;
    }
    return {
      doctorId: request.context.doctorProfileId,
      items: await listDoctorAffiliations(deps.pool, request.context.doctorProfileId)
    };
  });

  app.get('/v1/facilities/:facilityId/affiliations', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const facilityId = request.params.facilityId;
    requireFacilityPermission(request.context, facilityId, 'affiliation.read');
    return {
      facilityId,
      items: await listFacilityAffiliations(deps.pool, facilityId)
    };
  });

  app.get('/v1/affiliations/:affiliationId', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const affiliation = await getAffiliation(deps.pool, request.params.affiliationId);
    requireAffiliationRead(request.context, affiliation);
    return affiliation;
  });

  app.get('/v1/affiliations/:affiliationId/contract', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const affiliation = await getAffiliation(deps.pool, request.params.affiliationId);
    requireContractRead(request.context, affiliation);
    return {
      affiliation,
      contract: await getContractThread(deps.pool, affiliation.id)
    };
  });

  app.get('/v1/affiliations/:affiliationId/contract/revisions', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const affiliation = await getAffiliation(deps.pool, request.params.affiliationId);
    requireContractRead(request.context, affiliation);
    return {
      affiliationId: affiliation.id,
      items: await listContractRevisions(
        deps.pool,
        affiliation.id,
        parseLimit(request.query?.limit)
      )
    };
  });
}
