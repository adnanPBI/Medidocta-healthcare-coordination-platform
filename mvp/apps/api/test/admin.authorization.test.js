import test from 'node:test';
import assert from 'node:assert/strict';
import {
  requireAdminOversight,
  requireAuditRead
} from '../src/modules/admin/admin.authorization.js';

test('admin oversight is explicit', () => {
  assert.doesNotThrow(() => requireAdminOversight({
    permissions: ['admin.oversight']
  }));
  assert.throws(
    () => requireAdminOversight({ permissions: ['audit.read'] }),
    error => error.code === 'FORBIDDEN'
  );
});

test('audit read requires both oversight and audit.read', () => {
  assert.doesNotThrow(() => requireAuditRead({
    permissions: ['admin.oversight','audit.read']
  }));
  assert.throws(
    () => requireAuditRead({ permissions: ['admin.oversight'] }),
    error => error.code === 'FORBIDDEN'
  );
});
