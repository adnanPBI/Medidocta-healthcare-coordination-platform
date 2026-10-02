import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { appendAvailabilityRevisionForAuthorizedActor } from '../src/modules/availability/availability.service.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

async function bootstrap(app, subject, role) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/accounts/bootstrap',
    headers: {
      'x-dev-sub': subject,
      'x-dev-email': `${subject}@example.test`
    },
    payload: { role, preferredLocale: 'fr' }
  });
  assert.equal(response.statusCode, 201);
  return response.json().context;
}

async function configureSchedule(pool, {
  affiliationId,
  actorAccountId,
  expectedVersion = 0,
  exceptions = []
}) {
  return appendAvailabilityRevisionForAuthorizedActor(pool, {
    affiliationId,
    actorAccountId,
    expectedVersion,
    timezoneName: 'Africa/Douala',
    recurringRules: [{
      ruleKey: 'monday-clinic',
      isoWeekday: 1,
      localStart: '09:00',
      localEnd: '12:00',
      metadata: { purpose: 'integration-test' }
    }],
    exceptions,
    metadata: { source: 'milestone-06-integration' }
  });
}

function bookingPayload(affiliationId, scheduleRevisionId, startsAt, endsAt, subjectPatientProfileId) {
  return {
    affiliationId,
    scheduleRevisionId,
    startsAt,
    endsAt,
    ...(subjectPatientProfileId ? { subjectPatientProfileId } : {})
  };
}

async function postBooking(app, subject, key, payload) {
  return app.inject({
    method: 'POST',
    url: '/v1/bookings/appointments',
    headers: {
      'x-dev-sub': subject,
      'content-type': 'application/json',
      'idempotency-key': key
    },
    payload
  });
}

