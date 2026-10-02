function workerId(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 160) {
    const error = new Error('workerId must be 1-160 characters');
    error.code = 'INVALID_NOTIFICATION_WORKER_ID';
    error.statusCode = 422;
    throw error;
  }
  return text;
}

function normalizeChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    const error = new Error('At least one notification channel adapter is required');
    error.code = 'NOTIFICATION_ADAPTER_REQUIRED';
    error.statusCode = 422;
    throw error;
  }
  return [...new Set(channels.map(channel => String(channel).trim()).filter(Boolean))];
}

function errorShape(error) {
  return {
    code: String(error?.code ?? 'NOTIFICATION_DELIVERY_FAILED').slice(0, 160),
    message: String(error?.message ?? 'Notification delivery failed').slice(0, 2000)
  };
}

async function recoverExpired(client, channels) {
  const expired = await client.query(`
    select id, attempt_count, channel_code, locked_by,
           coalesce(locked_at, last_attempt_at, updated_at) as started_at
    from notification_delivery_intents
    where status = 'PROCESSING'
      and lease_expires_at is not null
      and lease_expires_at <= now()
      and channel_code = any($1::text[])
    for update skip locked
  `, [channels]);

  for (const row of expired.rows) {
    await client.query(`
      insert into notification_delivery_attempts(
        notification_intent_id,
        attempt_number,
        worker_id,
        channel_code,
        outcome,
        error_code,
        error_message,
        started_at,
        completed_at,
        metadata
      )
      values (
        $1, $2, $3, $4, 'FAILED',
        'LEASE_EXPIRED',
        'Notification worker lease expired before completion',
        $5, now(),
        jsonb_build_object('leaseRecovered', true)
      )
      on conflict (notification_intent_id, attempt_number) do nothing
    `, [
      row.id,
      row.attempt_count,
      row.locked_by ?? 'unknown-worker',
      row.channel_code,
      row.started_at
    ]);
  }

  if (expired.rowCount) {
    await client.query(`
      update notification_delivery_intents
      set status = 'FAILED',
          locked_by = null,
          locked_at = null,
          lease_expires_at = null,
          last_error_code = 'LEASE_EXPIRED',
          last_error_message = 'Notification worker lease expired before completion',
          available_at = now(),
          updated_at = now()
      where id = any($1::uuid[])
    `, [expired.rows.map(row => row.id)]);
  }
}

