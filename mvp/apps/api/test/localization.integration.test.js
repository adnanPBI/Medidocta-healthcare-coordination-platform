import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

integration('account locale preference, weighted negotiation and stable error keys remain one-platform concerns', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = await buildApp({
    config: {
      nodeEnv: 'test',
      authMode: 'dev',
      corsOrigins: ['http://localhost:4173'],
      oidc: null
    },
    pool
  });
  await app.ready();

  const suffix = randomUUID();
  const subject = `m09-locale-${suffix}`;

  try {
    const meta = await app.inject({
      method: 'GET',
      url: '/v1/localization/meta',
      headers: {
        'accept-language': 'en-US;q=0.8,fr-CM;q=0.9'
      }
    });
    assert.equal(meta.statusCode, 200);
    assert.equal(meta.json().locale, 'fr');
    assert.deepEqual(meta.json().supportedLocales, ['fr', 'en']);
    assert.equal(meta.json().canonicalBusinessRecordsLocalized, false);
    assert.equal(meta.json().machineErrorCodesStable, true);

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/accounts/bootstrap',
      headers: {
        'x-dev-sub': subject,
        'x-dev-email': `${subject}@example.test`,
        'accept-language': 'en'
      },
      payload: {
        role: 'PATIENT',
        preferredLocale: 'fr'
      }
    });
    assert.equal(bootstrap.statusCode, 201);
    assert.equal(bootstrap.json().localization.locale, 'fr');
    const accountId = bootstrap.json().context.account.id;

    const accountPreferredWins = await app.inject({
      method: 'GET',
      url: '/v1/session/context',
      headers: {
        'x-dev-sub': subject,
        'accept-language': 'en-US,en;q=0.8'
      }
    });
    assert.equal(accountPreferredWins.statusCode, 200);
    assert.equal(accountPreferredWins.json().account.preferredLocale, 'fr');
    assert.equal(accountPreferredWins.json().localization.locale, 'fr');
    assert.deepEqual(accountPreferredWins.json().localization.supportedLocales, ['fr', 'en']);

    const explicitWins = await app.inject({
      method: 'GET',
      url: '/v1/session/context?locale=en',
      headers: {
        'x-dev-sub': subject,
        'accept-language': 'fr'
      }
    });
    assert.equal(explicitWins.statusCode, 200);
    assert.equal(explicitWins.json().localization.locale, 'en');
    assert.equal(explicitWins.json().account.preferredLocale, 'fr');

    const preference = await app.inject({
      method: 'PATCH',
      url: '/v1/accounts/me/preferences',
      headers: {
        'x-dev-sub': subject,
        'content-type': 'application/json'
      },
      payload: { preferredLocale: 'en' }
    });
    assert.equal(preference.statusCode, 200);
    assert.equal(preference.json().preferredLocale, 'en');
    assert.equal(preference.json().changed, true);

    const persistedWins = await app.inject({
      method: 'GET',
      url: '/v1/session/context',
      headers: {
        'x-dev-sub': subject,
        'accept-language': 'fr-CM;q=1.0,en;q=0.5'
      }
    });
    assert.equal(persistedWins.statusCode, 200);
    assert.equal(persistedWins.json().account.preferredLocale, 'en');
    assert.equal(persistedWins.json().localization.locale, 'en');

    const unsupported = await app.inject({
      method: 'PATCH',
      url: '/v1/accounts/me/preferences?locale=fr',
      headers: {
        'x-dev-sub': subject,
        'content-type': 'application/json',
        'accept-language': 'en'
      },
      payload: { preferredLocale: 'es' }
    });
    assert.equal(unsupported.statusCode, 422);
    assert.equal(unsupported.json().error, 'UNSUPPORTED_LOCALE');
    assert.equal(unsupported.json().messageKey, 'errors.UNSUPPORTED_LOCALE');
    assert.equal(unsupported.json().locale, 'fr');
    assert.ok(unsupported.json().requestId);

    const taxonomy = await app.inject({
      method: 'GET',
      url: '/v1/taxonomies/languages',
      headers: {
        'accept-language': 'en-US;q=0.6,fr-CM;q=0.9'
      }
    });
    assert.equal(taxonomy.statusCode, 200);
    assert.equal(taxonomy.json().locale, 'fr');

    const audit = await pool.query(`
      select metadata
      from audit_events
      where actor_account_id = $1
        and action_code = 'ACCOUNT_LOCALE_UPDATED'
      order by created_at
    `, [accountId]);
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].metadata.previous_locale, 'fr');
    assert.equal(audit.rows[0].metadata.new_locale, 'en');
  } finally {
    await app.close();
    await pool.end();
  }
});
