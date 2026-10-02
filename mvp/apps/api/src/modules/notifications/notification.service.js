import { validateNotificationIntent } from './notification.validation.js';

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 409;
  return error;
}

function mapIntent(row) {
  return {
    id: row.id,
    sourceOutboxEventId: row.source_outbox_event_id,
    recipientAccountId: row.recipient_account_id,
    channelCode: row.channel_code,
    templateCode: row.template_code,
    locale: row.locale,
    idempotencyKey: row.idempotency_key,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attempt_count,
    availableAt: row.available_at,
    lastAttemptAt: row.last_attempt_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    providerMessageId: row.provider_message_id,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/*
 * Policy-boundary primitive only.
 * DR-023 remains unresolved, so no domain event is automatically mapped to
 * recipient/channel/template. A future approved routing policy must supply all
 * three explicitly before calling this function.
 */
export async function createNotificationIntentForApprovedPolicy(pool, rawInput) {
  const input = validateNotificationIntent(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');

    const insert = await client.query(`
      insert into notification_delivery_intents(
        source_outbox_event_id,
        recipient_account_id,
        channel_code,
        template_code,
        locale,
        idempotency_key,
        payload
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      on conflict (idempotency_key) do nothing
      returning *
    `, [
      input.sourceOutboxEventId,
      input.recipientAccountId,
      input.channelCode,
      input.templateCode,
      input.locale,
      input.idempotencyKey,
      JSON.stringify(input.payload)
    ]);

    if (insert.rows[0]) {
      await client.query('commit');
      return { intent: mapIntent(insert.rows[0]), idempotentReplay: false };
    }

    const existing = await client.query(`
      select *
      from notification_delivery_intents
      where idempotency_key = $1
      for update
    `, [input.idempotencyKey]);
    const row = existing.rows[0];

    const equivalent = row &&
      row.source_outbox_event_id === input.sourceOutboxEventId &&
      row.recipient_account_id === input.recipientAccountId &&
      row.channel_code === input.channelCode &&
      row.template_code === input.templateCode &&
      row.locale === input.locale &&
      JSON.stringify(row.payload) === JSON.stringify(input.payload);

    if (!equivalent) {
      throw conflict(
        'NOTIFICATION_IDEMPOTENCY_KEY_REUSE',
        'Notification idempotency key was already used with a different intent'
      );
    }

    await client.query('commit');
    return { intent: mapIntent(row), idempotentReplay: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function getNotificationIntent(pool, intentId) {
  const result = await pool.query(
    'select * from notification_delivery_intents where id = $1',
    [intentId]
  );
  return result.rows[0] ? mapIntent(result.rows[0]) : null;
}

export async function listNotificationIntents(pool, { limit = 100, offset = 0, status = null } = {}) {
  const result = await pool.query(`
    select *
    from notification_delivery_intents
    where ($3::text is null or status = $3)
    order by created_at desc, id desc
    limit $1 offset $2
  `, [limit, offset, status]);
  return result.rows.map(mapIntent);
}
