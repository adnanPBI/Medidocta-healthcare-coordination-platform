import { getFileObject, listFileObjects } from '../files/files.service.js';
import { listNotificationIntents } from '../notifications/notification.service.js';

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 409;
  return error;
}

export async function listAuditEvents(pool, filters) {
  const result = await pool.query(`
    select id, actor_account_id, action_code, resource_type, resource_id,
           metadata, source_code, correlation_id, created_at
    from audit_events
    where ($3::text is null or action_code = $3)
      and ($4::text is null or resource_type = $4)
      and ($5::uuid is null or resource_id = $5)
      and ($6::uuid is null or actor_account_id = $6)
      and ($7::timestamptz is null or created_at >= $7)
      and ($8::timestamptz is null or created_at < $8)
    order by created_at desc, id desc
    limit $1 offset $2
  `, [
    filters.limit,
    filters.offset,
    filters.actionCode,
    filters.resourceType,
    filters.resourceId,
    filters.actorAccountId,
    filters.from,
    filters.to
  ]);

  return result.rows.map(row => ({
    id: row.id,
    actorAccountId: row.actor_account_id,
    actionCode: row.action_code,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    sourceCode: row.source_code,
    correlationId: row.correlation_id,
    createdAt: row.created_at
  }));
}

export async function listOutboxEvents(pool, filters) {
  const result = await pool.query(`
    select id, aggregate_type, aggregate_id, event_type, event_key,
           payload, status, attempt_count, available_at,
           locked_by, locked_at, lease_expires_at,
           last_attempt_at, last_error_code, last_error_message,
           processed_at, created_at, updated_at
    from outbox_events
    where ($3::text is null or status = $3)
      and ($4::text is null or event_type = $4)
    order by created_at desc, id desc
    limit $1 offset $2
  `, [
    filters.limit,
    filters.offset,
    filters.status,
    filters.eventType
  ]);

  return result.rows.map(row => ({
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    eventKey: row.event_key,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    leaseExpiresAt: row.lease_expires_at,
    lastAttemptAt: row.last_attempt_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function retryFailedOutboxEvent(pool, {
  eventId,
  actorAccountId
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const current = await client.query(`
      select id, status, event_type, aggregate_type, aggregate_id
      from outbox_events
      where id = $1
      for update
    `, [eventId]);

    const row = current.rows[0];
    if (!row) {
      const error = new Error('Outbox event not found');
      error.code = 'OUTBOX_EVENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }
    if (row.status !== 'FAILED') {
      throw conflict(
        'OUTBOX_RETRY_NOT_ALLOWED',
        'Only FAILED outbox events may be manually retried'
      );
    }

    await client.query(`
      update outbox_events
      set status = 'PENDING',
          available_at = now(),
          locked_by = null,
          locked_at = null,
          lease_expires_at = null,
          last_error_code = null,
          last_error_message = null,
          updated_at = now()
      where id = $1
    `, [eventId]);

    await client.query(`
      insert into audit_events(
        actor_account_id,
        action_code,
        resource_type,
        resource_id,
        metadata,
        source_code
      )
      values (
        $1,
        'OUTBOX_RETRY_REQUESTED',
        'OUTBOX_EVENT',
        $2,
        jsonb_build_object(
          'event_type', $3::text,
          'aggregate_type', $4::text,
          'aggregate_id', $5::text
        ),
        'ADMIN'
      )
    `, [
      actorAccountId,
      eventId,
      row.event_type,
      row.aggregate_type,
      row.aggregate_id
    ]);

    await client.query('commit');
    return { id: eventId, status: 'PENDING' };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminNotificationIntents(pool, filters) {
  return listNotificationIntents(pool, filters);
}

export async function retryFailedNotificationIntent(pool, {
  intentId,
  actorAccountId
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const current = await client.query(`
      select id, status, channel_code, template_code, recipient_account_id
      from notification_delivery_intents
      where id = $1
      for update
    `, [intentId]);

    const row = current.rows[0];
    if (!row) {
      const error = new Error('Notification intent not found');
      error.code = 'NOTIFICATION_INTENT_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }
    if (row.status !== 'FAILED') {
      throw conflict(
        'NOTIFICATION_RETRY_NOT_ALLOWED',
        'Only FAILED notification intents may be manually retried'
      );
    }

    await client.query(`
      update notification_delivery_intents
      set status = 'PENDING',
          available_at = now(),
          locked_by = null,
          locked_at = null,
          lease_expires_at = null,
          last_error_code = null,
          last_error_message = null,
          updated_at = now()
      where id = $1
    `, [intentId]);

    await client.query(`
      insert into audit_events(
        actor_account_id,
        action_code,
        resource_type,
        resource_id,
        metadata,
        source_code
      )
      values (
        $1,
        'NOTIFICATION_RETRY_REQUESTED',
        'NOTIFICATION_INTENT',
        $2,
        jsonb_build_object(
          'channel_code', $3::text,
          'template_code', $4::text,
          'recipient_account_id', $5::text
        ),
        'ADMIN'
      )
    `, [
      actorAccountId,
      intentId,
      row.channel_code,
      row.template_code,
      row.recipient_account_id
    ]);

    await client.query('commit');
    return { id: intentId, status: 'PENDING' };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminFiles(pool, filters) {
  return listFileObjects(pool, filters);
}

export async function getAdminFile(pool, fileId) {
  return getFileObject(pool, fileId);
}