integration('transactional booking commits ONE canonical Appointment with idempotency, occupancy and outbox', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = await buildApp({
    config: {
      nodeEnv: 'test',
      authMode: 'dev',
      corsOrigins: ['http://localhost:4173'],
      oidc: null
    },
    pool
  });
  await app.ready();

  const suffix = randomUUID();
  const patient1Sub = `booking-patient-1-${suffix}`;
  const patient2Sub = `booking-patient-2-${suffix}`;
  const patient3Sub = `booking-patient-3-${suffix}`;
  const doctorSub = `booking-doctor-${suffix}`;
  const facilityASub = `booking-facility-a-${suffix}`;
  const facilityBSub = `booking-facility-b-${suffix}`;
  const staffASub = `booking-staff-a-${suffix}`;

  try {
    const patient1 = await bootstrap(app, patient1Sub, 'PATIENT');
    const patient2 = await bootstrap(app, patient2Sub, 'PATIENT');
    const patient3 = await bootstrap(app, patient3Sub, 'PATIENT');
    const doctor = await bootstrap(app, doctorSub, 'DOCTOR');
    const facilityA = await bootstrap(app, facilityASub, 'FACILITY');
    const facilityB = await bootstrap(app, facilityBSub, 'FACILITY');
    const staffA = await bootstrap(app, staffASub, 'PATIENT');

    const facilityAId = facilityA.registeredFacilities[0].facilityId;
    const facilityBId = facilityB.registeredFacilities[0].facilityId;

    await pool.query('update doctor_profiles set display_name = $1 where id = $2', [
      'Booking Doctor',
      doctor.doctorProfileId
    ]);
    await pool.query('update healthcare_facilities set display_name = $1 where id = $2', [
      'Booking Facility A',
      facilityAId
    ]);
    await pool.query('update healthcare_facilities set display_name = $1 where id = $2', [
      'Booking Facility B',
      facilityBId
    ]);

    const bundle = await pool.query(`
      insert into facility_permission_bundles(facility_id, code, name)
      values ($1, 'TEST_APPOINTMENT_READ', 'Test appointment read')
      returning id
    `, [facilityAId]);
    await pool.query(
      'insert into facility_bundle_permissions(bundle_id, permission_code) values ($1, $2)',
      [bundle.rows[0].id, 'appointment.read']
    );
    await pool.query(`
      insert into facility_staff_memberships(facility_id, account_id, bundle_id, status)
      values ($1, $2, $3, 'ACTIVE')
    `, [facilityAId, staffA.account.id, bundle.rows[0].id]);

    const affiliationAResult = await pool.query(`
      insert into doctor_facility_affiliations(
        doctor_id, facility_id, status, booking_enabled
      )
      values ($1, $2, 'PENDING', true)
      returning id
    `, [doctor.doctorProfileId, facilityAId]);
    const affiliationAId = affiliationAResult.rows[0].id;

    const affiliationBResult = await pool.query(`
      insert into doctor_facility_affiliations(
        doctor_id, facility_id, status, booking_enabled
      )
      values ($1, $2, 'PENDING', true)
      returning id
    `, [doctor.doctorProfileId, facilityBId]);
    const affiliationBId = affiliationBResult.rows[0].id;

    const scheduleA1 = await configureSchedule(pool, {
      affiliationId: affiliationAId,
      actorAccountId: doctor.account.id
    });
    const scheduleB1 = await configureSchedule(pool, {
      affiliationId: affiliationBId,
      actorAccountId: doctor.account.id
    });

    const firstPayload = bookingPayload(
      affiliationAId,
      scheduleA1.latestRevision.id,
      '2026-10-05T08:00:00Z',
      '2026-10-05T08:30:00Z'
    );

    const first = await postBooking(
      app,
      patient1Sub,
      `booking:first:${suffix}`,
      firstPayload
    );
    assert.equal(first.statusCode, 201);
    const firstBody = first.json();
    assert.equal(firstBody.idempotentReplay, false);
    const appointmentId = firstBody.appointment.id;
    assert.equal(firstBody.appointment.patientProfileId, patient1.patientProfileId);
    assert.equal(firstBody.appointment.doctorId, doctor.doctorProfileId);
    assert.equal(firstBody.appointment.facilityId, facilityAId);
    assert.equal(firstBody.appointment.affiliationId, affiliationAId);
    assert.equal(firstBody.appointment.scheduleRevisionId, scheduleA1.latestRevision.id);

    const replay = await postBooking(
      app,
      patient1Sub,
      `booking:first:${suffix}`,
      firstPayload
    );
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().idempotentReplay, true);
    assert.equal(replay.json().appointment.id, appointmentId);

    const changedPayloadSameKey = await postBooking(
      app,
      patient1Sub,
      `booking:first:${suffix}`,
      bookingPayload(
        affiliationAId,
        scheduleA1.latestRevision.id,
        '2026-10-05T08:30:00Z',
        '2026-10-05T09:00:00Z'
      )
    );
    assert.equal(changedPayloadSameKey.statusCode, 409);
    assert.equal(changedPayloadSameKey.json().error, 'IDEMPOTENCY_KEY_REUSE');

    const crossFacilityOverlap = await postBooking(
      app,
      patient2Sub,
      `booking:cross-facility:${suffix}`,
      bookingPayload(
        affiliationBId,
        scheduleB1.latestRevision.id,
        '2026-10-05T08:15:00Z',
        '2026-10-05T08:45:00Z'
      )
    );
    assert.equal(crossFacilityOverlap.statusCode, 409);
    assert.equal(crossFacilityOverlap.json().error, 'BOOKING_CONFLICT');

    const facilityBAppointments = await pool.query(
      'select id from appointments where facility_id = $1',
      [facilityBId]
    );
    assert.equal(facilityBAppointments.rowCount, 0);

    const concurrentPayload = bookingPayload(
      affiliationAId,
      scheduleA1.latestRevision.id,
      '2026-10-05T09:00:00Z',
      '2026-10-05T09:30:00Z'
    );
    const [raceA, raceB] = await Promise.all([
      postBooking(app, patient2Sub, `booking:race-a:${suffix}`, concurrentPayload),
      postBooking(app, patient3Sub, `booking:race-b:${suffix}`, concurrentPayload)
    ]);
    assert.deepEqual(
      [raceA.statusCode, raceB.statusCode].sort((a, b) => a - b),
      [201, 409]
    );
    const conflictResponse = raceA.statusCode === 409 ? raceA : raceB;
    assert.equal(conflictResponse.json().error, 'BOOKING_CONFLICT');

    const raceCount = await pool.query(`
      select id
      from appointments
      where doctor_id = $1
        and starts_at = $2::timestamptz
        and ends_at = $3::timestamptz
    `, [
      doctor.doctorProfileId,
      '2026-10-05T09:00:00Z',
      '2026-10-05T09:30:00Z'
    ]);
    assert.equal(raceCount.rowCount, 1);

    const patientRead = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointmentId}`,
      headers: { 'x-dev-sub': patient1Sub }
    });
    assert.equal(patientRead.statusCode, 200);
    assert.equal(patientRead.json().id, appointmentId);

    const doctorRead = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointmentId}`,
      headers: { 'x-dev-sub': doctorSub }
    });
    assert.equal(doctorRead.statusCode, 200);
    assert.equal(doctorRead.json().id, appointmentId);

    const facilityStaffRead = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointmentId}`,
      headers: { 'x-dev-sub': staffASub }
    });
    assert.equal(facilityStaffRead.statusCode, 200);
    assert.equal(facilityStaffRead.json().id, appointmentId);

    const facilityRegistrationAloneDenied = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointmentId}`,
      headers: { 'x-dev-sub': facilityASub }
    });
    assert.equal(facilityRegistrationAloneDenied.statusCode, 403);

    const unrelatedPatientDenied = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointmentId}`,
      headers: { 'x-dev-sub': patient2Sub }
    });
    assert.equal(unrelatedPatientDenied.statusCode, 403);

    const eventRead = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointmentId}/events`,
      headers: { 'x-dev-sub': patient1Sub }
    });
    assert.equal(eventRead.statusCode, 200);
    assert.equal(eventRead.json().items.length, 1);
    assert.equal(eventRead.json().items[0].eventCode, 'APPOINTMENT_CREATED');

    const outbox = await pool.query(`
      select event_type, status, payload
      from outbox_events
      where aggregate_type = 'APPOINTMENT' and aggregate_id = $1
    `, [appointmentId]);
    assert.equal(outbox.rowCount, 1);
    assert.equal(outbox.rows[0].event_type, 'APPOINTMENT_CREATED');
    assert.equal(outbox.rows[0].status, 'PENDING');

    const occupancy = await pool.query(`
      select doctor_id, source_type, source_id
      from doctor_occupancy_intervals
      where source_type = 'APPOINTMENT' and source_id = $1
    `, [appointmentId]);
    assert.equal(occupancy.rowCount, 1);
    assert.equal(occupancy.rows[0].doctor_id, doctor.doctorProfileId);

    const otherSubject = await postBooking(
      app,
      patient1Sub,
      `booking:other-subject:${suffix}`,
      bookingPayload(
        affiliationAId,
        scheduleA1.latestRevision.id,
        '2026-10-05T09:30:00Z',
        '2026-10-05T10:00:00Z',
        patient2.patientProfileId
      )
    );
    assert.equal(otherSubject.statusCode, 409);
    assert.equal(otherSubject.json().error, 'BOOKING_FOR_ANOTHER_PERSON_NOT_ENABLED');

    const scheduleA2 = await configureSchedule(pool, {
      affiliationId: affiliationAId,
      actorAccountId: doctor.account.id,
      expectedVersion: 1
    });

    const staleProjectionBooking = await postBooking(
      app,
      patient3Sub,
      `booking:stale:${suffix}`,
      bookingPayload(
        affiliationAId,
        scheduleA1.latestRevision.id,
        '2026-10-05T09:30:00Z',
        '2026-10-05T10:00:00Z'
      )
    );
    assert.equal(staleProjectionBooking.statusCode, 409);
    assert.equal(staleProjectionBooking.json().error, 'AVAILABILITY_VERSION_CONFLICT');

    const scheduleA3 = await configureSchedule(pool, {
      affiliationId: affiliationAId,
      actorAccountId: doctor.account.id,
      expectedVersion: 2,
      exceptions: [{
        exceptionKey: 'unresolved-exception',
        startsAt: '2026-10-05T10:00:00Z',
        endsAt: '2026-10-05T10:30:00Z',
        kindCode: 'UNINTERPRETED',
        metadata: { precedence: 'PRODUCT_DECISION_REQUIRED' }
      }]
    });

    const exceptionOverlap = await postBooking(
      app,
      patient3Sub,
      `booking:exception:${suffix}`,
      bookingPayload(
        affiliationAId,
        scheduleA3.latestRevision.id,
        '2026-10-05T10:00:00Z',
        '2026-10-05T10:30:00Z'
      )
    );
    assert.equal(exceptionOverlap.statusCode, 409);
    assert.equal(exceptionOverlap.json().error, 'BOOKING_EXCEPTION_POLICY_UNRESOLVED');

    const canonicalCount = await pool.query(
      'select count(*)::integer as count from appointments where patient_profile_id = $1 and id = $2',
      [patient1.patientProfileId, appointmentId]
    );
    assert.equal(canonicalCount.rows[0].count, 1);

    const idempotencyCount = await pool.query(`
      select count(*)::integer as count
      from booking_idempotency
      where account_id = $1
        and idempotency_key = $2
        and status = 'COMPLETE'
        and appointment_id = $3
    `, [patient1.account.id, `booking:first:${suffix}`, appointmentId]);
    assert.equal(idempotencyCount.rows[0].count, 1);
  } finally {
    await app.close();
    await pool.end();
  }
});
