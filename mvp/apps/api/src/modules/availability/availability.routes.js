import { getAffiliation } from '../affiliations/affiliation.service.js';
import { requireAvailabilityRead } from './availability.authorization.js';
import {
  getAvailabilitySchedule,
  projectAvailability
} from './availability.service.js';

export async function registerAvailabilityRoutes(app, deps) {
  app.get('/v1/affiliations/:affiliationId/availability', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const affiliation = await getAffiliation(deps.pool, request.params.affiliationId);
    requireAvailabilityRead(request.context, affiliation);
    return {
      affiliation,
      schedule: await getAvailabilitySchedule(deps.pool, affiliation.id),
      authoritativeForBooking: false
    };
  });

  app.get('/v1/affiliations/:affiliationId/availability/projection', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    const affiliation = await getAffiliation(deps.pool, request.params.affiliationId);
    requireAvailabilityRead(request.context, affiliation);
    return projectAvailability(deps.pool, affiliation, request.query ?? {});
  });
}
