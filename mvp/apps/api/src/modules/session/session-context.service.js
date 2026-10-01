const accountQuery = `
  select a.id, a.external_subject, a.email, a.preferred_locale, a.status,
         pp.id as patient_profile_id, dp.id as doctor_profile_id
  from accounts a
  left join patient_profiles pp on pp.account_id = a.id
  left join doctor_profiles dp on dp.account_id = a.id
  where a.external_subject = $1
`;

export async function loadSessionContext(pool, subject) {
  const client = await pool.connect();
  try {
    const accountResult = await client.query(accountQuery, [subject]);
    const row = accountResult.rows[0];
    if (!row) return null;

    const [roleResult, facilityResult, affiliationResult, registeredFacilityResult] = await Promise.all([
      client.query(`
        select ar.role_code, coalesce(array_agg(distinct rp.permission_code)
          filter (where rp.permission_code is not null), '{}') as permissions
        from account_roles ar
        left join role_permissions rp on rp.role_code = ar.role_code
        where ar.account_id = $1 and ar.status = 'ACTIVE'
        group by ar.role_code
        order by ar.role_code
      `, [row.id]),
      client.query(`
        select fsm.id, fsm.facility_id, fsm.bundle_id, fsm.status, fsm.version,
               fpb.code as bundle_code, fpb.name as bundle_name,
               fpb.status as bundle_status, fpb.version as bundle_version,
               coalesce(array_agg(distinct fbp.permission_code)
                 filter (where fbp.permission_code is not null and fpb.status = 'ACTIVE'), '{}') as permissions
        from facility_staff_memberships fsm
        left join facility_permission_bundles fpb
          on fpb.id = fsm.bundle_id and fpb.facility_id = fsm.facility_id
        left join facility_bundle_permissions fbp on fbp.bundle_id = fpb.id
        where fsm.account_id = $1 and fsm.status = 'ACTIVE'
        group by fsm.id, fsm.facility_id, fsm.bundle_id, fsm.status, fsm.version,
                 fpb.code, fpb.name, fpb.status, fpb.version
        order by fsm.facility_id
      `, [row.id]),
      row.doctor_profile_id ? client.query(`
        select id, facility_id, status, version
        from doctor_facility_affiliations
        where doctor_id = $1 and status <> 'ARCHIVED'
        order by facility_id
      `, [row.doctor_profile_id]) : Promise.resolve({ rows: [] }),
      client.query(`
        select id, display_name, verification_status, profile_version
        from healthcare_facilities
        where registration_account_id = $1
        order by created_at, id
      `, [row.id])
    ]);

    const roles = roleResult.rows.map(r => ({ role: r.role_code, permissions: r.permissions }));
    const facilityMemberships = facilityResult.rows.map(r => ({
      membershipId: r.id,
      facilityId: r.facility_id,
      bundleId: r.bundle_id,
      bundleCode: r.bundle_code,
      bundleName: r.bundle_name,
      bundleStatus: r.bundle_status,
      bundleVersion: r.bundle_version,
      status: r.status,
      version: r.version,
      permissions: r.permissions
    }));
    const permissions = [...new Set([
      ...roles.flatMap(r => r.permissions),
      ...facilityMemberships.flatMap(m => m.permissions)
    ])].sort();

    return {
      account: {
        id: row.id,
        email: row.email,
        preferredLocale: row.preferred_locale,
        status: row.status
      },
      roles,
      permissions,
      patientProfileId: row.patient_profile_id,
      doctorProfileId: row.doctor_profile_id,
      registeredFacilities: registeredFacilityResult.rows.map(r => ({
        facilityId: r.id,
        displayName: r.display_name,
        verificationStatus: r.verification_status,
        version: r.profile_version
      })),
      facilityMemberships,
      doctorAffiliations: affiliationResult.rows.map(r => ({
        affiliationId: r.id,
        facilityId: r.facility_id,
        status: r.status,
        version: r.version
      }))
    };
  } finally {
    client.release();
  }
}
