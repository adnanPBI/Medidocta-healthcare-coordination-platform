import { resolveRequestLocale } from '../localization/localization.js';
import {
  getDoctorProfile,
  getFacilityProfile,
  updateDoctorProfile,
  updateFacilityProfile
} from './profile.service.js';
import {
  requireDoctorProfileAccess,
  requireFacilityProfileAccess
} from './profile.authorization.js';

function localeFor(request) {
  return resolveRequestLocale(request);
}

export async function registerProfileRoutes(app, deps) {
  app.get('/v1/doctors/me/profile', { preHandler: deps.requireRegisteredContext }, async request => {
    requireDoctorProfileAccess(request.context, 'profile.doctor.read');
    return getDoctorProfile(deps.pool, request.context.doctorProfileId, localeFor(request));
  });

  app.patch('/v1/doctors/me/profile', { preHandler: deps.requireRegisteredContext }, async request => {
    requireDoctorProfileAccess(request.context, 'profile.doctor.update');
    return updateDoctorProfile(
      deps.pool,
      request.context.account.id,
      request.context.doctorProfileId,
      request.body ?? {},
      localeFor(request)
    );
  });

  app.get('/v1/facilities/:facilityId/profile', { preHandler: deps.requireRegisteredContext }, async request => {
    const profile = await getFacilityProfile(deps.pool, request.params.facilityId, localeFor(request));
    requireFacilityProfileAccess(request.context, profile, 'facility.profile.read');
    const { registrationAccountId, ...safeProfile } = profile;
    return safeProfile;
  });

  app.patch('/v1/facilities/:facilityId/profile', { preHandler: deps.requireRegisteredContext }, async request => {
    const profile = await getFacilityProfile(deps.pool, request.params.facilityId, localeFor(request));
    requireFacilityProfileAccess(request.context, profile, 'facility.profile.update');
    const updated = await updateFacilityProfile(
      deps.pool,
      request.context.account.id,
      request.params.facilityId,
      request.body ?? {},
      localeFor(request)
    );
    const { registrationAccountId, ...safeProfile } = updated;
    return safeProfile;
  });
}
