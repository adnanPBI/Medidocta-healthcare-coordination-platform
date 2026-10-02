import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFileAttachment,
  validateFileRegistration
} from '../src/modules/files/files.validation.js';

const fileId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const sha256 = 'a'.repeat(64);

test('file registration stores metadata only with explicit storage locator and integrity hash', () => {
  const value = validateFileRegistration({
    storageBackendCode: 'PRIVATE_OBJECT_STORE',
    storageObjectKey: 'verification/abc/object-1',
    originalFilename: 'evidence.pdf',
    contentType: 'application/pdf',
    byteSize: 1024,
    sha256,
    metadata: { source: 'test' }
  });
  assert.equal(value.storageBackendCode, 'PRIVATE_OBJECT_STORE');
  assert.equal(value.byteSize, 1024);
  assert.equal(value.sha256, sha256);
});

test('file registration refuses invalid SHA-256 and path-control characters', () => {
  assert.throws(
    () => validateFileRegistration({
      storageBackendCode: 'PRIVATE_OBJECT_STORE',
      storageObjectKey: 'bad\nkey',
      originalFilename: 'evidence.pdf',
      contentType: 'application/pdf',
      byteSize: 1,
      sha256
    }),
    error => error.code === 'INVALID_FILE_REQUEST'
  );

  assert.throws(
    () => validateFileRegistration({
      storageBackendCode: 'PRIVATE_OBJECT_STORE',
      storageObjectKey: 'object-1',
      originalFilename: 'evidence.pdf',
      contentType: 'application/pdf',
      byteSize: 1,
      sha256: 'not-a-hash'
    }),
    error => error.code === 'INVALID_FILE_HASH'
  );
});

test('attachment link uses stable resource and relation codes', () => {
  const value = validateFileAttachment({
    fileId,
    resourceType: 'APPOINTMENT',
    resourceId,
    relationCode: 'SUPPORTING_DOCUMENT'
  });
  assert.equal(value.fileId, fileId);
  assert.equal(value.resourceType, 'APPOINTMENT');
  assert.equal(value.relationCode, 'SUPPORTING_DOCUMENT');
});


test('file links cannot target unsupported or not-yet-implemented resource types', () => {
  assert.throws(
    () => validateFileAttachment({
      fileId,
      resourceType: 'VERIFICATION_CASE',
      resourceId,
      relationCode: 'EVIDENCE'
    }),
    error => error.code === 'FILE_RESOURCE_TYPE_UNSUPPORTED'
  );
});
