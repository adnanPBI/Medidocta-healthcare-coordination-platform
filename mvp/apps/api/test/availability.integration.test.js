import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import {
  appendAvailabilityRevisionForAuthorizedActor,
  getAvailabilitySchedule,
  insertDoctorOccupancyIntervalForAuthorizedCommand
} from '../src/modules/availability/availability.service.js';

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

integration('Facility-specific availability projection preserves policy gates and global Doctor occupancy', async () => {
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
  const doctorASub = `availability-doctor-a-${suffix}`;
  const doctorBSub = `availability-doctor-b-${suffix}`;
  const facilityASub = `availability-facility-a-${suffix}`;
  const facilityBSub = `availability-facility-b-${suffix}`;
  const staffSub = `availability-staff-${suffix}`;

  try {
    const doctorA = await bootstrap(app, doctorASub, 'DOCTOR');
    const doctorB = await bootstrap(app, doctorBSub, 'DOCTOR');
    const facilityA = await bootstrap(app, facilityASub, 'FACILITY');
    const facilityB = await bootstrap(app, facilityBSub, 'FACILITY');
    const staff = await bootstrap(app, staffSub, 'PATIENT');

    const facilityAId = facilityA.registeredFacilities[0].facilityId;
    const facilityBId = facilityB.registeredFacilities[0].facilityId;

    const bundleResult = await pool.query(`
      insert into facility_permission_bundles(facility_id, code, name)
      values ($1, 'TEST_AVAILABILITY_READ', 'Test availability read')
      returning id
    `, [facilityAId]);
    const bundleId = bundleResult.rows[0].id;

    await pool.query(
      'insert into facility_bundle_permissions(bundle_id, permission_code) values ($1, $2)',
      [bundleId, 'availability.read']
    );
    await pool.query(`
      insert into facility_staff_memberships(facility_id, account_id, bundle_id, status)
      values ($1, $2, $3, 'ACTIVE')
    `, [facilityAId, staff.account.id, bundleId]);

    const affiliationAResult = await pool.query(`
      insert into doctor_facility_affiliations(doctor_id, facility_id, status)
      values ($1, $2, 'PENDING')
      returning id
    `, [doctorA.doctorProfileId, facilityAId]);
    const affiliationAId = affiliationAResult.rows[0].id;

    const affiliationBResult = await pool.query(`
      insert into doctor_facility_affiliations(doctor_id, facility_id, status)
      values ($1, $2, 'PENDING')
      returning id
    `, [doctorA.doctorProfileId, facilityBId]);
    const affiliationBId = affiliationBResult.rows[0].id;

    const scheduleThreads = await pool.query(
      'select affiliation_id, version from affiliation_availability_schedules where affiliation_id = any($1::uuid[])',
      [[affiliationAId, affiliationBId]]
    );
    assert.equal(scheduleThreads.rowCount, 2);
    assert.ok(scheduleThreads.rows.every(row => row.version === 0));

    const revision1 = await appendAvailabilityRevisionForAuthorizedActor(pool, {
      affiliationId: affiliationAId,
      actorAccountId: doctorA.account.id,
      expectedVersion: 0,
      timezoneName: 'Africa/Douala',
      recurringRules: [{
        ruleKey: 'monday-am',
        isoWeekday: 1,
        localStart: '09:00',
        localEnd: '11:00',
        metadata: { source: 'test-only' }
      }],
      exceptions: [{
        exceptionKey: 'exception-uninterpreted',
        startsAt: '2026-10-05T09:00:00Z',
        endsAt: '2026-10-05T09:30:00Z',
        kindCode: 'CLOSURE_UNINTERPRETED',
        metadata: { precedence: 'PRODUCT_DECISION_REQUIRED' }
      }],
      metadata: { testRevision: 1 }
    });
    assert.equal(revision1.version, 1);
    assert.equal(revision1.latestRevision.timezoneName, 'Africa/Douala');

    await insertDoctorOccupancyIntervalForAuthorizedCommand(pool, {
      doctorId: doctorA.doctorProfileId,
      startsAt: '2026-10-05T08:30:00Z',
      endsAt: '2026-10-05T09:00:00Z',
      sourceType: 'TEST_EXISTING_OCCUPANCY',
      sourceId: randomUUID(),
      metadata: { facilityId: facilityAId }
    });

    await assert.rejects(
      insertDoctorOccupancyIntervalForAuthorizedCommand(pool, {
        doctorId: doctorA.doctorProfileId,
        startsAt: '2026-10-05T08:45:00Z',
        endsAt: '2026-10-05T09:15:00Z',
        sourceType: 'TEST_OTHER_FACILITY_OCCUPANCY',
        sourceId: randomUUID(),
        metadata: { facilityId: facilityBId }
      }),
      error => error.code === 'DOCTOR_OCCUPANCY_CONFLICT' && error.statusCode === 409
    );

    await insertDoctorOccupancyIntervalForAuthorizedCommand(pool, {
      doctorId: doctorB.doctorProfileId,
      startsAt: '2026-10-05T08:45:00Z',
      endsAt: '2026-10-05T09:15:00Z',
      sourceType: 'TEST_DIFFERENT_DOCTOR',
      sourceId: randomUUID()
    });

    const doctorProjection = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationAId}/availability/projection?from=2026-10-05T00%3A00%3A00Z&to=2026-10-06T00%3A00%3A00Z&slotMinutes=30`,
      headers: { 'x-dev-sub': doctorASub }
    });
    assert.equal(doctorProjection.statusCode, 200);
    const projection = doctorProjection.json();
    assert.equal(projection.timezoneName, 'Africa/Douala');
    assert.equal(projection.candidateSlots.length, 4);
    assert.equal(projection.projectionAuthoritative, false);
    assert.equal(projection.policyCompleteness, 'PRODUCT_RULES_PENDING');
    assert.equal(projection.policy.exceptionPrecedenceApplied, false);
    assert.equal(projection.policy.bookingHorizonApplied, false);
    assert.equal(projection.policy.buffersApplied, false);
    assert.ok(projection.candidateSlots.every(slot => slot.bookable === null));

    const occupied = projection.candidateSlots.filter(slot => slot.occupancyConflict);
    assert.equal(occupied.length, 1);
    assert.equal(occupied[0].startsAt, '2026-10-05T08:30:00.000Z');

    const exceptionWindowSlot = projection.candidateSlots.find(
      slot => slot.startsAt === '2026-10-05T09:00:00.000Z'
    );
    assert.equal(exceptionWindowSlot.projectionStatus, 'CANDIDATE');
    assert.equal(projection.exceptions.length, 1);
    assert.equal(projection.exceptions[0].kindCode, 'CLOSURE_UNINTERPRETED');

    const staffProjection = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationAId}/availability/projection?from=2026-10-05T00%3A00%3A00Z&to=2026-10-06T00%3A00%3A00Z&slotMinutes=30`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(staffProjection.statusCode, 200);

    const crossFacilityDenied = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationBId}/availability`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(crossFacilityDenied.statusCode, 403);

    const unrelatedDoctorDenied = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationAId}/availability`,
      headers: { 'x-dev-sub': doctorBSub }
    });
    assert.equal(unrelatedDoctorDenied.statusCode, 403);

    const noScheduleProjection = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationBId}/availability/projection?from=2026-10-05T00%3A00%3A00Z&to=2026-10-06T00%3A00%3A00Z&slotMinutes=30`,
      headers: { 'x-dev-sub': doctorASub }
    });
    assert.equal(noScheduleProjection.statusCode, 200);
    assert.equal(noScheduleProjection.json().policyCompleteness, 'SCHEDULE_NOT_CONFIGURED');
    assert.deepEqual(noScheduleProjection.json().candidateSlots, []);

    const mutationRouteNotExposed = await app.inject({
      method: 'POST',
      url: `/v1/affiliations/${affiliationAId}/availability`,
      headers: {
        'x-dev-sub': doctorASub,
        'content-type': 'application/json'
      },
      payload: {
        expectedVersion: 1,
        timezoneName: 'Africa/Douala',
        recurringRules: [],
        exceptions: []
      }
    });
    assert.equal(mutationRouteNotExposed.statusCode, 404);

    const concurrentEdits = await Promise.allSettled([
      appendAvailabilityRevisionForAuthorizedActor(pool, {
        affiliationId: affiliationAId,
        actorAccountId: doctorA.account.id,
        expectedVersion: 1,
        timezoneName: 'Africa/Douala',
        recurringRules: [{
          ruleKey: 'monday-am',
          isoWeekday: 1,
          localStart: '09:00',
          localEnd: '11:30'
        }],
        exceptions: [],
        metadata: { contender: 'doctor' }
      }),
      appendAvailabilityRevisionForAuthorizedActor(pool, {
        affiliationId: affiliationAId,
        actorAccountId: staff.account.id,
        expectedVersion: 1,
        timezoneName: 'Africa/Douala',
        recurringRules: [{
          ruleKey: 'monday-am',
          isoWeekday: 1,
          localStart: '09:00',
          localEnd: '12:00'
        }],
        exceptions: [],
        metadata: { contender: 'facility' }
      })
    ]);

    assert.equal(concurrentEdits.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = concurrentEdits.find(result => result.status === 'rejected');
    assert.equal(rejected.reason.code, 'AVAILABILITY_VERSION_CONFLICT');

    const finalSchedule = await getAvailabilitySchedule(pool, affiliationAId);
    assert.equal(finalSchedule.version, 2);

    const revisionOneRule = await pool.query(`
      select arr.id
      from availability_recurring_rules arr
      join availability_schedule_revisions asr on asr.id = arr.schedule_revision_id
      join affiliation_availability_schedules aas on aas.id = asr.schedule_id
      where aas.affiliation_id = $1 and asr.revision_number = 1
      limit 1
    `, [affiliationAId]);

    await assert.rejects(
      pool.query(
        'update availability_recurring_rules set local_end = $1::time where id = $2',
        ['12:30:00', revisionOneRule.rows[0].id]
      ),
      error => error.code === '23514'
    );

    const audit = await pool.query(`
      select action_code, metadata
      from audit_events
      where resource_type = 'AFFILIATION_AVAILABILITY'
        and metadata->>'affiliation_id' = $1
      order by created_at
    `, [affiliationAId]);
    assert.equal(audit.rowCount, 2);
    assert.ok(audit.rows.every(row => row.action_code === 'AVAILABILITY_REVISION_APPENDED'));
  } finally {
    await app.close();
    await pool.end();
  }
});
