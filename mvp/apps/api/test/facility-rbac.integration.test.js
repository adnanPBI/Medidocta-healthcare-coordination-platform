import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? test : test.skip;

async function bootstrap(app, subject, role) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/accounts/bootstrap',
    headers: {
      'x-dev-sub': subject,
      'x-dev-email': `${subject}@example.test`
    },
    payload: { role, preferredLocale: 'fr' }
  });
  assert.equal(response.statusCode, 201);
  return response.json().context;
}

integration('Facility RBAC is bundle-based, resource-scoped and privilege-safe', async () => {
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
  const facilityASub = `facility-a-${suffix}`;
  const facilityBSub = `facility-b-${suffix}`;
  const staffSub = `staff-${suffix}`;

  try {
    const facilityAContext = await bootstrap(app, facilityASub, 'FACILITY');
    const facilityBContext = await bootstrap(app, facilityBSub, 'FACILITY');
    const staffContext = await bootstrap(app, staffSub, 'PATIENT');

    const facilityA = facilityAContext.registeredFacilities[0].facilityId;
    const facilityB = facilityBContext.registeredFacilities[0].facilityId;
    const staffAccountId = staffContext.account.id;

    const bundleAResult = await pool.query(`
      insert into facility_permission_bundles(facility_id, code, name)
      values ($1, 'TEST_OPERATIONS', 'Test operations')
      returning id
    `, [facilityA]);
    const bundleA = bundleAResult.rows[0].id;

    for (const permission of ['facility.staff.read', 'facility.bundle.read', 'facility.profile.update']) {
      await pool.query(
        'insert into facility_bundle_permissions(bundle_id, permission_code) values ($1, $2)',
        [bundleA, permission]
      );
    }

    const membershipResult = await pool.query(`
      insert into facility_staff_memberships(facility_id, account_id, bundle_id, status)
      values ($1, $2, $3, 'ACTIVE')
      returning id
    `, [facilityA, staffAccountId, bundleA]);
    const membershipId = membershipResult.rows[0].id;

    const registrationScope = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/rbac/me`,
      headers: { 'x-dev-sub': facilityASub }
    });
    assert.equal(registrationScope.statusCode, 200);
    assert.equal(registrationScope.json().registeredFacility, true);
    assert.deepEqual(registrationScope.json().effectiveFacilityPermissions, []);

    const registrationCannotListStaff = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/staff`,
      headers: { 'x-dev-sub': facilityASub }
    });
    assert.equal(registrationCannotListStaff.statusCode, 403);

    const staffScope = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/rbac/me`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(staffScope.statusCode, 200);
    assert.equal(staffScope.json().membership.membershipId, membershipId);
    assert.deepEqual(
      staffScope.json().effectiveFacilityPermissions.sort(),
      ['facility.bundle.read', 'facility.profile.update', 'facility.staff.read']
    );

    const staffList = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/staff`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(staffList.statusCode, 200);
    assert.equal(staffList.json().items.length, 1);
    assert.equal(staffList.json().items[0].accountId, staffAccountId);

    const bundleList = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/permission-bundles`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(bundleList.statusCode, 200);
    assert.equal(bundleList.json().items[0].id, bundleA);

    const crossFacility = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityB}/staff`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(crossFacility.statusCode, 403);

    const permissionCatalog = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/rbac/delegatable-permissions`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(permissionCatalog.statusCode, 200);
    const codes = permissionCatalog.json().items.map(item => item.code);
    assert.ok(codes.includes('facility.staff.read'));
    assert.equal(codes.includes('admin.oversight'), false);
    assert.equal(codes.includes('verification.manage'), false);

    await assert.rejects(
      pool.query(
        'insert into facility_bundle_permissions(bundle_id, permission_code) values ($1, $2)',
        [bundleA, 'admin.oversight']
      ),
      error => error.code === '23514'
    );

    const bundleBResult = await pool.query(`
      insert into facility_permission_bundles(facility_id, code, name)
      values ($1, 'OTHER_FACILITY', 'Other Facility bundle')
      returning id
    `, [facilityB]);
    const bundleB = bundleBResult.rows[0].id;

    await assert.rejects(
      pool.query(
        'update facility_staff_memberships set bundle_id = $1 where id = $2',
        [bundleB, membershipId]
      ),
      error => error.code === '23503'
    );

    await pool.query(
      `update facility_permission_bundles
       set status = 'ARCHIVED', version = version + 1, updated_at = now()
       where id = $1`,
      [bundleA]
    );

    const archivedScope = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/rbac/me`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(archivedScope.statusCode, 200);
    assert.deepEqual(archivedScope.json().effectiveFacilityPermissions, []);

    const archivedBundleCannotAuthorize = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/staff`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(archivedBundleCannotAuthorize.statusCode, 403);

    await pool.query(
      `update facility_permission_bundles
       set status = 'ACTIVE', version = version + 1, updated_at = now()
       where id = $1`,
      [bundleA]
    );
    await pool.query('update accounts set status = $1 where id = $2', ['SUSPENDED', staffAccountId]);

    const inactiveAccount = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityA}/rbac/me`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(inactiveAccount.statusCode, 403);
    assert.equal(inactiveAccount.json().error, 'ACCOUNT_INACTIVE');
  } finally {
    await app.close();
    await pool.end();
  }
});
