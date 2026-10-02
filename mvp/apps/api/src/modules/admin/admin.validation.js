import { DateTime } from 'luxon';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const OUTBOX_STATUSES = new Set(['PENDING','PROCESSING','DELIVERED','FAILED']);
const NOTIFICATION_STATUSES = new Set(['PENDING','PROCESSING','DELIVERED','FAILED']);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 422;
  throw error;
}

function optionalCode(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!CODE.test(text)) fail('INVALID_ADMIN_FILTER', `${name} is invalid`);
  return text;
}

function optionalUuid(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!UUID.test(text)) fail('INVALID_ADMIN_FILTER', `${name} must be a UUID`);
  return text.toLowerCase();
}

function optionalInstant(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/[zZ]|[+-]\d\d:\d\d$/.test(text)) {
    fail('INVALID_ADMIN_FILTER', `${name} must be an ISO-8601 instant with offset`);
  }
  const dt = DateTime.fromISO(text, { setZone: true });
  if (!dt.isValid) fail('INVALID_ADMIN_FILTER', `${name} is invalid`);
  return dt.toUTC().toISO();
}

export function validateAdminPaging(query = {}) {
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    fail('INVALID_ADMIN_PAGING', 'limit must be an integer from 1 to 200');
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) {
    fail('INVALID_ADMIN_PAGING', 'offset must be an integer from 0 to 100000');
  }
  return { limit, offset };
}

export function validateAuditFilters(query = {}) {
  const { limit, offset } = validateAdminPaging(query);
  return {
    limit,
    offset,
    actionCode: optionalCode(query.actionCode, 'actionCode'),
    resourceType: optionalCode(query.resourceType, 'resourceType'),
    resourceId: optionalUuid(query.resourceId, 'resourceId'),
    actorAccountId: optionalUuid(query.actorAccountId, 'actorAccountId'),
    from: optionalInstant(query.from, 'from'),
    to: optionalInstant(query.to, 'to')
  };
}

export function validateOutboxFilters(query = {}) {
  const { limit, offset } = validateAdminPaging(query);
  const status = query.status == null || query.status === ''
    ? null
    : String(query.status).trim().toUpperCase();
  if (status && !OUTBOX_STATUSES.has(status)) {
    fail('INVALID_ADMIN_FILTER', 'status is not a valid outbox status');
  }
  return {
    limit,
    offset,
    status,
    eventType: optionalCode(query.eventType, 'eventType')
  };
}

export function validateNotificationFilters(query = {}) {
  const { limit, offset } = validateAdminPaging(query);
  const status = query.status == null || query.status === ''
    ? null
    : String(query.status).trim().toUpperCase();
  if (status && !NOTIFICATION_STATUSES.has(status)) {
    fail('INVALID_ADMIN_FILTER', 'status is not a valid notification status');
  }
  return { limit, offset, status };
}

export function validateAdminResourceId(value, name = 'resourceId') {
  const id = optionalUuid(value, name);
  if (!id) fail('INVALID_ADMIN_FILTER', `${name} is required`);
  return id;
}
