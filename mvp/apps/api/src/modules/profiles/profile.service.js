import { normalizeLocale } from '../taxonomy/taxonomy.validation.js';
import { validateDoctorProfilePatch, validateFacilityProfilePatch } from './profile.validation.js';

function conflict(code, message) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = code;
  return error;
}

function notFound(code, message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = code;
  return error;
}

async function assertActiveCodes(client, table, codes, errorCode) {
  if (!codes?.length) return;
  const result = await client.query(
    `select code from ${table} where status = 'ACTIVE' and code = any($1::text[])`,
    [codes]
  );
  const found = new Set(result.rows.map(r => r.code));
  const missing = codes.filter(code => !found.has(code));
  if (missing.length) {
    const error = new Error(`Unknown or inactive taxonomy values: ${missing.join(', ')}`);
    error.statusCode = 422;
    error.code = errorCode;
    throw error;
  }
}

export async function getDoctorProfile(pool, doctorId, localeValue = 'fr') {
  const locale = normalizeLocale(localeValue);
  const result = await pool.query(`
    select dp.id, dp.display_name, dp.public_bio, dp.verification_status,
           dp.profile_version, dp.created_at, dp.updated_at,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'code', ds.specialty_code,
               'label', coalesce(lbl.label, fallback.label, ds.specialty_code),
               'isPrimary', ds.is_primary
             ) order by ds.is_primary desc, coalesce(lbl.label, fallback.label, ds.specialty_code))
             from doctor_specialties ds
             left join taxonomy_specialty_labels lbl
               on lbl.specialty_code = ds.specialty_code and lbl.locale = $2
             left join taxonomy_specialty_labels fallback
               on fallback.specialty_code = ds.specialty_code and fallback.locale = 'fr'
             where ds.doctor_id = dp.id
           ), '[]'::jsonb) as specialties,
           coalesce((
             select jsonb_agg(jsonb_build_object(
               'code', dl.language_code,
               'label', coalesce(lbl.label, fallback.label, dl.language_code)
             ) order by coalesce(lbl.label, fallback.label, dl.language_code))
             from doctor_languages dl
             left join taxonomy_language_labels lbl
               on lbl.language_code = dl.language_code and lbl.locale = $2
             left join taxonomy_language_labels fallback
               on fallback.language_code = dl.language_code and fallback.locale = 'fr'
             where dl.doctor_id = dp.id
           ), '[]'::jsonb) as languages
    from doctor_profiles dp
    where dp.id = $1
  `, [doctorId, locale]);

  const row = result.rows[0];
  if (!row) throw notFound('DOCTOR_PROFILE_NOT_FOUND', 'Doctor profile not found');
  return {
    id: row.id,
    displayName: row.display_name,
    publicBio: row.public_bio,
    verificationStatus: row.verification_status,
    version: row.profile_version,
    specialties: row.specialties,
    languages: row.languages,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function updateDoctorProfile(pool, accountId, doctorId, rawInput, localeValue = 'fr') {
  const input = validateDoctorProfilePatch(rawInput);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const currentResult = await client.query(`
      select id, profile_version
      from doctor_profiles
      where id = $1 and account_id = $2
      for update
    `, [doctorId, accountId]);
    const current = currentResult.rows[0];
    if (!current) throw notFound('DOCTOR_PROFILE_NOT_FOUND', 'Doctor profile not found');
    if (current.profile_version !== input.version) {
      throw conflict('PROFILE_VERSION_CONFLICT', 'Doctor profile has changed; reload before saving');
    }

    if (input.specialtyCodes) {
      await assertActiveCodes(client, 'taxonomy_specialties', input.specialtyCodes, 'INVALID_SPECIALTY');
    }
    if (input.languageCodes) {
      await assertActiveCodes(client, 'taxonomy_languages', input.languageCodes, 'INVALID_LANGUAGE');
    }
    if (input.primarySpecialtyCode && !input.specialtyCodes) {
      const primaryExists = await client.query(
        'select 1 from doctor_specialties where doctor_id = $1 and specialty_code = $2',
        [doctorId, input.primarySpecialtyCode]
      );
      if (!primaryExists.rowCount) {
        const error = new Error('primarySpecialtyCode must already be selected or included in specialtyCodes');
        error.statusCode = 422;
        error.code = 'PRIMARY_SPECIALTY_NOT_SELECTED';
        throw error;
      }
    }

    const assignments = [];
    const params = [];
    if ('displayName' in input) {
      params.push(input.displayName); assignments.push(`display_name = $${params.length}`);
    }
    if ('publicBio' in input) {
      params.push(input.publicBio); assignments.push(`public_bio = $${params.length}`);
    }
    assignments.push('profile_version = profile_version + 1', 'updated_at = now()');
    params.push(doctorId, input.version);
    await client.query(`
      update doctor_profiles
      set ${assignments.join(', ')}
      where id = $${params.length - 1} and profile_version = $${params.length}
    `, params);

    if (input.specialtyCodes) {
      const existingPrimary = await client.query(
        'select specialty_code from doctor_specialties where doctor_id = $1 and is_primary = true',
        [doctorId]
      );
      const requestedPrimary = 'primarySpecialtyCode' in input
        ? input.primarySpecialtyCode
        : (input.specialtyCodes.includes(existingPrimary.rows[0]?.specialty_code) ? existingPrimary.rows[0].specialty_code : null);

      await client.query('delete from doctor_specialties where doctor_id = $1', [doctorId]);
      for (const code of input.specialtyCodes) {
        await client.query(
          'insert into doctor_specialties(doctor_id, specialty_code, is_primary) values ($1, $2, $3)',
          [doctorId, code, code === requestedPrimary]
        );
      }
    } else if ('primarySpecialtyCode' in input) {
      await client.query('update doctor_specialties set is_primary = false where doctor_id = $1', [doctorId]);
      if (input.primarySpecialtyCode) {
        await client.query(
          'update doctor_specialties set is_primary = true where doctor_id = $1 and specialty_code = $2',
          [doctorId, input.primarySpecialtyCode]
        );
      }
    }

    if (input.languageCodes) {
      await client.query('delete from doctor_languages where doctor_id = $1', [doctorId]);
      for (const code of input.languageCodes) {
        await client.query(
          'insert into doctor_languages(doctor_id, language_code) values ($1, $2)',
          [doctorId, code]
        );
      }
    }

    await client.query(`
      insert into audit_events(actor_account_id, action_code, resource_type, resource_id, metadata)
      values ($1, 'DOCTOR_PROFILE_UPDATED', 'DOCTOR_PROFILE', $2,
              jsonb_build_object('previous_version', $3::integer, 'new_version', $3::integer + 1))
    `, [accountId, doctorId, input.version]);
    await client.query('commit');
    return getDoctorProfile(pool, doctorId, localeValue);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function getFacilityProfile(pool, facilityId, localeValue = 'fr') {
  const locale = normalizeLocale(localeValue);
  const result = await pool.query(`
    select hf.id, hf.registration_account_id, hf.display_name, hf.public_summary,
           hf.city_code, hf.verification_status, hf.profile_version,
           hf.created_at, hf.updated_at,
           tc.country_code,
           coalesce(lbl.label, fallback.label, hf.city_code) as city_label
    from healthcare_facilities hf
    left join taxonomy_cities tc on tc.code = hf.city_code
    left join taxonomy_city_labels lbl
      on lbl.city_code = hf.city_code and lbl.locale = $2
    left join taxonomy_city_labels fallback
      on fallback.city_code = hf.city_code and fallback.locale = 'fr'
    where hf.id = $1
  `, [facilityId, locale]);
  const row = result.rows[0];
  if (!row) throw notFound('FACILITY_NOT_FOUND', 'Healthcare Facility not found');
  return {
    id: row.id,
    registrationAccountId: row.registration_account_id,
    displayName: row.display_name,
    publicSummary: row.public_summary,
    city: row.city_code ? {
      code: row.city_code,
      label: row.city_label,
      countryCode: row.country_code
    } : null,
    verificationStatus: row.verification_status,
    version: row.profile_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function updateFacilityProfile(pool, accountId, facilityId, rawInput, localeValue = 'fr') {
  const input = validateFacilityProfilePatch(rawInput);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const currentResult = await client.query(`
      select id, profile_version from healthcare_facilities
      where id = $1 for update
    `, [facilityId]);
    const current = currentResult.rows[0];
    if (!current) throw notFound('FACILITY_NOT_FOUND', 'Healthcare Facility not found');
    if (current.profile_version !== input.version) {
      throw conflict('PROFILE_VERSION_CONFLICT', 'Facility profile has changed; reload before saving');
    }

    if (input.cityCode) {
      await assertActiveCodes(client, 'taxonomy_cities', [input.cityCode], 'INVALID_CITY');
    }

    const assignments = [];
    const params = [];
    if ('displayName' in input) {
      params.push(input.displayName); assignments.push(`display_name = $${params.length}`);
    }
    if ('publicSummary' in input) {
      params.push(input.publicSummary); assignments.push(`public_summary = $${params.length}`);
    }
    if ('cityCode' in input) {
      params.push(input.cityCode); assignments.push(`city_code = $${params.length}`);
    }
    assignments.push('profile_version = profile_version + 1', 'updated_at = now()');
    params.push(facilityId, input.version);
    await client.query(`
      update healthcare_facilities
      set ${assignments.join(', ')}
      where id = $${params.length - 1} and profile_version = $${params.length}
    `, params);

    await client.query(`
      insert into audit_events(actor_account_id, action_code, resource_type, resource_id, metadata)
      values ($1, 'FACILITY_PROFILE_UPDATED', 'HEALTHCARE_FACILITY', $2,
              jsonb_build_object('previous_version', $3::integer, 'new_version', $3::integer + 1))
    `, [accountId, facilityId, input.version]);
    await client.query('commit');
    return getFacilityProfile(pool, facilityId, localeValue);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
