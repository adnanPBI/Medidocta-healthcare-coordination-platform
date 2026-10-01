import { DateTime, IANAZone } from 'luxon';

const MAX_RULES = 128;
const MAX_EXCEPTIONS = 256;
const MAX_METADATA_BYTES = 32 * 1024;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function fail(code, message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

function jsonObject(value, name) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_AVAILABILITY_METADATA', `${name} must be a JSON object`);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_METADATA_BYTES) {
    fail('AVAILABILITY_METADATA_TOO_LARGE', `${name} exceeds 32 KiB`);
  }
  return value;
}

function key(value, name) {
  const text = String(value ?? '').trim();
  if (!KEY.test(text)) fail('INVALID_AVAILABILITY_KEY', `${name} is invalid`);
  return text;
}

function time(value, name) {
  const text = String(value ?? '').trim();
  if (!TIME.test(text)) fail('INVALID_LOCAL_TIME', `${name} must be HH:mm or HH:mm:ss`);
  return text.length === 5 ? `${text}:00` : text;
}

function instant(value, name) {
  const text = String(value ?? '').trim();
  const parsed = DateTime.fromISO(text, { setZone: true });
  if (!parsed.isValid || !parsed.isOffsetFixed && !/[zZ]|[+-]\d\d:\d\d$/.test(text)) {
    fail('INVALID_AVAILABILITY_INSTANT', `${name} must be an ISO-8601 instant with offset`);
  }
  return parsed.toUTC();
}

export function validateTimezoneName(value) {
  const timezoneName = String(value ?? '').trim();
  if (!timezoneName || !IANAZone.isValidZone(timezoneName)) {
    fail('INVALID_TIMEZONE', 'timezoneName must be a valid IANA timezone');
  }
  return timezoneName;
}

export function validateAvailabilityRevision(input = {}) {
  const timezoneName = validateTimezoneName(input.timezoneName);
  const recurringRules = Array.isArray(input.recurringRules) ? input.recurringRules : [];
  const exceptions = Array.isArray(input.exceptions) ? input.exceptions : [];

  if (recurringRules.length > MAX_RULES) {
    fail('TOO_MANY_AVAILABILITY_RULES', `recurringRules may contain at most ${MAX_RULES} entries`);
  }
  if (exceptions.length > MAX_EXCEPTIONS) {
    fail('TOO_MANY_AVAILABILITY_EXCEPTIONS', `exceptions may contain at most ${MAX_EXCEPTIONS} entries`);
  }

  const ruleKeys = new Set();
  const normalizedRules = recurringRules.map((rule, index) => {
    const ruleKey = key(rule.ruleKey, `recurringRules[${index}].ruleKey`);
    if (ruleKeys.has(ruleKey)) fail('DUPLICATE_AVAILABILITY_RULE_KEY', `Duplicate ruleKey: ${ruleKey}`);
    ruleKeys.add(ruleKey);

    const isoWeekday = Number(rule.isoWeekday);
    if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
      fail('INVALID_AVAILABILITY_WEEKDAY', 'isoWeekday must be an integer from 1 (Monday) to 7 (Sunday)');
    }

    const localStart = time(rule.localStart, 'localStart');
    const localEnd = time(rule.localEnd, 'localEnd');
    if (localEnd <= localStart) {
      fail('INVALID_AVAILABILITY_TIME_RANGE', 'localEnd must be later than localStart on the same local day');
    }

    return {
      ruleKey,
      isoWeekday,
      localStart,
      localEnd,
      metadata: jsonObject(rule.metadata, 'recurring rule metadata')
    };
  });

  const exceptionKeys = new Set();
  const normalizedExceptions = exceptions.map((exception, index) => {
    const exceptionKey = key(exception.exceptionKey, `exceptions[${index}].exceptionKey`);
    if (exceptionKeys.has(exceptionKey)) {
      fail('DUPLICATE_AVAILABILITY_EXCEPTION_KEY', `Duplicate exceptionKey: ${exceptionKey}`);
    }
    exceptionKeys.add(exceptionKey);

    const startsAt = instant(exception.startsAt, 'startsAt');
    const endsAt = instant(exception.endsAt, 'endsAt');
    if (endsAt.toMillis() <= startsAt.toMillis()) {
      fail('INVALID_AVAILABILITY_EXCEPTION_RANGE', 'endsAt must be later than startsAt');
    }

    const kindCode = exception.kindCode === undefined || exception.kindCode === null
      ? null
      : String(exception.kindCode).trim();
    if (kindCode && kindCode.length > 64) {
      fail('INVALID_AVAILABILITY_EXCEPTION_KIND', 'kindCode must be at most 64 characters');
    }

    return {
      exceptionKey,
      startsAt: startsAt.toISO(),
      endsAt: endsAt.toISO(),
      kindCode: kindCode || null,
      metadata: jsonObject(exception.metadata, 'exception metadata')
    };
  });

  return {
    timezoneName,
    recurringRules: normalizedRules,
    exceptions: normalizedExceptions,
    metadata: jsonObject(input.metadata, 'availability revision metadata')
  };
}

export function validateProjectionQuery(query = {}) {
  const from = instant(query.from, 'from');
  const to = instant(query.to, 'to');
  if (to.toMillis() <= from.toMillis()) {
    fail('INVALID_PROJECTION_WINDOW', 'to must be later than from');
  }

  const technicalWindowDays = to.diff(from, 'days').days;
  if (technicalWindowDays > 31) {
    fail(
      'PROJECTION_WINDOW_TOO_LARGE',
      'Projection requests are technically limited to 31 days; this is not the product booking horizon'
    );
  }

  const slotMinutes = Number(query.slotMinutes);
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 480) {
    fail(
      'INVALID_SLOT_MINUTES',
      'slotMinutes must be an explicit integer from 5 to 480; no product default is assumed'
    );
  }

  return {
    from,
    to,
    slotMinutes
  };
}
