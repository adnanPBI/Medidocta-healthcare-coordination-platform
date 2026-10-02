const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

function fail(code, message, statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function uuid(value, name, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const text = String(value ?? '').trim();
  if (!UUID.test(text)) fail('INVALID_NOTIFICATION_REQUEST', `${name} must be a UUID`);
  return text.toLowerCase();
}

function code(value, name, max = 160) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max || !CODE.test(text)) {
    fail('INVALID_NOTIFICATION_REQUEST', `${name} is invalid`);
  }
  return text;
}

function payload(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_NOTIFICATION_PAYLOAD', 'payload must be a JSON object');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 64 * 1024) {
    fail('NOTIFICATION_PAYLOAD_TOO_LARGE', 'payload exceeds 64 KiB');
  }
  return value;
}

export function validateNotificationIntent(input = {}) {
  const locale = String(input.locale ?? '').trim().toLowerCase();
  if (!['fr','en'].includes(locale)) {
    fail('INVALID_NOTIFICATION_LOCALE', 'locale must be fr or en');
  }
  const idempotencyKey = String(input.idempotencyKey ?? '').trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    fail('INVALID_NOTIFICATION_IDEMPOTENCY_KEY', 'idempotencyKey must be 8-200 characters');
  }

  return {
    sourceOutboxEventId: uuid(input.sourceOutboxEventId, 'sourceOutboxEventId', true),
    recipientAccountId: uuid(input.recipientAccountId, 'recipientAccountId'),
    channelCode: code(input.channelCode, 'channelCode', 80),
    templateCode: code(input.templateCode, 'templateCode', 160),
    locale,
    idempotencyKey,
    payload: payload(input.payload)
  };
}
