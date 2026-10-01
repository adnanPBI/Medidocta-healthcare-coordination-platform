import { DateTime } from 'luxon';
import {
  validateAvailabilityRevision,
  validateProjectionQuery
} from './availability.validation.js';

function notFound(code, message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = code;
  return error;
}

function conflict(code, message) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = code;
  return error;
}

function mapRule(row) {
  return {
    id: row.id,
    ruleKey: row.rule_key,
    isoWeekday: row.iso_weekday,
    localStart: String(row.local_start).slice(0, 8),
    localEnd: String(row.local_end).slice(0, 8),
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function mapException(row) {
  return {
    id: row.id,
    exceptionKey: row.exception_key,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    kindCode: row.kind_code,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

export async function getAvailabilitySchedule(pool, affiliationId) {
  const scheduleResult = await pool.query(`
    select aas.id, aas.affiliation_id, aas.version, aas.created_at, aas.updated_at,
           asr.id as revision_id, asr.revision_number, asr.timezone_name,
           asr.changed_by_account_id, asr.metadata as revision_metadata,
           asr.created_at as revision_created_at
    from affiliation_availability_schedules aas
    left join availability_schedule_revisions asr
      on asr.schedule_id = aas.id
     and asr.revision_number = aas.version
    where aas.affiliation_id = $1
  `, [affiliationId]);

  const row = scheduleResult.rows[0];
  if (!row) {
    throw notFound('AVAILABILITY_SCHEDULE_NOT_FOUND', 'Availability schedule not found for affiliation');
  }

  if (!row.revision_id) {
    return {
      id: row.id,
      affiliationId: row.affiliation_id,
      version: row.version,
      latestRevision: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  const [rulesResult, exceptionsResult] = await Promise.all([
    pool.query(`
      select *
      from availability_recurring_rules
      where schedule_revision_id = $1
      order by iso_weekday, local_start, rule_key
    `, [row.revision_id]),
    pool.query(`
      select *
      from availability_exception_windows
      where schedule_revision_id = $1
      order by starts_at, exception_key
    `, [row.revision_id])
  ]);

  return {
    id: row.id,
    affiliationId: row.affiliation_id,
    version: row.version,
    latestRevision: {
      id: row.revision_id,
      revisionNumber: row.revision_number,
      timezoneName: row.timezone_name,
      changedByAccountId: row.changed_by_account_id,
      metadata: row.revision_metadata,
      recurringRules: rulesResult.rows.map(mapRule),
      exceptions: exceptionsResult.rows.map(mapException),
      createdAt: row.revision_created_at
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/*
 * Infrastructure-only write primitive.
 * The caller MUST establish availability-edit authority before invoking it.
 * It is intentionally not exposed over HTTP while DR-007/DR-008/DR-010/
 * DR-012/DR-043/DR-044/DR-045/DR-046 remain PRODUCT DECISION REQUIRED.
 */
export async function appendAvailabilityRevisionForAuthorizedActor(pool, {
  affiliationId,
  actorAccountId,
  ...rawInput
}) {
  const input = validateAvailabilityRevision(rawInput);
  const client = await pool.connect();
  try {
    await client.query('begin');

    const affiliationResult = await client.query(
      'select id from doctor_facility_affiliations where id = $1',
      [affiliationId]
    );
    if (!affiliationResult.rowCount) {
      throw notFound('AFFILIATION_NOT_FOUND', 'Doctor-Facility affiliation not found');
    }

    const scheduleResult = await client.query(`
      select id, version
      from affiliation_availability_schedules
      where affiliation_id = $1
      for update
    `, [affiliationId]);

    const schedule = scheduleResult.rows[0];
    if (!schedule) {
      throw notFound('AVAILABILITY_SCHEDULE_NOT_FOUND', 'Availability schedule not found for affiliation');
    }

    if (Number(schedule.version) !== input.expectedVersion) {
      throw conflict(
        'AVAILABILITY_VERSION_CONFLICT',
        'Availability schedule has changed; reload before saving'
      );
    }

    const nextRevision = Number(schedule.version) + 1;
    const revisionResult = await client.query(`
      insert into availability_schedule_revisions(
        schedule_id,
        revision_number,
        changed_by_account_id,
        timezone_name,
        metadata
      )
      values ($1, $2, $3, $4, $5::jsonb)
      returning *
    `, [
      schedule.id,
      nextRevision,
      actorAccountId,
      input.timezoneName,
      JSON.stringify(input.metadata)
    ]);

    for (const rule of input.recurringRules) {
      await client.query(`
        insert into availability_recurring_rules(
          schedule_revision_id,
          rule_key,
          iso_weekday,
          local_start,
          local_end,
          metadata
        )
        values ($1, $2, $3, $4::time, $5::time, $6::jsonb)
      `, [
        revisionResult.rows[0].id,
        rule.ruleKey,
        rule.isoWeekday,
        rule.localStart,
        rule.localEnd,
        JSON.stringify(rule.metadata)
      ]);
    }

    for (const exception of input.exceptions) {
      await client.query(`
        insert into availability_exception_windows(
          schedule_revision_id,
          exception_key,
          starts_at,
          ends_at,
          kind_code,
          metadata
        )
        values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6::jsonb)
      `, [
        revisionResult.rows[0].id,
        exception.exceptionKey,
        exception.startsAt,
        exception.endsAt,
        exception.kindCode,
        JSON.stringify(exception.metadata)
      ]);
    }

    await client.query(`
      update affiliation_availability_schedules
      set version = $2, updated_at = now()
      where id = $1
    `, [schedule.id, nextRevision]);

    await client.query(`
      insert into audit_events(actor_account_id, action_code, resource_type, resource_id, metadata)
      values (
        $1,
        'AVAILABILITY_REVISION_APPENDED',
        'AFFILIATION_AVAILABILITY',
        $2,
        jsonb_build_object(
          'affiliation_id', $3::text,
          'revision_number', $4::integer,
          'timezone_name', $5::text,
          'recurring_rule_count', $6::integer,
          'exception_count', $7::integer
        )
      )
    `, [
      actorAccountId,
      schedule.id,
      affiliationId,
      nextRevision,
      input.timezoneName,
      input.recurringRules.length,
      input.exceptions.length
    ]);

    await client.query('commit');
    return getAvailabilitySchedule(pool, affiliationId);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function timeParts(value) {
  const [hour, minute, second] = String(value).slice(0, 8).split(':').map(Number);
  return { hour, minute, second };
}

function buildLocalDateTime(day, localTime, timezoneName) {
  const parts = timeParts(localTime);
  const dt = DateTime.fromObject({
    year: day.year,
    month: day.month,
    day: day.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: 0
  }, { zone: timezoneName });

  if (
    !dt.isValid ||
    dt.hour !== parts.hour ||
    dt.minute !== parts.minute ||
    dt.second !== parts.second
  ) {
    return null;
  }
  return dt;
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

export async function listDoctorOccupancy(pool, doctorId, fromIso, toIso) {
  const result = await pool.query(`
    select id, starts_at, ends_at, source_type, source_id, metadata, created_at
    from doctor_occupancy_intervals
    where doctor_id = $1
      and starts_at < $3::timestamptz
      and ends_at > $2::timestamptz
    order by starts_at, id
  `, [doctorId, fromIso, toIso]);

  return result.rows.map(row => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    metadata: row.metadata,
    createdAt: row.created_at
  }));
}

/*
 * Future booking/operations modules may use this after they have independently
 * authorized the command and determined that the interval truly represents
 * global Doctor occupancy. The database exclusion constraint is authoritative.
 */
export async function insertDoctorOccupancyIntervalForAuthorizedCommand(pool, {
  doctorId,
  startsAt,
  endsAt,
  sourceType,
  sourceId = null,
  metadata = {}
}) {
  const start = DateTime.fromISO(String(startsAt), { setZone: true });
  const end = DateTime.fromISO(String(endsAt), { setZone: true });
  if (!start.isValid || !end.isValid || end.toMillis() <= start.toMillis()) {
    const error = new Error('Doctor occupancy interval is invalid');
    error.statusCode = 422;
    error.code = 'INVALID_OCCUPANCY_INTERVAL';
    throw error;
  }
  const source = String(sourceType ?? '').trim();
  if (!source || source.length > 80) {
    const error = new Error('sourceType is required and must be at most 80 characters');
    error.statusCode = 422;
    error.code = 'INVALID_OCCUPANCY_SOURCE';
    throw error;
  }

  try {
    const result = await pool.query(`
      insert into doctor_occupancy_intervals(
        doctor_id, starts_at, ends_at, source_type, source_id, metadata
      )
      values ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6::jsonb)
      returning *
    `, [
      doctorId,
      start.toUTC().toISO(),
      end.toUTC().toISO(),
      source,
      sourceId,
      JSON.stringify(metadata)
    ]);
    return result.rows[0];
  } catch (error) {
    if (error.code === '23P01') {
      throw conflict(
        'DOCTOR_OCCUPANCY_CONFLICT',
        'Doctor already has an overlapping global occupancy interval'
      );
    }
    if (error.code === '23505') {
      throw conflict(
        'OCCUPANCY_SOURCE_CONFLICT',
        'An occupancy interval already exists for this source'
      );
    }
    throw error;
  }
}

export async function projectAvailability(pool, affiliation, query) {
  const { from, to, slotMinutes } = validateProjectionQuery(query);
  const schedule = await getAvailabilitySchedule(pool, affiliation.id);

  if (!schedule.latestRevision) {
    return {
      affiliationId: affiliation.id,
      doctorId: affiliation.doctorId,
      facilityId: affiliation.facilityId,
      scheduleVersion: 0,
      timezoneName: null,
      from: from.toISO(),
      to: to.toISO(),
      slotMinutes,
      candidateSlots: [],
      exceptions: [],
      occupancy: [],
      projectionAuthoritative: false,
      policyCompleteness: 'SCHEDULE_NOT_CONFIGURED'
    };
  }

  const revision = schedule.latestRevision;
  const timezoneName = revision.timezoneName;
  const occupancy = await listDoctorOccupancy(
    pool,
    affiliation.doctorId,
    from.toISO(),
    to.toISO()
  );

  const fromMs = from.toMillis();
  const toMs = to.toMillis();
  const candidates = [];

  let day = from.setZone(timezoneName).startOf('day');
  const finalDay = to.minus({ milliseconds: 1 }).setZone(timezoneName).startOf('day');

  while (day.toMillis() <= finalDay.toMillis()) {
    const rules = revision.recurringRules.filter(rule => rule.isoWeekday === day.weekday);

    for (const rule of rules) {
      const ruleStart = buildLocalDateTime(day, rule.localStart, timezoneName);
      const ruleEnd = buildLocalDateTime(day, rule.localEnd, timezoneName);
      if (!ruleStart || !ruleEnd || ruleEnd.toMillis() <= ruleStart.toMillis()) continue;

      let cursor = ruleStart;
      while (cursor.plus({ minutes: slotMinutes }).toMillis() <= ruleEnd.toMillis()) {
        const slotEnd = cursor.plus({ minutes: slotMinutes });
        const startUtc = cursor.toUTC();
        const endUtc = slotEnd.toUTC();

        if (startUtc.toMillis() >= fromMs && endUtc.toMillis() <= toMs) {
          const occupancyConflicts = occupancy.filter(item =>
            overlaps(
              startUtc.toMillis(),
              endUtc.toMillis(),
              DateTime.fromJSDate(new Date(item.startsAt)).toMillis(),
              DateTime.fromJSDate(new Date(item.endsAt)).toMillis()
            )
          );

          candidates.push({
            ruleKey: rule.ruleKey,
            startsAt: startUtc.toISO(),
            endsAt: endUtc.toISO(),
            localStartsAt: cursor.toISO(),
            localEndsAt: slotEnd.toISO(),
            occupancyConflict: occupancyConflicts.length > 0,
            occupancyIntervalIds: occupancyConflicts.map(item => item.id),
            projectionStatus: occupancyConflicts.length > 0 ? 'OCCUPIED' : 'CANDIDATE',
            bookable: null
          });
        }
        cursor = slotEnd;
      }
    }

    day = day.plus({ days: 1 });
  }

  const overlappingExceptions = revision.exceptions.filter(exception =>
    overlaps(
      fromMs,
      toMs,
      DateTime.fromJSDate(new Date(exception.startsAt)).toMillis(),
      DateTime.fromJSDate(new Date(exception.endsAt)).toMillis()
    )
  );

  return {
    affiliationId: affiliation.id,
    doctorId: affiliation.doctorId,
    facilityId: affiliation.facilityId,
    scheduleVersion: schedule.version,
    scheduleRevisionId: revision.id,
    timezoneName,
    from: from.toISO(),
    to: to.toISO(),
    slotMinutes,
    candidateSlots: candidates,
    exceptions: overlappingExceptions,
    occupancy,
    projectionAuthoritative: false,
    policyCompleteness: 'PRODUCT_RULES_PENDING',
    policy: {
      slotMinutesSource: 'EXPLICIT_QUERY_PARAMETER_NOT_PRODUCT_DEFAULT',
      bookingHorizonApplied: false,
      exceptionPrecedenceApplied: false,
      contractWorkingDaysApplied: false,
      buffersApplied: false,
      existingAppointmentChangePolicyApplied: false,
      databaseBookingRevalidationStillRequired: true
    }
  };
}
