function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = 'FACILITY_NOT_FOUND';
  return error;
}

export async function assertFacilityExists(pool, facilityId) {
  const result = await pool.query('select 1 from healthcare_facilities where id = $1', [facilityId]);
  if (!result.rowCount) throw notFound('Healthcare Facility not found');
}

export async function listDelegatablePermissions(pool) {
  const result = await pool.query(`
    select code, description
    from permission_definitions
    where delegation_scope = 'FACILITY_BUNDLE'
    order by code
  `);
  return result.rows.map(row => ({
    code: row.code,
    description: row.description
  }));
}

export async function listFacilityBundles(pool, facilityId) {
  await assertFacilityExists(pool, facilityId);
  const result = await pool.query(`
    select fpb.id, fpb.code, fpb.name, fpb.status, fpb.version,
           fpb.created_at, fpb.updated_at,
           coalesce(
             array_agg(fbp.permission_code order by fbp.permission_code)
               filter (where fbp.permission_code is not null),
             '{}'
           ) as permissions
    from facility_permission_bundles fpb
    left join facility_bundle_permissions fbp on fbp.bundle_id = fpb.id
    where fpb.facility_id = $1
    group by fpb.id, fpb.code, fpb.name, fpb.status, fpb.version, fpb.created_at, fpb.updated_at
    order by fpb.status, fpb.code, fpb.id
  `, [facilityId]);

  return result.rows.map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    version: row.version,
    permissions: row.permissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function listFacilityStaff(pool, facilityId) {
  await assertFacilityExists(pool, facilityId);
  const result = await pool.query(`
    select fsm.id, fsm.account_id, a.email, fsm.status, fsm.version,
           fsm.created_at, fsm.updated_at,
           fpb.id as bundle_id, fpb.code as bundle_code, fpb.name as bundle_name,
           fpb.status as bundle_status,
           coalesce(
             array_agg(fbp.permission_code order by fbp.permission_code)
               filter (where fbp.permission_code is not null and fpb.status = 'ACTIVE'),
             '{}'
           ) as permissions
    from facility_staff_memberships fsm
    join accounts a on a.id = fsm.account_id
    left join facility_permission_bundles fpb
      on fpb.id = fsm.bundle_id and fpb.facility_id = fsm.facility_id
    left join facility_bundle_permissions fbp on fbp.bundle_id = fpb.id
    where fsm.facility_id = $1
    group by fsm.id, fsm.account_id, a.email, fsm.status, fsm.version,
             fsm.created_at, fsm.updated_at, fpb.id, fpb.code, fpb.name, fpb.status
    order by fsm.status, a.email nulls last, fsm.id
  `, [facilityId]);

  return result.rows.map(row => ({
    membershipId: row.id,
    accountId: row.account_id,
    email: row.email,
    status: row.status,
    version: row.version,
    bundle: row.bundle_id ? {
      id: row.bundle_id,
      code: row.bundle_code,
      name: row.bundle_name,
      status: row.bundle_status
    } : null,
    permissions: row.permissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}
