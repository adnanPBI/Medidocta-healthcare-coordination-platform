import { requireSupportedLocale } from '../localization/localization.js';

const ALLOWED_INITIAL_ROLES = new Set(['PATIENT', 'DOCTOR', 'FACILITY']);
export async function bootstrapAccount(pool, identity, input) {
  const role = String(input.role ?? '').toUpperCase();
  const preferredLocale = requireSupportedLocale(input.preferredLocale ?? 'fr', 'preferredLocale');
  if (!ALLOWED_INITIAL_ROLES.has(role)) {
    const error = new Error('Initial role must be PATIENT, DOCTOR, or FACILITY');
    error.statusCode = 422; error.code = 'INVALID_INITIAL_ROLE'; throw error;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query('select id from accounts where external_subject = $1 for update', [identity.subject]);
    if (existing.rows[0]) {
      await client.query('commit');
      return { accountId: existing.rows[0].id, created: false };
    }

    const account = await client.query(`
      insert into accounts (external_subject, email, preferred_locale, status)
      values ($1, $2, $3, 'ACTIVE') returning id
    `, [identity.subject, identity.email, preferredLocale]);
    const accountId = account.rows[0].id;
    await client.query(`insert into account_roles(account_id, role_code, status) values ($1, $2, 'ACTIVE')`, [accountId, role]);

    if (role === 'PATIENT') {
      await client.query(`insert into patient_profiles(account_id) values ($1)`, [accountId]);
    } else if (role === 'DOCTOR') {
      await client.query(`insert into doctor_profiles(account_id, verification_status) values ($1, 'UNVERIFIED')`, [accountId]);
    } else {
      await client.query(`insert into healthcare_facilities(registration_account_id, verification_status) values ($1, 'UNVERIFIED')`, [accountId]);
    }

    await client.query(`
      insert into audit_events(actor_account_id, action_code, resource_type, resource_id, metadata)
      values ($1, 'ACCOUNT_BOOTSTRAPPED', 'ACCOUNT', $1, jsonb_build_object('initial_role', $2::text))
    `, [accountId, role]);
    await client.query('commit');
    return { accountId, created: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
