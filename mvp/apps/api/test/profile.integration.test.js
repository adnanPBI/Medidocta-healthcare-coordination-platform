import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

integration('profile/taxonomy APIs preserve canonical role and permission boundaries', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const config = {
    nodeEnv: 'test',
    authMode: 'dev',
    corsOrigins: ['http://localhost:4173'],
    oidc: null
  };
  const app = await buildApp({ config, pool });
  await app.ready();

  const suffix = randomUUID();
  const doctorSub = `doctor-${suffix}`;
  const facilitySub = `facility-${suffix}`;

  try {
    const languages = await app.inject({ method: 'GET', url: '/v1/taxonomies/languages?locale=en' });
    assert.equal(languages.statusCode, 200);
    assert.deepEqual(languages.json().items.map(item => item.code), ['fr', 'en']);

    const specialties = await app.inject({ method: 'GET', url: '/v1/taxonomies/specialties?locale=fr' });
    assert.equal(specialties.statusCode, 200);
    assert.deepEqual(specialties.json().items, []);

    const doctorBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/accounts/bootstrap',
      headers: { 'x-dev-sub': doctorSub, 'x-dev-email': `${doctorSub}@example.test` },
      payload: { role: 'DOCTOR', preferredLocale: 'fr' }
    });
    assert.equal(doctorBootstrap.statusCode, 201);
    const doctorContext = doctorBootstrap.json().context;
    assert.ok(doctorContext.doctorProfileId);

    const doctorRead = await app.inject({
      method: 'GET',
      url: '/v1/doctors/me/profile?locale=en',
      headers: { 'x-dev-sub': doctorSub }
    });
    assert.equal(doctorRead.statusCode, 200);
    assert.equal(doctorRead.json().version, 1);

    const doctorUpdate = await app.inject({
      method: 'PATCH',
      url: '/v1/doctors/me/profile?locale=en',
      headers: { 'x-dev-sub': doctorSub },
      payload: {
        version: 1,
        displayName: 'Dr. Integration',
        publicBio: 'Minimal approved profile contract.',
        specialtyCodes: [],
        languageCodes: ['fr', 'en']
      }
    });
    assert.equal(doctorUpdate.statusCode, 200);
    assert.equal(doctorUpdate.json().displayName, 'Dr. Integration');
    assert.equal(doctorUpdate.json().version, 2);
    assert.deepEqual(doctorUpdate.json().languages.map(item => item.code), ['en', 'fr']);

    const staleUpdate = await app.inject({
      method: 'PATCH',
      url: '/v1/doctors/me/profile',
      headers: { 'x-dev-sub': doctorSub },
      payload: { version: 1, displayName: 'Stale write' }
    });
    assert.equal(staleUpdate.statusCode, 409);
    assert.equal(staleUpdate.json().error, 'PROFILE_VERSION_CONFLICT');

    const facilityBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/accounts/bootstrap',
      headers: { 'x-dev-sub': facilitySub, 'x-dev-email': `${facilitySub}@example.test` },
      payload: { role: 'FACILITY', preferredLocale: 'en' }
    });
    assert.equal(facilityBootstrap.statusCode, 201);
    const facilityId = facilityBootstrap.json().context.registeredFacilities[0].facilityId;
    assert.ok(facilityId);

    const facilityRead = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityId}/profile`,
      headers: { 'x-dev-sub': facilitySub }
    });
    assert.equal(facilityRead.statusCode, 200);
    assert.equal(facilityRead.json().id, facilityId);
    assert.equal('registrationAccountId' in facilityRead.json(), false);

    const facilityWrite = await app.inject({
      method: 'PATCH',
      url: `/v1/facilities/${facilityId}/profile`,
      headers: { 'x-dev-sub': facilitySub },
      payload: { version: 1, displayName: 'Must remain gated' }
    });
    assert.equal(facilityWrite.statusCode, 403);
    assert.equal(facilityWrite.json().error, 'FORBIDDEN');
  } finally {
    await app.close();
    await pool.end();
  }
});
