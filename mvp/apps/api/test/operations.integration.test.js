import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { appendAvailabilityRevisionForAuthorizedActor } from '../src/modules/availability/availability.service.js';
import {
  appendConsultationFactForAuthorizedActor,
  appendRoomAssignmentRevisionForAuthorizedActor,
  createFacilityRoomForAuthorizedActor,
  recordArrivalFactForAuthorizedActor
} from '../src/modules/operations/operations.service.js';

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

async function configureSchedule(pool, affiliationId, actorAccountId) {
  return appendAvailabilityRevisionForAuthorizedActor(pool, {
    affiliationId,
    actorAccountId,
    expectedVersion: 0,
    timezoneName: 'Africa/Douala',
    recurringRules: [{
      ruleKey: 'monday-clinic',
      isoWeekday: 1,
      localStart: '09:00',
      localEnd: '12:00'
    }],
    exceptions: [],
    metadata: { source: 'milestone-07-integration' }
  });
}

async function book(app, subject, key, affiliationId, scheduleRevisionId, startsAt, endsAt) {
  return app.inject({
    method: 'POST',
    url: '/v1/bookings/appointments',
    headers: {
      'x-dev-sub': subject,
      'content-type': 'application/json',
      'idempotency-key': key
    },
    payload: {
      affiliationId,
      scheduleRevisionId,
      startsAt,
      endsAt
    }
  });
}

