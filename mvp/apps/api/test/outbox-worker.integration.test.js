import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { appendAvailabilityRevisionForAuthorizedActor } from '../src/modules/availability/availability.service.js';
import { runOutboxBatch } from '../src/modules/outbox/outbox.worker.js';

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

async function makeAdmin(pool, context) {
  await pool.query(`
    insert into account_roles(account_id, role_code, status)
    values ($1, 'MEDIDOCTA_ADMIN', 'ACTIVE')
    on conflict (account_id, role_code) do update set status = 'ACTIVE'
  `, [context.account.id]);
}

integration('outbox worker retries provider failure without rolling back the canonical Appointment', async () => {
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
  const patientSub = `m08-patient-${suffix}`;
  const doctorSub = `m08-doctor-${suffix}`;
  const facilitySub = `m08-facility-${suffix}`;
  const adminSub = `m08-admin-${suffix}`;

  try {
    const patient = await bootstrap(app, patientSub, 'PATIENT');
    const doctor = await bootstrap(app, doctorSub, 'DOCTOR');
    const facility = await bootstrap(app, facilitySub, 'FACILITY');
    const admin = await bootstrap(app, adminSub, 'PATIENT');
    await makeAdmin(pool, admin);

    const facilityId = facility.registeredFacilities[0].facilityId;
    const affiliation = await pool.query(`
      insert into doctor_facility_affiliations(
        doctor_id, facility_id, status, booking_enabled
      )
      values ($1, $2, 'PENDING', true)
      returning id
    `, [doctor.doctorProfileId, facilityId]);

    const schedule = await appendAvailabilityRevisionForAuthorizedActor(pool, {
      affiliationId: affiliation.rows[0].id,
      actorAccountId: doctor.account.id,
      expectedVersion: 0,
      timezoneName: 'Africa/Douala',
      recurringRules: [{
        ruleKey: 'monday-clinic',
        isoWeekday: 1,
        localStart: '09:00',
        localEnd: '11:00'
      }],
      exceptions: []
    });

    const booking = await app.inject({
      method: 'POST',
      url: '/v1/bookings/appointments',
      headers: {
        'x-dev-sub': patientSub,
        'content-type': 'application/json',
        'idempotency-key': `m08:booking:${suffix}`
      },
      payload: {
        affiliationId: affiliation.rows[0].id,
        scheduleRevisionId: schedule.latestRevision.id,
        startsAt: '2026-10-05T08:00:00Z',
        endsAt: '2026-10-05T08:30:00Z'
      }
    });
    assert.equal(booking.statusCode, 201);
    const appointmentId = booking.json().appointment.id;

    const outbox = await pool.query(`
      select id, status
      from outbox_events
      where aggregate_type = 'APPOINTMENT'
        and aggregate_id = $1
        and event_type = 'APPOINTMENT_CREATED'
    `, [appointmentId]);
    assert.equal(outbox.rowCount, 1);
    const outboxId = outbox.rows[0].id;

    const firstRun = await runOutboxBatch(pool, {
      workerId: 'test-outbox-worker',
      handlers: {
        APPOINTMENT_CREATED: async () => {
          const error = new Error('simulated provider outage');
          error.code = 'PROVIDER_DOWN';
          throw error;
        }
      },
      retryDelaySeconds: 60
    });
    assert.equal(firstRun.claimed, 1);
    assert.equal(firstRun.failed, 1);

    const appointmentStillCommitted = await pool.query(
      'select id from appointments where id = $1',
      [appointmentId]
    );
    assert.equal(appointmentStillCommitted.rowCount, 1);

    const failedState = await pool.query(`
      select status, attempt_count, last_error_code
      from outbox_events
      where id = $1
    `, [outboxId]);
    assert.equal(failedState.rows[0].status, 'FAILED');
    assert.equal(failedState.rows[0].attempt_count, 1);
    assert.equal(failedState.rows[0].last_error_code, 'PROVIDER_DOWN');

    const attempt1 = await pool.query(`
      select outcome, error_code
      from outbox_delivery_attempts
      where outbox_event_id = $1
      order by attempt_number
    `, [outboxId]);
    assert.deepEqual(attempt1.rows, [{
      outcome: 'FAILED',
      error_code: 'PROVIDER_DOWN'
    }]);

    const patientAdminDenied = await app.inject({
      method: 'GET',
      url: '/v1/admin/outbox-events?status=FAILED',
      headers: { 'x-dev-sub': patientSub }
    });
    assert.equal(patientAdminDenied.statusCode, 403);

    const adminOutbox = await app.inject({
      method: 'GET',
      url: '/v1/admin/outbox-events?status=FAILED',
      headers: { 'x-dev-sub': adminSub }
    });
    assert.equal(adminOutbox.statusCode, 200);
    assert.ok(adminOutbox.json().items.some(item => item.id === outboxId));

    const retry = await app.inject({
      method: 'POST',
      url: `/v1/admin/outbox-events/${outboxId}/retry`,
      headers: { 'x-dev-sub': adminSub }
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().status, 'PENDING');

    const secondRun = await runOutboxBatch(pool, {
      workerId: 'test-outbox-worker',
      handlers: {
        APPOINTMENT_CREATED: async event => ({
          metadata: {
            transport: 'TEST',
            appointmentId: event.aggregateId
          }
        })
      }
    });
    assert.equal(secondRun.claimed, 1);
    assert.equal(secondRun.delivered, 1);

    const deliveredState = await pool.query(`
      select status, attempt_count, processed_at
      from outbox_events
      where id = $1
    `, [outboxId]);
    assert.equal(deliveredState.rows[0].status, 'DELIVERED');
    assert.equal(deliveredState.rows[0].attempt_count, 2);
    assert.ok(deliveredState.rows[0].processed_at);

    const attempts = await pool.query(`
      select attempt_number, outcome
      from outbox_delivery_attempts
      where outbox_event_id = $1
      order by attempt_number
    `, [outboxId]);
    assert.deepEqual(attempts.rows, [
      { attempt_number: 1, outcome: 'FAILED' },
      { attempt_number: 2, outcome: 'DELIVERED' }
    ]);

    const retryAudit = await pool.query(`
      select id
      from audit_events
      where action_code = 'OUTBOX_RETRY_REQUESTED'
        and resource_id = $1
    `, [outboxId]);
    assert.equal(retryAudit.rowCount, 1);

    await assert.rejects(
      pool.query(
        'update audit_events set action_code = $1 where id = $2',
        ['TAMPERED', retryAudit.rows[0].id]
      ),
      error => error.code === '23514'
    );
  } finally {
    await app.close();
    await pool.end();
  }
});
