import { validateAccountPreferencesPatch } from './preferences.validation.js';

export async function updateOwnAccountPreferences(pool, {
  accountId,
  input: rawInput
}) {
  const input = validateAccountPreferencesPatch(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const current = await client.query(
      'select id, preferred_locale from accounts where id = $1 for update',
      [accountId]
    );
    if (!current.rows[0]) {
      const error = new Error('Account not found');
      error.statusCode = 404;
      error.code = 'ACCOUNT_NOT_FOUND';
      throw error;
    }

    const previousLocale = current.rows[0].preferred_locale;
    await client.query(`
      update accounts
      set preferred_locale = $2,
          updated_at = now()
      where id = $1
    `, [accountId, input.preferredLocale]);

    if (previousLocale !== input.preferredLocale) {
      await client.query(`
        insert into audit_events(
          actor_account_id,
          action_code,
          resource_type,
          resource_id,
          metadata
        )
        values (
          $1,
          'ACCOUNT_LOCALE_UPDATED',
          'ACCOUNT',
          $1,
          jsonb_build_object(
            'previous_locale', $2::text,
            'new_locale', $3::text
          )
        )
      `, [accountId, previousLocale, input.preferredLocale]);
    }

    await client.query('commit');
    return {
      preferredLocale: input.preferredLocale,
      changed: previousLocale !== input.preferredLocale
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
