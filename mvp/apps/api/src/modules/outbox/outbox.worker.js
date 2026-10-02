function normalizeWorkerId(value) {
  const workerId = String(value ?? '').trim();
  if (!workerId || workerId.length > 160) {
    const error = new Error('workerId must be 1-160 characters');
    error.code = 'INVALID_WORKER_ID';
    error.statusCode = 422;
    throw error;
  }
  return workerId;
}

function normalizeEventTypes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    const error = new Error('At least one outbox event type is required');
    error.code = 'OUTBOX_HANDLER_REQUIRED';
    error.statusCode = 422;
    throw error;
  }
  return [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
}

function errorShape(error) {
  return {
    code: String(error?.code ?? 'DELIVERY_FAILED').slice(0, 160),
    message: String(error?.message ?? 'Outbox delivery failed').slice(0, 2000)
  };
}

async function recoverExpiredLeases(client, eventTypes) {
  const expired = await client.query(`
    select id, attempt_count, locked_by,
           coalesce(locked_at, last_attempt_at, updated_at) as started_at
    from outbox_events
    where status = 'PROCESSING'
      and lease_expires_at is not null
      and lease_expires_at <= now()
      and event_type = any($1::text[])
    for update skip locked
  `, [eventTypes]);

  for (const row of expired.rows) {
    await client.query(`
      insert into outbox_delivery_attempts(
        outbox_event_id,
        attempt_number,
        worker_id,
        outcome,
        error_code,
        error_message,
        started_at,
        completed_at,
        metadata
      )
      values (
        $1, $2, $3, 'FAILED',
        'LEASE_EXPIRED',
        'Worker lease expired before completion',
        $4, now(),
        jsonb_build_object('leaseRecovered', true)
      )
      on conflict (outbox_event_id, attempt_number) do nothing
    `, [
      row.id,
      row.attempt_count,
      row.locked_by ?? 'unknown-worker',
      row.started_at
    ]);
  }

  if (expired.rowCount) {
    await client.query(`
      update outbox_events
      set status = 'FAILED',
          locked_by = null,
          locked_at = null,
          lease_expires_at = null,
          last_error_code = 'LEASE_EXPIRED',
          last_error_message = 'Worker lease expired before completion',
          available_at = now(),
          updated_at = now()
      where id = any($1::uuid[])
    `, [expired.rows.map(row => row.id)]);
  }

  return expired.rowCount;
}

export async function claimOutboxBatch(pool, {
  workerId,
  eventTypes,
  limit = 25,
  leaseSeconds = 60
}) {
  const worker = normalizeWorkerId(workerId);
  const types = normalizeEventTypes(eventTypes);
  const batchLimit = Number(limit);
  const lease = Number(leaseSeconds);

  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 200) {
    const error = new Error('limit must be an integer from 1 to 200');
    error.code = 'INVALID_OUTBOX_LIMIT';
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isInteger(lease) || lease < 5 || lease > 3600) {
    const error = new Error('leaseSeconds must be an integer from 5 to 3600');
    error.code = 'INVALID_OUTBOX_LEASE';
    error.statusCode = 422;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    await recoverExpiredLeases(client, types);

    const candidates = await client.query(`
      select id
      from outbox_events
      where status in ('PENDING','FAILED')
        and available_at <= now()
        and event_type = any($1::text[])
      order by available_at, created_at, id
      for update skip locked
      limit $2
    `, [types, batchLimit]);

    if (!candidates.rowCount) {
      await client.query('commit');
      return [];
    }

    const claimed = await client.query(`
      update outbox_events
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
      returning id, aggregate_type, aggregate_id, event_type, event_key,
                payload, status, attempt_count, available_at,
                locked_by, locked_at, lease_expires_at, created_at
    `, [
      candidates.rows.map(row => row.id),
      worker,
      lease
    ]);

    await client.query('commit');
    return claimed.rows.map(row => ({
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      eventKey: row.event_key,
      payload: row.payload,
      status: row.status,
      attemptNumber: row.attempt_count,
      availableAt: row.available_at,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at,
      leaseExpiresAt: row.lease_expires_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function finalizeOutboxAttempt(pool, {
  event,
  workerId,
  outcome,
  handlerMetadata = {},
  error = null,
  retryDelaySeconds = 30
}) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const startedAt = event.lockedAt;
    const err = error ? errorShape(error) : null;

    const update = outcome === 'DELIVERED'
      ? await client.query(`
          update outbox_events
          set status = 'DELIVERED',
              processed_at = now(),
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
        `, [event.id, workerId, event.attemptNumber])
      : await client.query(`
          update outbox_events
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
          event.id,
          workerId,
          event.attemptNumber,
          retryDelaySeconds,
          err.code,
          err.message
        ]);

    if (!update.rowCount) {
      await client.query('rollback');
      return { finalized: false, lostLease: true };
    }

    await client.query(`
      insert into outbox_delivery_attempts(
        outbox_event_id,
        attempt_number,
        worker_id,
        outcome,
        error_code,
        error_message,
        started_at,
        completed_at,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, now(), $8::jsonb)
    `, [
      event.id,
      event.attemptNumber,
      workerId,
      outcome,
      err?.code ?? null,
      err?.message ?? null,
      startedAt,
      JSON.stringify(handlerMetadata ?? {})
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

export async function runOutboxBatch(pool, {
  workerId,
  handlers,
  limit = 25,
  leaseSeconds = 60,
  retryDelaySeconds = 30
}) {
  const handlerEntries = Object.entries(handlers ?? {}).filter(([, handler]) => typeof handler === 'function');
  const eventTypes = handlerEntries.map(([eventType]) => eventType);
  const worker = normalizeWorkerId(workerId);

  if (!Number.isInteger(retryDelaySeconds) || retryDelaySeconds < 1 || retryDelaySeconds > 86400) {
    const error = new Error('retryDelaySeconds must be an integer from 1 to 86400');
    error.code = 'INVALID_OUTBOX_RETRY';
    error.statusCode = 422;
    throw error;
  }

  if (!eventTypes.length) {
    return {
      claimed: 0,
      delivered: 0,
      failed: 0,
      lostLease: 0,
      results: []
    };
  }

  const events = await claimOutboxBatch(pool, {
    workerId: worker,
    eventTypes,
    limit,
    leaseSeconds
  });

  const results = [];
  let delivered = 0;
  let failed = 0;
  let lostLease = 0;

  for (const event of events) {
    const handler = handlers[event.eventType];
    const started = Date.now();

    try {
      const handlerResult = await handler(event);
      const finalized = await finalizeOutboxAttempt(pool, {
        event,
        workerId: worker,
        outcome: 'DELIVERED',
        handlerMetadata: {
          durationMs: Date.now() - started,
          ...(handlerResult?.metadata ?? {})
        }
      });
      if (finalized.lostLease) lostLease += 1;
      else delivered += 1;
      results.push({ eventId: event.id, outcome: finalized.lostLease ? 'LOST_LEASE' : 'DELIVERED' });
    } catch (handlerError) {
      const finalized = await finalizeOutboxAttempt(pool, {
        event,
        workerId: worker,
        outcome: 'FAILED',
        error: handlerError,
        retryDelaySeconds,
        handlerMetadata: { durationMs: Date.now() - started }
      });
      if (finalized.lostLease) lostLease += 1;
      else failed += 1;
      results.push({
        eventId: event.id,
        outcome: finalized.lostLease ? 'LOST_LEASE' : 'FAILED',
        error: errorShape(handlerError)
      });
    }
  }

  return {
    claimed: events.length,
    delivered,
    failed,
    lostLease,
    results
  };
}
