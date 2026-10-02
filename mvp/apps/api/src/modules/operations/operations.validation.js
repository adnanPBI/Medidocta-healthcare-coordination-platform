import { DateTime } from 'luxon';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMANTIC_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ROOM_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const CONSULTATION_FACTS = new Set(['CONSULTATION_STARTED','CONSULTATION_COMPLETED']);

function fail(code, message, statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function uuid(value, name) {
  const text = String(value ?? '').trim();
  if (!UUID.test(text)) fail('INVALID_OPERATION_REQUEST', `${name} must be a UUID`);
  return text.toLowerCase();
}

function instant(value, name) {
  const text = String(value ?? '').trim();
  if (!/[zZ]|[+-]\d\d:\d\d$/.test(text)) {
    fail('INVALID_OPERATION_INSTANT', `${name} must be an ISO-8601 instant with offset`);
  }
  const parsed = DateTime.fromISO(text, { setZone: true });
  if (!parsed.isValid) fail('INVALID_OPERATION_INSTANT', `${name} is not a valid ISO-8601 instant`);
  return parsed.toUTC();
}

function semanticKey(value) {
  const text = String(value ?? '').trim();
  if (!SEMANTIC_KEY.test(text)) {
    fail('INVALID_OPERATION_SEMANTIC_KEY', 'semanticKey must be 1-160 safe identifier characters');
  }
  return text;
}

function jsonObject(value, name) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_OPERATION_METADATA', `${name} must be a JSON object`);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32 * 1024) {
    fail('OPERATION_METADATA_TOO_LARGE', `${name} exceeds 32 KiB`);
  }
  return value;
}

export function validateArrivalFact(input = {}) {
  const partyKind = String(input.partyKind ?? '').trim().toUpperCase();
  if (!['PATIENT','DOCTOR'].includes(partyKind)) {
    fail('INVALID_ARRIVAL_PARTY', 'partyKind must be PATIENT or DOCTOR');
  }
  return {
    partyKind,
    arrivedAt: instant(input.arrivedAt, 'arrivedAt'),
    semanticKey: semanticKey(input.semanticKey),
    metadata: jsonObject(input.metadata, 'arrival metadata')
  };
}

export function validateConsultationFact(input = {}) {
  const factCode = String(input.factCode ?? '').trim().toUpperCase();
  if (!CONSULTATION_FACTS.has(factCode)) {
    fail('INVALID_CONSULTATION_FACT', 'factCode must be CONSULTATION_STARTED or CONSULTATION_COMPLETED');
  }
  return {
    factCode,
    occurredAt: instant(input.occurredAt, 'occurredAt'),
    semanticKey: semanticKey(input.semanticKey),
    metadata: jsonObject(input.metadata, 'consultation metadata')
  };
}

export function validateRoomAssignmentRevision(input = {}) {
  const expectedVersion = Number(input.expectedVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    fail('INVALID_ROOM_ASSIGNMENT_VERSION', 'expectedVersion must be an integer greater than or equal to zero');
  }
  const startsAt = input.startsAt == null ? null : instant(input.startsAt, 'startsAt');
  const endsAt = input.endsAt == null ? null : instant(input.endsAt, 'endsAt');
  if ((startsAt && !endsAt) || (!startsAt && endsAt)) {
    fail('INVALID_ROOM_ASSIGNMENT_INTERVAL', 'startsAt and endsAt must be supplied together');
  }
  if (startsAt && endsAt && endsAt.toMillis() <= startsAt.toMillis()) {
    fail('INVALID_ROOM_ASSIGNMENT_INTERVAL', 'endsAt must be later than startsAt');
  }
  return {
    roomId: uuid(input.roomId, 'roomId'),
    expectedVersion,
    startsAt,
    endsAt,
    metadata: jsonObject(input.metadata, 'room assignment metadata')
  };
}

export function validateOperationalWindow(query = {}) {
  const from = instant(query.from, 'from');
  const to = instant(query.to, 'to');
  if (to.toMillis() <= from.toMillis()) {
    fail('INVALID_OPERATION_WINDOW', 'to must be later than from');
  }
  if (to.diff(from, 'days').days > 31) {
    fail(
      'OPERATION_WINDOW_TOO_LARGE',
      'Operational read windows are technically limited to 31 days'
    );
  }
  return { from, to };
}

export function validateRoomDefinition(input = {}) {
  const code = String(input.code ?? '').trim();
  if (!ROOM_CODE.test(code)) fail('INVALID_ROOM_CODE', 'room code is invalid');
  const displayName = input.displayName == null ? null : String(input.displayName).trim();
  if (displayName && displayName.length > 160) {
    fail('INVALID_ROOM_NAME', 'displayName must be at most 160 characters');
  }
  return {
    facilityId: uuid(input.facilityId, 'facilityId'),
    code,
    displayName: displayName || null,
    metadata: jsonObject(input.metadata, 'room metadata')
  };
}

export function validateOperationResourceId(value, name = 'resourceId') {
  return uuid(value, name);
}
