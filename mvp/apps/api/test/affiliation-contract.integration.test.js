import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { appendContractProposalRevisionForAuthorizedActor } from '../src/modules/affiliations/affiliation.service.js';

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

integration('Doctor-Facility affiliation and contract foundation is canonical, scoped and append-only', async () => {
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
  const doctorASub = `doctor-a-${suffix}`;
  const doctorBSub = `doctor-b-${suffix}`;
  const facilityASub = `facility-a-${suffix}`;
  const facilityBSub = `facility-b-${suffix}`;
  const staffSub = `contract-staff-${suffix}`;

  try {
    const doctorA = await bootstrap(app, doctorASub, 'DOCTOR');
    const doctorB = await bootstrap(app, doctorBSub, 'DOCTOR');
    const facilityA = await bootstrap(app, facilityASub, 'FACILITY');
    const facilityB = await bootstrap(app, facilityBSub, 'FACILITY');
    const staff = await bootstrap(app, staffSub, 'PATIENT');

    const facilityAId = facilityA.registeredFacilities[0].facilityId;
    const facilityBId = facilityB.registeredFacilities[0].facilityId;

    await pool.query(
      'update doctor_profiles set display_name = $1 where id = $2',
      ['Doctor A', doctorA.doctorProfileId]
    );
    await pool.query(
      'update healthcare_facilities set display_name = $1 where id = $2',
      ['Facility A', facilityAId]
    );
    await pool.query(
      'update healthcare_facilities set display_name = $1 where id = $2',
      ['Facility B', facilityBId]
    );

    const bundleResult = await pool.query(`
      insert into facility_permission_bundles(facility_id, code, name)
      values ($1, 'TEST_CONTRACT_READ', 'Test contract read')
      returning id
    `, [facilityAId]);
    const bundleId = bundleResult.rows[0].id;

    for (const permission of ['affiliation.read', 'contract.read']) {
      await pool.query(
        'insert into facility_bundle_permissions(bundle_id, permission_code) values ($1, $2)',
        [bundleId, permission]
      );
    }
    await pool.query(`
      insert into facility_staff_memberships(facility_id, account_id, bundle_id, status)
      values ($1, $2, $3, 'ACTIVE')
    `, [facilityAId, staff.account.id, bundleId]);

    const affiliationAResult = await pool.query(`
      insert into doctor_facility_affiliations(doctor_id, facility_id, status)
      values ($1, $2, 'PENDING')
      returning id
    `, [doctorA.doctorProfileId, facilityAId]);
    const affiliationAId = affiliationAResult.rows[0].id;

    const affiliationBResult = await pool.query(`
      insert into doctor_facility_affiliations(doctor_id, facility_id, status)
      values ($1, $2, 'PENDING')
      returning id
    `, [doctorA.doctorProfileId, facilityBId]);
    const affiliationBId = affiliationBResult.rows[0].id;

    const threadCheck = await pool.query(
      'select affiliation_id, version from affiliation_contract_threads where affiliation_id = any($1::uuid[]) order by affiliation_id',
      [[affiliationAId, affiliationBId]]
    );
    assert.equal(threadCheck.rowCount, 2);
    assert.ok(threadCheck.rows.every(row => row.version === 0));

    const first = await appendContractProposalRevisionForAuthorizedActor(pool, {
      affiliationId: affiliationAId,
      actorAccountId: doctorA.account.id,
      proposalPayload: { note: 'Initial proposal' },
      financialTermsPayload: {
        currency: 'XAF',
        structure: { consultation: 'intentionally-uninterpreted' }
      },
      proposedEffectiveFrom: '2026-11-01'
    });
    assert.equal(first.revisionNumber, 1);

    const second = await appendContractProposalRevisionForAuthorizedActor(pool, {
      affiliationId: affiliationAId,
      actorAccountId: staff.account.id,
      proposalPayload: { note: 'Counter draft stored structurally only' },
      financialTermsPayload: {
        arbitraryNegotiatedShape: { value: 42, unit: 'not-product-defined' }
      },
      proposedEffectiveFrom: '2026-11-15',
      proposedEffectiveUntil: '2027-01-31'
    });
    assert.equal(second.revisionNumber, 2);

    const doctorList = await app.inject({
      method: 'GET',
      url: '/v1/doctors/me/affiliations',
      headers: { 'x-dev-sub': doctorASub }
    });
    assert.equal(doctorList.statusCode, 200);
    assert.deepEqual(
      new Set(doctorList.json().items.map(item => item.facilityId)),
      new Set([facilityAId, facilityBId])
    );

    const facilityStaffList = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityAId}/affiliations`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(facilityStaffList.statusCode, 200);
    assert.equal(facilityStaffList.json().items.length, 1);
    assert.equal(facilityStaffList.json().items[0].id, affiliationAId);

    const registrationAloneDenied = await app.inject({
      method: 'GET',
      url: `/v1/facilities/${facilityAId}/affiliations`,
      headers: { 'x-dev-sub': facilityASub }
    });
    assert.equal(registrationAloneDenied.statusCode, 403);

    const doctorContract = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationAId}/contract`,
      headers: { 'x-dev-sub': doctorASub }
    });
    assert.equal(doctorContract.statusCode, 200);
    assert.equal(doctorContract.json().contract.version, 2);
    assert.equal(doctorContract.json().contract.latestRevision.revisionNumber, 2);

    const staffContract = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationAId}/contract/revisions?limit=10`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(staffContract.statusCode, 200);
    assert.deepEqual(
      staffContract.json().items.map(item => item.revisionNumber),
      [2, 1]
    );
    assert.equal(
      staffContract.json().items[0].financialTermsPayload.arbitraryNegotiatedShape.value,
      42
    );

    const crossFacilityContract = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationBId}/contract`,
      headers: { 'x-dev-sub': staffSub }
    });
    assert.equal(crossFacilityContract.statusCode, 403);

    const unrelatedDoctor = await app.inject({
      method: 'GET',
      url: `/v1/affiliations/${affiliationAId}`,
      headers: { 'x-dev-sub': doctorBSub }
    });
    assert.equal(unrelatedDoctor.statusCode, 403);

    const firstRevisionId = first.id;
    await assert.rejects(
      pool.query(
        'update contract_proposal_revisions set proposal_payload = $1::jsonb where id = $2',
        [JSON.stringify({ changed: true }), firstRevisionId]
      ),
      error => error.code === '23514'
    );

    await assert.rejects(
      pool.query('delete from contract_proposal_revisions where id = $1', [firstRevisionId]),
      error => error.code === '23514'
    );

    const mutationRouteNotExposed = await app.inject({
      method: 'POST',
      url: `/v1/affiliations/${affiliationAId}/contract/revisions`,
      headers: {
        'x-dev-sub': doctorASub,
        'content-type': 'application/json'
      },
      payload: { proposalPayload: { mustNotBeAccepted: true } }
    });
    assert.equal(mutationRouteNotExposed.statusCode, 404);

    const audit = await pool.query(`
      select action_code, metadata
      from audit_events
      where resource_type = 'AFFILIATION_CONTRACT'
        and metadata->>'affiliation_id' = $1
      order by created_at
    `, [affiliationAId]);
    assert.equal(audit.rowCount, 2);
    assert.ok(audit.rows.every(row => row.action_code === 'CONTRACT_PROPOSAL_REVISION_APPENDED'));
  } finally {
    await app.close();
    await pool.end();
  }
});
