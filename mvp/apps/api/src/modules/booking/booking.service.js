import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';

function error(code, message, statusCode) {
  const value = new Error(message);
  value.code = code;
  value.statusCode = statusCode;
  return value;
}

function requestHash(input, patientProfileId) {
  const canonical = JSON.stringify({
    affiliationId: input.affiliationId,
    scheduleRevisionId: input.scheduleRevisionId,
    startsAt: input.startsAt.toISO(),
    endsAt: input.endsAt.toISO(),
    subjectPatientProfileId: patientProfileId
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function mapAppointment(row) {
  return {
    id: row.id,
    patientProfileId: row.patient_profile_id,
    bookedByAccountId: row.booked_by_account_id,
    doctorId: row.doctor_id,
    facilityId: row.facility_id,
    affiliationId: row.affiliation_id,
    availabilityScheduleId: row.availability_schedule_id,
    scheduleRevisionId: row.schedule_revision_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    version: row.version,
    metadata: row.metadata,
    doctor: row.doctor_display_name === undefined ? undefined : {
      displayName: row.doctor_display_name
    },
    facility: row.facility_display_name === undefined ? undefined : {
      displayName: row.facility_display_name
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const appointmentSelect = `
  select a.*,
         dp.display_name as doctor_display_name,
         hf.display_name as facility_display_name
  from appointments a
  join doctor_profiles dp on dp.id = a.doctor_id
  join healthcare_facilities hf on hf.id = a.facility_id
`;

async function getAppointmentWithDb(db, appointmentId) {
  const result = await db.query(
    `${appointmentSelect} where a.id = $1`,
    [appointmentId]
  );
  if (!result.rows[0]) {
    throw error('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);
  }
  return mapAppointment(result.rows[0]);
}

export async function getAppointment(pool, appointmentId) {
  return getAppointmentWithDb(pool, appointmentId);
}

export async function listPatientAppointments(pool, patientProfileId, limit = 100) {
  const result = await pool.query(
    `${appointmentSelect}
     where a.patient_profile_id = $1
     order by a.starts_at desc, a.id
     limit $2`,
    [patientProfileId, limit]
  );
  return result.rows.map(mapAppointment);
}

export async function listDoctorAppointments(pool, doctorId, limit = 100) {
  const result = await pool.query(
    `${appointmentSelect}
     where a.doctor_id = $1
     order by a.starts_at desc, a.id
     limit $2`,
    [doctorId, limit]
  );
  return result.rows.map(mapAppointment);
}

export async function listFacilityAppointments(pool, facilityId, limit = 100) {
  const result = await pool.query(
    `${appointmentSelect}
     where a.facility_id = $1
     order by a.starts_at desc, a.id
     limit $2`,
    [facilityId, limit]
  );
  return result.rows.map(mapAppointment);
}

export async function listAppointmentEvents(pool, appointmentId) {
  const result = await pool.query(`
    select id, appointment_id, sequence_number, event_code,
           actor_account_id, semantic_key, payload, created_at
    from appointment_events
    where appointment_id = $1
    order by sequence_number, id
  `, [appointmentId]);
  return result.rows.map(row => ({
    id: row.id,
    appointmentId: row.appointment_id,
    sequenceNumber: row.sequence_number,
    eventCode: row.event_code,
    actorAccountId: row.actor_account_id,
    semanticKey: row.semantic_key,
    payload: row.payload,
    createdAt: row.created_at
  }));
}

function parseLimit(value) {
  if (value === undefined) return 100;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw error('INVALID_LIMIT', 'limit must be an integer from 1 to 100', 422);
  }
  return parsed;
}

export function appointmentListLimit(value) {
  return parseLimit(value);
}

function localTime(dt) {
  return dt.toFormat('HH:mm:ss');
}

async function loadLockedBookingContext(client, affiliationId) {
  const result = await client.query(`
    select dfa.id as affiliation_id,
           dfa.doctor_id,
           dfa.facility_id,
           dfa.status as affiliation_status,
           dfa.booking_enabled,
           aas.id as schedule_id,
           aas.version as schedule_version,
           asr.id as schedule_revision_id,
           asr.timezone_name
    from doctor_facility_affiliations dfa
    join affiliation_availability_schedules aas
      on aas.affiliation_id = dfa.id
    left join availability_schedule_revisions asr
      on asr.schedule_id = aas.id
     and asr.revision_number = aas.version
    where dfa.id = $1
    for share of dfa, aas
  `, [affiliationId]);

  const row = result.rows[0];
  if (!row) throw error('AFFILIATION_NOT_FOUND', 'Doctor-Facility affiliation not found', 404);
  return row;
}

async function revalidateRecurringAvailability(client, context, input) {
  if (!context.schedule_revision_id || Number(context.schedule_version) < 1) {
    throw error(
      'BOOKING_SCHEDULE_NOT_CONFIGURED',
      'This affiliation does not have a configured availability schedule',
      409
    );
  }

  if (context.schedule_revision_id !== input.scheduleRevisionId) {
    throw error(
      'AVAILABILITY_VERSION_CONFLICT',
      'Availability changed after the slot was displayed; refresh availability before booking',
      409
    );
  }

  const startLocal = input.startsAt.setZone(context.timezone_name);
  const endLocal = input.endsAt.setZone(context.timezone_name);

  if (
    !startLocal.isValid ||
    !endLocal.isValid ||
    startLocal.toISODate() !== endLocal.toISODate()
  ) {
    throw error(
      'BOOKING_OUTSIDE_AVAILABILITY',
      'Requested booking must fit within one configured local availability day',
      409
    );
  }

  const ruleResult = await client.query(`
    select id, rule_key
    from availability_recurring_rules
    where schedule_revision_id = $1
      and iso_weekday = $2
      and local_start <= $3::time
      and local_end >= $4::time
    order by local_start, rule_key
    limit 1
  `, [
    context.schedule_revision_id,
    startLocal.weekday,
    localTime(startLocal),
    localTime(endLocal)
  ]);

  if (!ruleResult.rowCount) {
    throw error(
      'BOOKING_OUTSIDE_AVAILABILITY',
      'Requested interval is outside the current recurring availability',
      409
    );
  }

  const exceptionResult = await client.query(`
    select id, exception_key, kind_code
    from availability_exception_windows
    where schedule_revision_id = $1
      and starts_at < $3::timestamptz
      and ends_at > $2::timestamptz
    order by starts_at, id
    limit 1
  `, [
    context.schedule_revision_id,
    input.startsAt.toISO(),
    input.endsAt.toISO()
  ]);

  if (exceptionResult.rowCount) {
    throw error(
      'BOOKING_EXCEPTION_POLICY_UNRESOLVED',
      'An availability exception overlaps this interval; booking is blocked until exception precedence is approved',
      409
    );
  }

  return {
    recurringRuleId: ruleResult.rows[0].id,
    recurringRuleKey: ruleResult.rows[0].rule_key,
    timezoneName: context.timezone_name
  };
}

export async function createAppointmentBooking(pool, {
  actorAccountId,
  patientProfileId,
  idempotencyKey,
  input
}) {
  const hash = requestHash(input, patientProfileId);
  const client = await pool.connect();

  try {
    await client.query('begin');

    await client.query(`
      insert into booking_idempotency(
        account_id, idempotency_key, request_hash, status
      )
      values ($1, $2, $3, 'IN_PROGRESS')
      on conflict (account_id, idempotency_key) do nothing
    `, [actorAccountId, idempotencyKey, hash]);

    const idemResult = await client.query(`
      select account_id, idempotency_key, request_hash, status, appointment_id
      from booking_idempotency
      where account_id = $1 and idempotency_key = $2
      for update
    `, [actorAccountId, idempotencyKey]);

    const idem = idemResult.rows[0];
    if (!idem) {
      throw error('IDEMPOTENCY_STATE_ERROR', 'Unable to establish idempotency state', 500);
    }
    if (idem.request_hash !== hash) {
      throw error(
        'IDEMPOTENCY_KEY_REUSE',
        'Idempotency-Key was already used with a different booking request',
        409
      );
    }
    if (idem.status === 'COMPLETE' && idem.appointment_id) {
      const appointment = await getAppointmentWithDb(client, idem.appointment_id);
      await client.query('commit');
      return {
        appointment,
        idempotentReplay: true
      };
    }

    const bookingContext = await loadLockedBookingContext(client, input.affiliationId);

    if (!bookingContext.booking_enabled) {
      throw error(
        'BOOKING_NOT_ENABLED_FOR_AFFILIATION',
        'Booking is not enabled for this Doctor-Facility affiliation',
        409
      );
    }

    const scheduleEvidence = await revalidateRecurringAvailability(
      client,
      bookingContext,
      input
    );

    const appointmentResult = await client.query(`
      insert into appointments(
        patient_profile_id,
        booked_by_account_id,
        doctor_id,
        facility_id,
        affiliation_id,
        availability_schedule_id,
        schedule_revision_id,
        starts_at,
        ends_at,
        metadata
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        $8::timestamptz, $9::timestamptz, $10::jsonb
      )
      returning *
    `, [
      patientProfileId,
      actorAccountId,
      bookingContext.doctor_id,
      bookingContext.facility_id,
      bookingContext.affiliation_id,
      bookingContext.schedule_id,
      bookingContext.schedule_revision_id,
      input.startsAt.toISO(),
      input.endsAt.toISO(),
      JSON.stringify({
        bookingFoundation: {
          recurringRuleKey: scheduleEvidence.recurringRuleKey,
          timezoneName: scheduleEvidence.timezoneName,
          exceptionPrecedenceApplied: false,
          contractWorkingDaysApplied: false,
          bookingHorizonApplied: false,
          buffersApplied: false,
          financialTermsSnapshotApplied: false
        }
      })
    ]);

    const appointment = appointmentResult.rows[0];

    try {
      await client.query(`
        insert into doctor_occupancy_intervals(
          doctor_id,
          starts_at,
          ends_at,
          source_type,
          source_id,
          metadata
        )
        values (
          $1, $2::timestamptz, $3::timestamptz,
          'APPOINTMENT', $4, $5::jsonb
        )
      `, [
        bookingContext.doctor_id,
        input.startsAt.toISO(),
        input.endsAt.toISO(),
        appointment.id,
        JSON.stringify({
          appointmentId: appointment.id,
          facilityId: bookingContext.facility_id,
          affiliationId: bookingContext.affiliation_id
        })
      ]);
    } catch (dbError) {
      if (dbError.code === '23P01') {
        throw error(
          'BOOKING_CONFLICT',
          'The Doctor is no longer available for the requested interval',
          409
        );
      }
      if (dbError.code === '23505') {
        throw error(
          'BOOKING_CONFLICT',
          'The requested booking occupancy already exists',
          409
        );
      }
      throw dbError;
    }

    await client.query(`
      insert into appointment_events(
        appointment_id,
        sequence_number,
        event_code,
        actor_account_id,
        semantic_key,
        payload
      )
      values (
        $1, 1, 'APPOINTMENT_CREATED', $2, 'CREATE',
        $3::jsonb
      )
    `, [
      appointment.id,
      actorAccountId,
      JSON.stringify({
        patientProfileId,
        affiliationId: bookingContext.affiliation_id,
        scheduleRevisionId: bookingContext.schedule_revision_id
      })
    ]);

    await client.query(`
      insert into outbox_events(
        aggregate_type,
        aggregate_id,
        event_type,
        event_key,
        payload
      )
      values (
        'APPOINTMENT',
        $1,
        'APPOINTMENT_CREATED',
        'APPOINTMENT_CREATED:1',
        $2::jsonb
      )
    `, [
      appointment.id,
      JSON.stringify({
        appointmentId: appointment.id,
        patientProfileId,
        doctorId: bookingContext.doctor_id,
        facilityId: bookingContext.facility_id,
        affiliationId: bookingContext.affiliation_id,
        startsAt: input.startsAt.toISO(),
        endsAt: input.endsAt.toISO()
      })
    ]);

    await client.query(`
      update booking_idempotency
      set status = 'COMPLETE',
          appointment_id = $3,
          updated_at = now()
      where account_id = $1 and idempotency_key = $2
    `, [actorAccountId, idempotencyKey, appointment.id]);

    await client.query(`
      insert into audit_events(
        actor_account_id,
        action_code,
        resource_type,
        resource_id,
        metadata
      )
      values (
        $1,
        'APPOINTMENT_BOOKED',
        'APPOINTMENT',
        $2,
        jsonb_build_object(
          'patient_profile_id', $3::text,
          'doctor_id', $4::text,
          'facility_id', $5::text,
          'affiliation_id', $6::text,
          'schedule_revision_id', $7::text
        )
      )
    `, [
      actorAccountId,
      appointment.id,
      patientProfileId,
      bookingContext.doctor_id,
      bookingContext.facility_id,
      bookingContext.affiliation_id,
      bookingContext.schedule_revision_id
    ]);

    await client.query('commit');

    return {
      appointment: await getAppointment(pool, appointment.id),
      idempotentReplay: false
    };
  } catch (value) {
    try {
      await client.query('rollback');
    } catch {
      // Preserve original error.
    }
    throw value;
  } finally {
    client.release();
  }
}