integration('reception, independent arrivals, room allocation and consultation facts preserve policy gates', async () => {
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
  const patient1Sub = `ops-patient-1-${suffix}`;
  const patient2Sub = `ops-patient-2-${suffix}`;
  const doctor1Sub = `ops-doctor-1-${suffix}`;
  const doctor2Sub = `ops-doctor-2-${suffix}`;
  const facilityASub = `ops-facility-a-${suffix}`;
  const facilityBSub = `ops-facility-b-${suffix}`;
  const staffSub = `ops-staff-${suffix}`;

  try {
    const patient1 = await bootstrap(app, patient1Sub, 'PATIENT');
    const patient2 = await bootstrap(app, patient2Sub, 'PATIENT');
    const doctor1 = await bootstrap(app, doctor1Sub, 'DOCTOR');
    const doctor2 = await bootstrap(app, doctor2Sub, 'DOCTOR');
    const facilityA = await bootstrap(app, facilityASub, 'FACILITY');
    const facilityB = await bootstrap(app, facilityBSub, 'FACILITY');
    const staff = await bootstrap(app, staffSub, 'PATIENT');

    const facilityAId = facilityA.registeredFacilities[0].facilityId;
    const facilityBId = facilityB.registeredFacilities[0].facilityId;

    await pool.query('update doctor_profiles set display_name = $1 where id = $2', [
      'Operations Doctor 1',
      doctor1.doctorProfileId
    ]);
    await pool.query('update doctor_profiles set display_name = $1 where id = $2', [
      'Operations Doctor 2',
      doctor2.doctorProfileId
    ]);

    const bundle = await pool.query(`
      insert into facility_permission_bundles(facility_id, code, name)
      values ($1, 'TEST_RECEPTION_OPERATIONS', 'Test reception operations')
      returning id
    `, [facilityAId]);

    for (const permission of [
      'facility.reception.read',
      'appointment.operations.read',
      'room.read'
    ]) {
      await pool.query(
        'insert into facility_bundle_permissions(bundle_id, permission_code) values ($1, $2)',
        [bundle.rows[0].id, permission]
      );
    }
    await pool.query(`
      insert into facility_staff_memberships(facility_id, account_id, bundle_id, status)
      values ($1, $2, $3, 'ACTIVE')
    `, [facilityAId, staff.account.id, bundle.rows[0].id]);

    const aff1 = await pool.query(`
      insert into doctor_facility_affiliations(
        doctor_id, facility_id, status, booking_enabled
      )
      values ($1, $2, 'PENDING', true)
      returning id
    `, [doctor1.doctorProfileId, facilityAId]);

    const aff2 = await pool.query(`
      insert into doctor_facility_affiliations(
        doctor_id, facility_id, status, booking_enabled
      )
      values ($1, $2, 'PENDING', true)
      returning id
    `, [doctor2.doctorProfileId, facilityAId]);

    const schedule1 = await configureSchedule(pool, aff1.rows[0].id, doctor1.account.id);
    const schedule2 = await configureSchedule(pool, aff2.rows[0].id, doctor2.account.id);

    const booking1 = await book(
      app,
      patient1Sub,
      `ops:booking:1:${suffix}`,
      aff1.rows[0].id,
      schedule1.latestRevision.id,
      '2026-10-05T08:00:00Z',
      '2026-10-05T08:30:00Z'
    );
    assert.equal(booking1.statusCode, 201);
    const appointment1 = booking1.json().appointment;

    const booking2 = await book(
      app,
      patient2Sub,
      `ops:booking:2:${suffix}`,
      aff2.rows[0].id,
      schedule2.latestRevision.id,
      '2026-10-05T08:00:00Z',
      '2026-10-05T08:30:00Z'
    );
    assert.equal(booking2.statusCode, 201);
    const appointment2 = booking2.json().appointment;

    const roomA = await createFacilityRoomForAuthorizedActor(pool, {
      actorAccountId: staff.account.id,
      facilityId: facilityAId,
      code: 'CONSULT-01',
      displayName: 'Consultation Room 1'
    });
    const roomB = await createFacilityRoomForAuthorizedActor(pool, {
      actorAccountId: facilityB.account.id,
      facilityId: facilityBId,
      code: 'OTHER-01',
      displayName: 'Other Facility Room'
    });

    const patientArrival = await recordArrivalFactForAuthorizedActor(pool, {
      appointmentId: appointment1.id,
      actorAccountId: staff.account.id,
      partyKind: 'PATIENT',
      arrivedAt: '2026-10-05T07:50:00Z',
      semanticKey: `arrival:patient:${suffix}`,
      metadata: { source: 'reception-test' }
    });
    assert.equal(patientArrival.idempotentReplay, false);

    const patientArrivalReplay = await recordArrivalFactForAuthorizedActor(pool, {
      appointmentId: appointment1.id,
      actorAccountId: staff.account.id,
      partyKind: 'PATIENT',
      arrivedAt: '2026-10-05T07:51:00Z',
      semanticKey: `arrival:patient:retry:${suffix}`
    });
    assert.equal(patientArrivalReplay.idempotentReplay, true);
    assert.equal(patientArrivalReplay.fact.id, patientArrival.fact.id);

    const doctorArrival = await recordArrivalFactForAuthorizedActor(pool, {
      appointmentId: appointment1.id,
      actorAccountId: doctor1.account.id,
      partyKind: 'DOCTOR',
      arrivedAt: '2026-10-05T07:55:00Z',
      semanticKey: `arrival:doctor:${suffix}`
    });
    assert.equal(doctorArrival.idempotentReplay, false);
    assert.notEqual(doctorArrival.fact.id, patientArrival.fact.id);

    const consultationStart = await appendConsultationFactForAuthorizedActor(pool, {
      appointmentId: appointment1.id,
      actorAccountId: doctor1.account.id,
      factCode: 'CONSULTATION_STARTED',
      occurredAt: '2026-10-05T08:02:00Z',
      semanticKey: `consult:start:${suffix}`
    });
    assert.equal(consultationStart.idempotentReplay, false);

    const consultationStartReplay = await appendConsultationFactForAuthorizedActor(pool, {
      appointmentId: appointment1.id,
      actorAccountId: doctor1.account.id,
      factCode: 'CONSULTATION_STARTED',
      occurredAt: '2026-10-05T08:03:00Z',
      semanticKey: `consult:start:${suffix}`
    });
    assert.equal(consultationStartReplay.idempotentReplay, true);

    const consultationComplete = await appendConsultationFactForAuthorizedActor(pool, {
      appointmentId: appointment1.id,
      actorAccountId: doctor1.account.id,
      factCode: 'CONSULTATION_COMPLETED',
      occurredAt: '2026-10-05T08:25:00Z',
      semanticKey: `consult:complete:${suffix}`
    });
    assert.equal(consultationComplete.idempotentReplay, false);

    const roomAssignment1 = await appendRoomAssignmentRevisionForAuthorizedActor(pool, {
      appointmentId: appointment1.id,
      actorAccountId: staff.account.id,
      roomId: roomA.id,
      expectedVersion: 0
    });
    assert.equal(roomAssignment1.revisionNumber, 1);

    const roomAssignment2 = await appendRoomAssignmentRevisionForAuthorizedActor(pool, {
      appointmentId: appointment2.id,
      actorAccountId: staff.account.id,
      roomId: roomA.id,
      expectedVersion: 0
    });
    assert.equal(roomAssignment2.revisionNumber, 1);

    await assert.rejects(
      appendRoomAssignmentRevisionForAuthorizedActor(pool, {
        appointmentId: appointment1.id,
        actorAccountId: staff.account.id,
        roomId: roomA.id,
        expectedVersion: 0
      }),
      error => error.code === 'ROOM_ASSIGNMENT_VERSION_CONFLICT'
    );

    await assert.rejects(
      appendRoomAssignmentRevisionForAuthorizedActor(pool, {
        appointmentId: appointment1.id,
        actorAccountId: staff.account.id,
        roomId: roomB.id,
        expectedVersion: 1
      }),
      error => error.code === 'ROOM_FACILITY_MISMATCH'
    );

    const doctorOperations = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointment1.id}/operations`,
      headers: { 'x-dev-sub': doctor1Sub }
    });
    assert.equal(doctorOperations.statusCode, 200);
    assert.equal(doctorOperations.json().arrivals.length, 2);
    assert.equal(doctorOperations.json().consultationFacts.length, 2);
    assert.equal(doctorOperations.json().roomAssignment.roomId, roomA.id);
    assert.equal(doctorOperations.json().policy.roomExclusivityApplied, false);

    const patientOperationsDenied = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointment1.id}/operations`,
      headers: { 'x-dev-sub': patient1Sub }
    });
    assert.equal(patientOperationsDenied.statusCode, 403);

    const staffOperations = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${appointment1.id}/operations`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(staffOperations.statusCode, 200);

    const reception = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityAId}/reception/appointments?from=2026-10-05T00%3A00%3A00Z&to=2026-10-06T00%3A00%3A00Z`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(reception.statusCode, 200);
    assert.equal(reception.json().items.length, 2);
    const receptionFirst = reception.json().items.find(item => item.appointmentId === appointment1.id);
    assert.equal(receptionFirst.operations.arrivals.length, 2);
    assert.equal(receptionFirst.operations.roomAssignment.roomId, roomA.id);

    const registrationReceptionDenied = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityAId}/reception/appointments?from=2026-10-05T00%3A00%3A00Z&to=2026-10-06T00%3A00%3A00Z`,
      headers: { 'x-dev-sub': facilityASub }
    });
    assert.equal(registrationReceptionDenied.statusCode, 403);

    const rooms = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityAId}/rooms`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(rooms.statusCode, 200);
    assert.equal(rooms.json().items.length, 1);
    assert.equal(rooms.json().items[0].id, roomA.id);

    const allocations = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityAId}/rooms/allocations?from=2026-10-05T00%3A00%3A00Z&to=2026-10-06T00%3A00%3A00Z`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(allocations.statusCode, 200);
    assert.equal(allocations.json().roomExclusivityApplied, false);
    assert.equal(allocations.json().items.length, 2);
    assert.ok(allocations.json().items.every(item => item.roomId === roomA.id));

    const mutationRouteNotExposed = await app.inject({
      method: 'POST',
      url: `/v1/appointments/${appointment1.id}/arrivals`,
      headers: {
        'x-dev-sub': staffSub,
        'content-type': 'application/json'
      },
      payload: {
        partyKind: 'PATIENT',
        arrivedAt: '2026-10-05T07:50:00Z'
      }
    });
    assert.equal(mutationRouteNotExposed.statusCode, 404);

    const patientArrivalEvents = await pool.query(`
      select id
      from appointment_events
      where appointment_id = $1 and event_code = 'PATIENT_ARRIVED'
    `, [appointment1.id]);
    assert.equal(patientArrivalEvents.rowCount, 1);

    const consultationEvents = await pool.query(`
      select event_code
      from appointment_events
      where appointment_id = $1
        and event_code in ('CONSULTATION_STARTED','CONSULTATION_COMPLETED')
      order by sequence_number
    `, [appointment1.id]);
    assert.deepEqual(
      consultationEvents.rows.map(row => row.event_code),
      ['CONSULTATION_STARTED','CONSULTATION_COMPLETED']
    );

    await assert.rejects(
      pool.query(
        'update appointment_arrival_facts set arrived_at = $1::timestamptz where id = $2',
        ['2026-10-05T07:49:00Z', patientArrival.fact.id]
      ),
      error => error.code === '23514'
    );

    await assert.rejects(
      pool.query(
        'delete from appointment_room_assignment_revisions where id = $1',
        [roomAssignment1.id]
      ),
      error => error.code === '23514'
    );

    const outbox = await pool.query(`
      select event_type
      from outbox_events
      where aggregate_type = 'APPOINTMENT'
        and aggregate_id = $1
        and event_type in (
          'PATIENT_ARRIVED',
          'DOCTOR_ARRIVED',
          'CONSULTATION_STARTED',
          'CONSULTATION_COMPLETED',
          'ROOM_ASSIGNMENT_RECORDED'
        )
      order by created_at, event_type
    `, [appointment1.id]);
    assert.equal(outbox.rowCount, 5);
  } finally {
    await app.close();
    await pool.end();
  }
});
