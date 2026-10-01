import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('dev auth is rejected in production', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev', DATABASE_URL: 'postgres://x' }), /forbidden/);
});

test('oidc mode requires issuer audience and jwks', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgres://x', AUTH_MODE: 'oidc' }), /AUTH_ISSUER/);
});

test('dev config accepts explicit database and origins', () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://x', AUTH_MODE: 'dev', CORS_ORIGINS: 'http://a.test,http://b.test' });
  assert.deepEqual(config.corsOrigins, ['http://a.test', 'http://b.test']);
});