async function claimNotificationBatch(pool, {
  worker,
  channels,
  limit,
  leaseSeconds
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await recoverExpired(client, channels);

    const candidates = await client.query(`
      select id
      from notification_delivery_intents
      where status in ('PENDING','FAILED')
        and available_at <= now()
        and channel_code = any($1::text[])
      order by available_at, created_at, id
      for update skip locked
      limit $2
    `, [channels, limit]);

    if (!candidates.rowCount) {
      await client.query('commit');
      return [];
    }

    const claimed = await client.query(`
      update notification_delivery_intents
      set status = 'PROCESSING',
          attempt_count = attempt_count + 1,
          locked_by = $2,
          locked_at = now(),
          lease_expires_at = now() + ($3::integer * interval '1 second'),
          last_attempt_at = now(),
          last_error_code = null,
          last_error_message = null,
          updated_at = now()
      where id = any($1::uuid[])
      returning *
    `, [
      candidates.rows.map(row => row.id),
      worker,
      leaseSeconds
    ]);

    await client.query('commit');
    return claimed.rows;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function finalize(pool, {
  row,
  worker,
  outcome,
  adapterResult,
  deliveryError,
  retryDelaySeconds
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const err = deliveryError ? errorShape(deliveryError) : null;

    const update = outcome === 'DELIVERED'
      ? await client.query(`
          update notification_delivery_intents
          set status = 'DELIVERED',
              provider_message_id = $4,
              delivered_at = now(),
              locked_by = null,
              locked_at = null,
              lease_expires_at = null,
              last_error_code = null,
              last_error_message = null,
              updated_at = now()
          where id = $1
            and status = 'PROCESSING'
            and locked_by = $2
            and attempt_count = $3
          returning id
        `, [
          row.id,
          worker,
          row.attempt_count,
          adapterResult?.providerMessageId ?? null
        ])
      : await client.query(`
          update notification_delivery_intents
          set status = 'FAILED',
              available_at = now() + ($4::integer * interval '1 second'),
              locked_by = null,
              locked_at = null,
              lease_expires_at = null,
              last_error_code = $5,
              last_error_message = $6,
              updated_at = now()
          where id = $1
            and status = 'PROCESSING'
            and locked_by = $2
            and attempt_count = $3
          returning id
        `, [
          row.id,
          worker,
          row.attempt_count,
          retryDelaySeconds,
          err.code,
          err.message
        ]);

    if (!update.rowCount) {
      await client.query('rollback');
      return { finalized: false, lostLease: true };
    }

    await client.query(`
      insert into notification_delivery_attempts(
        notification_intent_id,
        attempt_number,
        worker_id,
        channel_code,
        provider_code,
        provider_message_id,
        outcome,
        error_code,
        error_message,
        started_at,
        completed_at,
        metadata
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, now(), $11::jsonb
      )
    `, [
      row.id,
      row.attempt_count,
      worker,
      row.channel_code,
      adapterResult?.providerCode ?? null,
      adapterResult?.providerMessageId ?? null,
      outcome,
      err?.code ?? null,
      err?.message ?? null,
      row.locked_at,
      JSON.stringify(adapterResult?.metadata ?? {})
    ]);

    await client.query('commit');
    return { finalized: true, lostLease: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function runNotificationDeliveryBatch(pool, {
  workerId: workerIdInput,
  adapters,
  limit = 25,
  leaseSeconds = 60,
  retryDelaySeconds = 60
}) {
  const worker = workerId(workerIdInput);
  const adapterEntries = Object.entries(adapters ?? {}).filter(([, adapter]) => typeof adapter?.deliver === 'function');
  const channels = normalizeChannels(adapterEntries.map(([channel]) => channel));

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    const error = new Error('limit must be an integer from 1 to 200');
    error.code = 'INVALID_NOTIFICATION_LIMIT';
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 3600) {
    const error = new Error('leaseSeconds must be an integer from 5 to 3600');
    error.code = 'INVALID_NOTIFICATION_LEASE';
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isInteger(retryDelaySeconds) || retryDelaySeconds < 1 || retryDelaySeconds > 86400) {
    const error = new Error('retryDelaySeconds must be an integer from 1 to 86400');
    error.code = 'INVALID_NOTIFICATION_RETRY';
    error.statusCode = 422;
    throw error;
  }

  const rows = await claimNotificationBatch(pool, {
    worker,
    channels,
    limit,
    leaseSeconds
  });

  const results = [];
  let delivered = 0;
  let failed = 0;
  let lostLease = 0;

  for (const row of rows) {
    const adapter = adapters[row.channel_code];
    try {
      const adapterResult = await adapter.deliver({
        id: row.id,
        recipientAccountId: row.recipient_account_id,
        channelCode: row.channel_code,
        templateCode: row.template_code,
        locale: row.locale,
        payload: row.payload,
        attemptNumber: row.attempt_count
      });

      const finalized = await finalize(pool, {
        row,
        worker,
        outcome: 'DELIVERED',
        adapterResult,
        retryDelaySeconds
      });
      if (finalized.lostLease) lostLease += 1;
      else delivered += 1;
      results.push({ intentId: row.id, outcome: finalized.lostLease ? 'LOST_LEASE' : 'DELIVERED' });
    } catch (deliveryError) {
      const finalized = await finalize(pool, {
        row,
        worker,
        outcome: 'FAILED',
        deliveryError,
        retryDelaySeconds
      });
      if (finalized.lostLease) lostLease += 1;
      else failed += 1;
      results.push({
        intentId: row.id,
        outcome: finalized.lostLease ? 'LOST_LEASE' : 'FAILED',
        error: errorShape(deliveryError)
      });
    }
  }

  return {
    claimed: rows.length,
    delivered,
    failed,
    lostLease,
    results
  };
}
