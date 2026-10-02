const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const SUPPORTED_RESOURCE_TYPES = new Set([
  'APPOINTMENT',
  'PATIENT_PROFILE',
  'DOCTOR_PROFILE',
  'HEALTHCARE_FACILITY',
  'DOCTOR_FACILITY_AFFILIATION'
]);

function fail(code, message, statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function uuid(value, name) {
  const text = String(value ?? '').trim();
  if (!UUID.test(text)) fail('INVALID_FILE_REQUEST', `${name} must be a UUID`);
  return text.toLowerCase();
}

function metadata(value) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_FILE_METADATA', 'metadata must be a JSON object');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32 * 1024) {
    fail('FILE_METADATA_TOO_LARGE', 'metadata exceeds 32 KiB');
  }
  return value;
}

function safeText(value, name, max) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    fail('INVALID_FILE_REQUEST', `${name} is invalid`);
  }
  return text;
}

export function validateFileRegistration(input = {}) {
  const storageBackendCode = safeText(input.storageBackendCode, 'storageBackendCode', 80);
  if (!CODE.test(storageBackendCode)) {
    fail('INVALID_FILE_REQUEST', 'storageBackendCode must be a stable machine code');
  }

  const byteSize = Number(input.byteSize);
  if (!Number.isSafeInteger(byteSize) || byteSize < 0) {
    fail('INVALID_FILE_SIZE', 'byteSize must be a non-negative safe integer');
  }

  const sha256 = String(input.sha256 ?? '').trim().toLowerCase();
  if (!SHA256.test(sha256)) {
    fail('INVALID_FILE_HASH', 'sha256 must be a 64-character lowercase hexadecimal SHA-256');
  }

  return {
    storageBackendCode,
    storageObjectKey: safeText(input.storageObjectKey, 'storageObjectKey', 1024),
    originalFilename: safeText(input.originalFilename, 'originalFilename', 255),
    contentType: safeText(input.contentType, 'contentType', 255),
    byteSize,
    sha256,
    metadata: metadata(input.metadata)
  };
}

export function validateFileAttachment(input = {}) {
  const resourceType = safeText(input.resourceType, 'resourceType', 80);
  const relationCode = safeText(input.relationCode, 'relationCode', 80);
  if (!CODE.test(resourceType) || !CODE.test(relationCode)) {
    fail('INVALID_FILE_ATTACHMENT', 'resourceType and relationCode must be stable machine codes');
  }
  if (!SUPPORTED_RESOURCE_TYPES.has(resourceType)) {
    fail(
      'FILE_RESOURCE_TYPE_UNSUPPORTED',
      'resourceType is not supported by the current canonical resource-binding foundation'
    );
  }
  return {
    fileId: uuid(input.fileId, 'fileId'),
    resourceType,
    resourceId: uuid(input.resourceId, 'resourceId'),
    relationCode,
    metadata: metadata(input.metadata)
  };
}

export function validateFileResourceId(value, name = 'resourceId') {
  return uuid(value, name);
}
