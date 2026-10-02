import {
  validateArrivalFact,
  validateConsultationFact,
  validateRoomAssignmentRevision,
  validateRoomDefinition
} from './operations.validation.js';

function fail(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function mapArrival(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    partyKind: row.party_kind,
    arrivedAt: row.arrived_at,
    recordedByAccountId: row.recorded_by_account_id,
    semanticKey: row.semantic_key,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function mapConsultationFact(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    factCode: row.fact_code,
    occurredAt: row.occurred_at,
    recordedByAccountId: row.recorded_by_account_id,
    semanticKey: row.semantic_key,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function mapRoomAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id,
    revisionNumber: row.revision_number,
    appointmentId: row.appointment_id,
    roomId: row.room_id,
    facilityId: row.facility_id,
    roomCode: row.room_code,
    roomDisplayName: row.room_display_name,
    assignedByAccountId: row.assigned_by_account_id,
    startsAt: row.assignment_starts_at,
    endsAt: row.assignment_ends_at,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

async function lockAppointment(client, appointmentId) {
  const result = await client.query(`
    select id, patient_profile_id, doctor_id, facility_id,
           affiliation_id, starts_at, ends_at, version
    from appointments
    where id = $1
    for update
  `, [appointmentId]);

  if (!result.rows[0]) {
    throw fail('APPOINTMENT_NOT_FOUND', 'Appointment not found', 404);
  }
  return result.rows[0];
}

async function appendAppointmentEvent(client, {
  appointmentId,
  eventCode,
  actorAccountId,
  semanticKey,
  payload
}) {
  const next = await client.query(`
    select coalesce(max(sequence_number), 0) + 1 as next_sequence
    from appointment_events
    where appointment_id = $1
  `, [appointmentId]);

  const result = await client.query(`
    insert into appointment_events(
      appointment_id,
      sequence_number,
      event_code,
      actor_account_id,
      semantic_key,
      payload
    )
    values ($1, $2, $3, $4, $5, $6::jsonb)
    returning *
  `, [
    appointmentId,
    Number(next.rows[0].next_sequence),
    eventCode,
    actorAccountId,
    semanticKey,
    JSON.stringify(payload ?? {})
  ]);

  return result.rows[0];
}

async function appendOutbox(client, {
  appointmentId,
  eventType,
  eventKey,
  payload
}) {
  await client.query(`
    insert into outbox_events(
      aggregate_type,
      aggregate_id,
      event_type,
      event_key,
      payload
    )
    values ('APPOINTMENT', $1, $2, $3, $4::jsonb)
    on conflict (aggregate_type, aggregate_id, event_key) do nothing
  `, [
    appointmentId,
    eventType,
    eventKey,
    JSON.stringify(payload ?? {})
  ]);
}

export async function recordArrivalFactForAuthorizedActor(pool, {
  appointmentId,
  actorAccountId,
  ...rawInput
}) {
  const input = validateArrivalFact(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const appointment = await lockAppointment(client, appointmentId);

    const existing = await client.query(`
      select *
      from appointment_arrival_facts
      where appointment_id = $1 and party_kind = $2
    `, [appointmentId, input.partyKind]);

    if (existing.rows[0]) {
      await client.query('commit');
      return {
        fact: mapArrival(existing.rows[0]),
        idempotentReplay: true
      };
    }

    const inserted = await client.query(`
      insert into appointment_arrival_facts(
        appointment_id,
        party_kind,
        arrived_at,
        recorded_by_account_id,
        semantic_key,
        metadata
      )
      values ($1, $2, $3::timestamptz, $4, $5, $6::jsonb)
      returning *
    `, [
      appointmentId,
      input.partyKind,
      input.arrivedAt.toISO(),
      actorAccountId,
      input.semanticKey,
      JSON.stringify(input.metadata)
    ]);

    const fact = mapArrival(inserted.rows[0]);
    const eventCode = input.partyKind === 'PATIENT'
      ? 'PATIENT_ARRIVED'
      : 'DOCTOR_ARRIVED';

    await appendAppointmentEvent(client, {
      appointmentId,
      eventCode,
      actorAccountId,
      semanticKey: `ARRIVAL:${input.partyKind}`,
      payload: {
        arrivalFactId: fact.id,
        partyKind: input.partyKind,
        arrivedAt: input.arrivedAt.toISO()
      }
    });

    await appendOutbox(client, {
      appointmentId,
      eventType: eventCode,
      eventKey: `${eventCode}:${fact.id}`,
      payload: {
        appointmentId,
        arrivalFactId: fact.id,
        partyKind: input.partyKind,
        arrivedAt: input.arrivedAt.toISO(),
        facilityId: appointment.facility_id,
        doctorId: appointment.doctor_id,
        patientProfileId: appointment.patient_profile_id
      }
    });

    await client.query(`
      insert into audit_events(
        actor_account_id, action_code, resource_type, resource_id, metadata
      )
      values (
        $1, $2, 'APPOINTMENT', $3,
        jsonb_build_object(
          'arrival_fact_id', $4::text,
          'party_kind', $5::text
        )
      )
    `, [
      actorAccountId,
      eventCode,
      appointmentId,
      fact.id,
      input.partyKind
    ]);

    await client.query('commit');
    return { fact, idempotentReplay: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function appendConsultationFactForAuthorizedActor(pool, {
  appointmentId,
  actorAccountId,
  ...rawInput
}) {
  const input = validateConsultationFact(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const appointment = await lockAppointment(client, appointmentId);

    const existing = await client.query(`
      select *
      from appointment_consultation_facts
      where appointment_id = $1 and semantic_key = $2
    `, [appointmentId, input.semanticKey]);

    if (existing.rows[0]) {
      await client.query('commit');
      return {
        fact: mapConsultationFact(existing.rows[0]),
        idempotentReplay: true
      };
    }

    const inserted = await client.query(`
      insert into appointment_consultation_facts(
        appointment_id,
        fact_code,
        occurred_at,
        recorded_by_account_id,
        semantic_key,
        metadata
      )
      values ($1, $2, $3::timestamptz, $4, $5, $6::jsonb)
      returning *
    `, [
      appointmentId,
      input.factCode,
      input.occurredAt.toISO(),
      actorAccountId,
      input.semanticKey,
      JSON.stringify(input.metadata)
    ]);

    const fact = mapConsultationFact(inserted.rows[0]);

    await appendAppointmentEvent(client, {
      appointmentId,
      eventCode: input.factCode,
      actorAccountId,
      semanticKey: `CONSULTATION:${input.semanticKey}`,
      payload: {
        consultationFactId: fact.id,
        factCode: input.factCode,
        occurredAt: input.occurredAt.toISO()
      }
    });

    await appendOutbox(client, {
      appointmentId,
      eventType: input.factCode,
      eventKey: `${input.factCode}:${fact.id}`,
      payload: {
        appointmentId,
        consultationFactId: fact.id,
        factCode: input.factCode,
        occurredAt: input.occurredAt.toISO(),
        facilityId: appointment.facility_id,
        doctorId: appointment.doctor_id,
        patientProfileId: appointment.patient_profile_id
      }
    });

    await client.query(`
      insert into audit_events(
        actor_account_id, action_code, resource_type, resource_id, metadata
      )
      values (
        $1, $2, 'APPOINTMENT', $3,
        jsonb_build_object('consultation_fact_id', $4::text)
      )
    `, [actorAccountId, input.factCode, appointmentId, fact.id]);

    await client.query('commit');
    return { fact, idempotentReplay: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function createFacilityRoomForAuthorizedActor(pool, {
  actorAccountId,
  ...rawInput
}) {
  const input = validateRoomDefinition(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const result = await client.query(`
      insert into facility_rooms(
        facility_id, code, display_name, metadata
      )
      values ($1, $2, $3, $4::jsonb)
      returning *
    `, [
      input.facilityId,
      input.code,
      input.displayName,
      JSON.stringify(input.metadata)
    ]);

    await client.query(`
      insert into audit_events(
        actor_account_id, action_code, resource_type, resource_id, metadata
      )
      values (
        $1, 'FACILITY_ROOM_CREATED', 'FACILITY_ROOM', $2,
        jsonb_build_object('facility_id', $3::text, 'room_code', $4::text)
      )
    `, [
      actorAccountId,
      result.rows[0].id,
      input.facilityId,
      input.code
    ]);

    await client.query('commit');
    return result.rows[0];
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function appendRoomAssignmentRevisionForAuthorizedActor(pool, {
  appointmentId,
  actorAccountId,
  ...rawInput
}) {
  const input = validateRoomAssignmentRevision(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const appointment = await lockAppointment(client, appointmentId);

    const threadResult = await client.query(`
      select id, version
      from appointment_room_assignment_threads
      where appointment_id = $1
      for update
    `, [appointmentId]);

    const thread = threadResult.rows[0];
    if (!thread) {
      throw fail('ROOM_ASSIGNMENT_THREAD_NOT_FOUND', 'Room assignment thread not found', 404);
    }
    if (Number(thread.version) !== input.expectedVersion) {
      throw fail(
        'ROOM_ASSIGNMENT_VERSION_CONFLICT',
        'Room assignment changed; reload before saving',
        409
      );
    }

    const roomResult = await client.query(`
      select id, facility_id, code, display_name, status
      from facility_rooms
      where id = $1
    `, [input.roomId]);

    const room = roomResult.rows[0];
    if (!room || room.status !== 'ACTIVE') {
      throw fail('ROOM_NOT_FOUND', 'Active Facility room not found', 404);
    }
    if (room.facility_id !== appointment.facility_id) {
      throw fail(
        'ROOM_FACILITY_MISMATCH',
        'Room must belong to the Appointment Healthcare Facility',
        409
      );
    }

    const startsAt = input.startsAt?.toISO() ?? appointment.starts_at;
    const endsAt = input.endsAt?.toISO() ?? appointment.ends_at;
    const nextRevision = Number(thread.version) + 1;

    const inserted = await client.query(`
      insert into appointment_room_assignment_revisions(
        thread_id,
        revision_number,
        room_id,
        facility_id,
        assigned_by_account_id,
        assignment_starts_at,
        assignment_ends_at,
        metadata
      )
      values (
        $1, $2, $3, $4, $5,
        $6::timestamptz, $7::timestamptz, $8::jsonb
      )
      returning *
    `, [
      thread.id,
      nextRevision,
      room.id,
      room.facility_id,
      actorAccountId,
      startsAt,
      endsAt,
      JSON.stringify(input.metadata)
    ]);

    await client.query(`
      update appointment_room_assignment_threads
      set version = $2, updated_at = now()
      where id = $1
    `, [thread.id, nextRevision]);

    const assignment = mapRoomAssignment({
      ...inserted.rows[0],
      appointment_id: appointmentId,
      room_code: room.code,
      room_display_name: room.display_name
    });

    await appendAppointmentEvent(client, {
      appointmentId,
      eventCode: 'ROOM_ASSIGNMENT_RECORDED',
      actorAccountId,
      semanticKey: `ROOM_ASSIGNMENT:${nextRevision}`,
      payload: {
        roomAssignmentRevisionId: assignment.id,
        roomId: room.id,
        roomCode: room.code,
        revisionNumber: nextRevision,
        roomExclusivityApplied: false
      }
    });

    await appendOutbox(client, {
      appointmentId,
      eventType: 'ROOM_ASSIGNMENT_RECORDED',
      eventKey: `ROOM_ASSIGNMENT_RECORDED:${nextRevision}`,
      payload: {
        appointmentId,
        roomAssignmentRevisionId: assignment.id,
        roomId: room.id,
        facilityId: room.facility_id,
        revisionNumber: nextRevision
      }
    });

    await client.query(`
      insert into audit_events(
        actor_account_id, action_code, resource_type, resource_id, metadata
      )
      values (
        $1, 'ROOM_ASSIGNMENT_RECORDED', 'APPOINTMENT', $2,
        jsonb_build_object(
          'room_assignment_revision_id', $3::text,
          'room_id', $4::text,
          'revision_number', $5::integer,
          'room_exclusivity_applied', false
        )
      )
    `, [
      actorAccountId,
      appointmentId,
      assignment.id,
      room.id,
      nextRevision
    ]);

    await client.query('commit');
    return assignment;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAppointmentOperations(pool, appointmentId) {
  const [arrivalResult, consultationResult, roomResult] = await Promise.all([
    pool.query(`
      select *
      from appointment_arrival_facts
      where appointment_id = $1
      order by party_kind
    `, [appointmentId]),
    pool.query(`
      select *
      from appointment_consultation_facts
      where appointment_id = $1
      order by occurred_at, created_at, id
    `, [appointmentId]),
    pool.query(`
      select arar.*, arat.appointment_id,
             fr.code as room_code, fr.display_name as room_display_name
      from appointment_room_assignment_threads arat
      left join appointment_room_assignment_revisions arar
        on arar.thread_id = arat.id
       and arar.revision_number = arat.version
      left join facility_rooms fr on fr.id = arar.room_id
      where arat.appointment_id = $1
    `, [appointmentId])
  ]);

  return {
    appointmentId,
    arrivals: arrivalResult.rows.map(mapArrival),
    consultationFacts: consultationResult.rows.map(mapConsultationFact),
    roomAssignment: roomResult.rows[0]?.id
      ? mapRoomAssignment(roomResult.rows[0])
      : null,
    policy: {
      arrivalReversibilityApplied: false,
      consultationLifecycleApplied: false,
      roomExclusivityApplied: false
    }
  };
}

export async function listFacilityRooms(pool, facilityId) {
  const result = await pool.query(`
    select id, facility_id, code, display_name, status, version,
           metadata, created_at, updated_at
    from facility_rooms
    where facility_id = $1
    order by status, code, id
  `, [facilityId]);

  return result.rows.map(row => ({
    id: row.id,
    facilityId: row.facility_id,
    code: row.code,
    displayName: row.display_name,
    status: row.status,
    version: row.version,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function listFacilityRoomAllocations(pool, facilityId, from, to) {
  const result = await pool.query(`
    with latest as (
      select arar.*, arat.appointment_id,
             row_number() over (
               partition by arar.thread_id
               order by arar.revision_number desc
             ) as rn
      from appointment_room_assignment_revisions arar
      join appointment_room_assignment_threads arat on arat.id = arar.thread_id
      where arar.facility_id = $1
    )
    select latest.*, fr.code as room_code, fr.display_name as room_display_name
    from latest
    join facility_rooms fr on fr.id = latest.room_id
    where latest.rn = 1
      and latest.assignment_starts_at < $3::timestamptz
      and latest.assignment_ends_at > $2::timestamptz
    order by latest.assignment_starts_at, fr.code, latest.appointment_id
  `, [facilityId, from.toISO(), to.toISO()]);

  return {
    facilityId,
    from: from.toISO(),
    to: to.toISO(),
    roomExclusivityApplied: false,
    items: result.rows.map(mapRoomAssignment)
  };
}

export async function listFacilityReceptionAppointments(pool, facilityId, from, to) {
  const appointments = await pool.query(`
    select a.id, a.patient_profile_id, a.doctor_id, a.facility_id,
           a.affiliation_id, a.starts_at, a.ends_at, a.version,
           dp.display_name as doctor_display_name
    from appointments a
    join doctor_profiles dp on dp.id = a.doctor_id
    where a.facility_id = $1
      and a.starts_at < $3::timestamptz
      and a.ends_at > $2::timestamptz
    order by a.starts_at, a.id
  `, [facilityId, from.toISO(), to.toISO()]);

  const items = [];
  for (const row of appointments.rows) {
    const operations = await getAppointmentOperations(pool, row.id);
    items.push({
      appointmentId: row.id,
      patientProfileId: row.patient_profile_id,
      doctorId: row.doctor_id,
      doctorDisplayName: row.doctor_display_name,
      facilityId: row.facility_id,
      affiliationId: row.affiliation_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      appointmentVersion: row.version,
      operations
    });
  }

  return {
    facilityId,
    from: from.toISO(),
    to: to.toISO(),
    items,
    policy: {
      arrivalReversibilityApplied: false,
      consultationLifecycleApplied: false,
      roomExclusivityApplied: false
    }
  };
}
