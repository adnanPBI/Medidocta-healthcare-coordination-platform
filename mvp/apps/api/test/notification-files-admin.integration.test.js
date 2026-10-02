import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import {
  attachFileObjectForAuthorizedActor,
  registerFileObjectForAuthorizedActor
} from '../src/modules/files/files.service.js';
import { createNotificationIntentForApprovedPolicy } from '../src/modules/notifications/notification.service.js';
import { runNotificationDeliveryBatch } from '../src/modules/notifications/notification.worker.js';

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

async function makeAdmin(pool, accountId) {
  await pool.query(`
    insert into account_roles(account_id, role_code, status)
    values ($1, 'MEDIDOCTA_ADMIN', 'ACTIVE')
    on conflict (account_id, role_code) do update set status = 'ACTIVE'
  `, [accountId]);
}

integration('notification delivery, file metadata and privileged audit/admin foundations remain policy-safe', async () => {
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
  const recipientSub = `m08-recipient-${suffix}`;
  const adminSub = `m08-admin-files-${suffix}`;

  try {
    const recipient = await bootstrap(app, recipientSub, 'PATIENT');
    const admin = await bootstrap(app, adminSub, 'PATIENT');
    await makeAdmin(pool, admin.account.id);

    const initialNotifications = await pool.query(
      'select count(*)::integer as count from notification_delivery_intents'
    );
    assert.equal(initialNotifications.rows[0].count, 0);

    const sourceOutbox = await pool.query(`
      insert into outbox_events(
        aggregate_type,
        aggregate_id,
        event_type,
        event_key,
        payload
      )
      values (
        'TEST_RESOURCE',
        $1,
        'TEST_NOTIFICATION_SOURCE',
        $2,
        $3::jsonb
      )
      returning id
    `, [
      recipient.account.id,
      `test-notification-source:${suffix}`,
      JSON.stringify({ source: 'integration-test' })
    ]);

    const intentInput = {
      sourceOutboxEventId: sourceOutbox.rows[0].id,
      recipientAccountId: recipient.account.id,
      channelCode: 'TEST_EMAIL',
      templateCode: 'TEST_APPOINTMENT_TEMPLATE',
      locale: 'fr',
      idempotencyKey: `notify:m08:${suffix}`,
      payload: { appointmentId: 'demo', alpha: 1 }
    };

    const created = await createNotificationIntentForApprovedPolicy(pool, intentInput);
    assert.equal(created.idempotentReplay, false);
    assert.equal(created.intent.channelCode, 'TEST_EMAIL');
    assert.equal(created.intent.templateCode, 'TEST_APPOINTMENT_TEMPLATE');

    const replay = await createNotificationIntentForApprovedPolicy(pool, {
      ...intentInput,
      payload: { alpha: 1, appointmentId: 'demo' }
    });
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.intent.id, created.intent.id);

    await assert.rejects(
      createNotificationIntentForApprovedPolicy(pool, {
        ...intentInput,
        payload: { alpha: 2, appointmentId: 'demo' }
      }),
      error => error.code === 'NOTIFICATION_IDEMPOTENCY_KEY_REUSE'
    );

    const firstDelivery = await runNotificationDeliveryBatch(pool, {
      workerId: 'test-notification-worker',
      adapters: {
        TEST_EMAIL: {
          deliver: async () => {
            const error = new Error('simulated notification provider outage');
            error.code = 'NOTIFY_PROVIDER_DOWN';
            throw error;
          }
        }
      },
      retryDelaySeconds: 60
    });
    assert.equal(firstDelivery.claimed, 1);
    assert.equal(firstDelivery.failed, 1);

    const failedIntent = await pool.query(`
      select status, attempt_count, last_error_code
      from notification_delivery_intents
      where id = $1
    `, [created.intent.id]);
    assert.equal(failedIntent.rows[0].status, 'FAILED');
    assert.equal(failedIntent.rows[0].attempt_count, 1);
    assert.equal(failedIntent.rows[0].last_error_code, 'NOTIFY_PROVIDER_DOWN');

    const nonAdminListDenied = await app.inject({
      method: 'GET',
      url: '/v1/admin/notification-intents?status=FAILED',
      headers: { 'x-dev-sub': recipientSub }
    });
    assert.equal(nonAdminListDenied.statusCode, 403);

    const adminList = await app.inject({
      method: 'GET',
      url: '/v1/admin/notification-intents?status=FAILED',
      headers: { 'x-dev-sub': adminSub }
    });
    assert.equal(adminList.statusCode, 200);
    assert.equal(adminList.json().policy.automaticRoutingEnabled, false);
    assert.equal(adminList.json().policy.channelConsentPolicyResolved, false);
    assert.equal(adminList.json().policy.templatePolicyResolved, false);
    assert.ok(adminList.json().items.some(item => item.id === created.intent.id));

    const retry = await app.inject({
      method: 'POST',
      url: `/v1/admin/notification-intents/${created.intent.id}/retry`,
      headers: { 'x-dev-sub': adminSub }
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().status, 'PENDING');

    const secondDelivery = await runNotificationDeliveryBatch(pool, {
      workerId: 'test-notification-worker',
      adapters: {
        TEST_EMAIL: {
          deliver: async intent => ({
            providerCode: 'TEST_PROVIDER',
            providerMessageId: `message-${intent.id}`,
            metadata: { simulated: true }
          })
        }
      }
    });
    assert.equal(secondDelivery.claimed, 1);
    assert.equal(secondDelivery.delivered, 1);

    const deliveredIntent = await pool.query(`
      select status, attempt_count, provider_message_id, delivered_at
      from notification_delivery_intents
      where id = $1
    `, [created.intent.id]);
    assert.equal(deliveredIntent.rows[0].status, 'DELIVERED');
    assert.equal(deliveredIntent.rows[0].attempt_count, 2);
    assert.ok(deliveredIntent.rows[0].provider_message_id);
    assert.ok(deliveredIntent.rows[0].delivered_at);

    const attempts = await pool.query(`
      select attempt_number, outcome
      from notification_delivery_attempts
      where notification_intent_id = $1
      order by attempt_number
    `, [created.intent.id]);
    assert.deepEqual(attempts.rows, [
      { attempt_number: 1, outcome: 'FAILED' },
      { attempt_number: 2, outcome: 'DELIVERED' }
    ]);

    const file = await registerFileObjectForAuthorizedActor(pool, {
      actorAccountId: admin.account.id,
      storageBackendCode: 'TEST_PRIVATE_STORE',
      storageObjectKey: `private/test/${suffix}/evidence.pdf`,
      originalFilename: 'evidence.pdf',
      contentType: 'application/pdf',
      byteSize: 2048,
      sha256: 'b'.repeat(64),
      metadata: { purpose: 'metadata-only-integration-test' }
    });

    const attachment = await attachFileObjectForAuthorizedActor(pool, {
      actorAccountId: admin.account.id,
      fileId: file.id,
      resourceType: 'PATIENT_PROFILE',
      resourceId: recipient.patientProfileId,
      relationCode: 'SUPPORTING_DOCUMENT',
      metadata: { source: 'test' }
    });
    assert.equal(attachment.idempotentReplay, false);

    const attachmentReplay = await attachFileObjectForAuthorizedActor(pool, {
      actorAccountId: admin.account.id,
      fileId: file.id,
      resourceType: 'PATIENT_PROFILE',
      resourceId: recipient.patientProfileId,
      relationCode: 'SUPPORTING_DOCUMENT',
      metadata: { source: 'test' }
    });
    assert.equal(attachmentReplay.idempotentReplay, true);
    assert.equal(attachmentReplay.attachment.id, attachment.attachment.id);

    await assert.rejects(
      attachFileObjectForAuthorizedActor(pool, {
        actorAccountId: admin.account.id,
        fileId: file.id,
        resourceType: 'PATIENT_PROFILE',
        resourceId: recipient.patientProfileId,
        relationCode: 'SUPPORTING_DOCUMENT',
        metadata: { source: 'different' }
      }),
      error => error.code === 'FILE_ATTACHMENT_IDEMPOTENCY_CONFLICT'
    );

    const patientFileDenied = await app.inject({
      method: 'GET',
      url: `/v1/admin/files/${file.id}`,
      headers: { 'x-dev-sub': recipientSub }
    });
    assert.equal(patientFileDenied.statusCode, 403);

    const adminFile = await app.inject({
      method: 'GET',
      url: `/v1/admin/files/${file.id}`,
      headers: { 'x-dev-sub': adminSub }
    });
    assert.equal(adminFile.statusCode, 200);
    assert.equal(adminFile.json().file.id, file.id);
    assert.equal(adminFile.json().attachments.length, 1);
    assert.equal(adminFile.json().bytesAccessibleThroughApi, false);
    assert.equal(adminFile.json().signedAccessImplemented, false);

    const publicUploadNotExposed = await app.inject({
      method: 'POST',
      url: '/v1/files',
      headers: {
        'x-dev-sub': recipientSub,
        'content-type': 'application/json'
      },
      payload: {}
    });
    assert.equal(publicUploadNotExposed.statusCode, 404);

    const auditRead = await app.inject({
      method: 'GET',
      url: '/v1/admin/audit-events?actionCode=FILE_OBJECT_REGISTERED',
      headers: { 'x-dev-sub': adminSub }
    });
    assert.equal(auditRead.statusCode, 200);
    assert.ok(auditRead.json().items.some(item => item.resourceId === file.id));

    await assert.rejects(
      pool.query(
        'update file_objects set original_filename = $1 where id = $2',
        ['tampered.pdf', file.id]
      ),
      error => error.code === '23514'
    );

    await assert.rejects(
      pool.query(
        'delete from file_attachment_links where id = $1',
        [attachment.attachment.id]
      ),
      error => error.code === '23514'
    );

    const notificationRetryAudit = await pool.query(`
      select id
      from audit_events
      where action_code = 'NOTIFICATION_RETRY_REQUESTED'
        and resource_id = $1
    `, [created.intent.id]);
    assert.equal(notificationRetryAudit.rowCount, 1);
  } finally {
    await app.close();
    await pool.end();
  }
});
