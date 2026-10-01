import { validateContractProposalRevision } from './contract.validation.js';

function notFound(code, message) {
  const error = new Error(message);
  error.statusCode = 404;
  error.code = code;
  return error;
}

function mapAffiliation(row) {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    facilityId: row.facility_id,
    status: row.status,
    version: row.version,
    doctor: {
      displayName: row.doctor_display_name,
      verificationStatus: row.doctor_verification_status
    },
    facility: {
      displayName: row.facility_display_name,
      verificationStatus: row.facility_verification_status
    },
    contractThread: row.contract_thread_id ? {
      id: row.contract_thread_id,
      version: row.contract_thread_version
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const affiliationSelect = `
  select dfa.id, dfa.doctor_id, dfa.facility_id, dfa.status, dfa.version,
         dfa.created_at, dfa.updated_at,
         dp.display_name as doctor_display_name,
         dp.verification_status as doctor_verification_status,
         hf.display_name as facility_display_name,
         hf.verification_status as facility_verification_status,
         act.id as contract_thread_id,
         act.version as contract_thread_version
  from doctor_facility_affiliations dfa
  join doctor_profiles dp on dp.id = dfa.doctor_id
  join healthcare_facilities hf on hf.id = dfa.facility_id
  left join affiliation_contract_threads act on act.affiliation_id = dfa.id
`;

export async function getAffiliation(pool, affiliationId) {
  const result = await pool.query(
    `${affiliationSelect} where dfa.id = $1`,
    [affiliationId]
  );
  if (!result.rows[0]) throw notFound('AFFILIATION_NOT_FOUND', 'Doctor-Facility affiliation not found');
  return mapAffiliation(result.rows[0]);
}

export async function listDoctorAffiliations(pool, doctorId) {
  const result = await pool.query(
    `${affiliationSelect}
     where dfa.doctor_id = $1 and dfa.status <> 'ARCHIVED'
     order by hf.display_name nulls last, dfa.created_at, dfa.id`,
    [doctorId]
  );
  return result.rows.map(mapAffiliation);
}

export async function listFacilityAffiliations(pool, facilityId) {
  const result = await pool.query(
    `${affiliationSelect}
     where dfa.facility_id = $1 and dfa.status <> 'ARCHIVED'
     order by dp.display_name nulls last, dfa.created_at, dfa.id`,
    [facilityId]
  );
  return result.rows.map(mapAffiliation);
}

function mapRevision(row) {
  return {
    id: row.id,
    contractThreadId: row.contract_thread_id,
    revisionNumber: row.revision_number,
    proposedByAccountId: row.proposed_by_account_id,
    proposalPayload: row.proposal_payload,
    financialTermsPayload: row.financial_terms_payload,
    proposedEffectiveFrom: row.proposed_effective_from,
    proposedEffectiveUntil: row.proposed_effective_until,
    createdAt: row.created_at
  };
}

export async function getContractThread(pool, affiliationId) {
  const result = await pool.query(`
    select act.id, act.affiliation_id, act.version, act.created_at, act.updated_at,
           latest.id as latest_revision_id,
           latest.revision_number as latest_revision_number,
           latest.proposed_by_account_id as latest_proposed_by_account_id,
           latest.proposal_payload as latest_proposal_payload,
           latest.financial_terms_payload as latest_financial_terms_payload,
           latest.proposed_effective_from as latest_proposed_effective_from,
           latest.proposed_effective_until as latest_proposed_effective_until,
           latest.created_at as latest_created_at
    from affiliation_contract_threads act
    left join lateral (
      select cpr.*
      from contract_proposal_revisions cpr
      where cpr.contract_thread_id = act.id
      order by cpr.revision_number desc
      limit 1
    ) latest on true
    where act.affiliation_id = $1
  `, [affiliationId]);

  const row = result.rows[0];
  if (!row) throw notFound('CONTRACT_THREAD_NOT_FOUND', 'Contract thread not found for affiliation');
  return {
    id: row.id,
    affiliationId: row.affiliation_id,
    version: row.version,
    latestRevision: row.latest_revision_id ? mapRevision({
      id: row.latest_revision_id,
      contract_thread_id: row.id,
      revision_number: row.latest_revision_number,
      proposed_by_account_id: row.latest_proposed_by_account_id,
      proposal_payload: row.latest_proposal_payload,
      financial_terms_payload: row.latest_financial_terms_payload,
      proposed_effective_from: row.latest_proposed_effective_from,
      proposed_effective_until: row.latest_proposed_effective_until,
      created_at: row.latest_created_at
    }) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listContractRevisions(pool, affiliationId, limit = 100) {
  const result = await pool.query(`
    select cpr.*
    from contract_proposal_revisions cpr
    join affiliation_contract_threads act on act.id = cpr.contract_thread_id
    where act.affiliation_id = $1
    order by cpr.revision_number desc
    limit $2
  `, [affiliationId, limit]);
  return result.rows.map(mapRevision);
}

/*
 * Infrastructure-only append primitive.
 * The caller MUST establish commercial authority before invoking it.
 * It is intentionally not exposed by an HTTP mutation route while DR-013,
 * DR-014, DR-015 and DR-042 remain PRODUCT DECISION REQUIRED.
 */
export async function appendContractProposalRevisionForAuthorizedActor(pool, {
  affiliationId,
  actorAccountId,
  ...rawInput
}) {
  const input = validateContractProposalRevision(rawInput);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const threadResult = await client.query(`
      select act.id, act.version
      from affiliation_contract_threads act
      where act.affiliation_id = $1
      for update
    `, [affiliationId]);
    const thread = threadResult.rows[0];
    if (!thread) throw notFound('CONTRACT_THREAD_NOT_FOUND', 'Contract thread not found for affiliation');

    const nextRevision = Number(thread.version) + 1;
    const inserted = await client.query(`
      insert into contract_proposal_revisions(
        contract_thread_id,
        revision_number,
        proposed_by_account_id,
        proposal_payload,
        financial_terms_payload,
        proposed_effective_from,
        proposed_effective_until
      )
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::date, $7::date)
      returning *
    `, [
      thread.id,
      nextRevision,
      actorAccountId,
      JSON.stringify(input.proposalPayload),
      JSON.stringify(input.financialTermsPayload),
      input.proposedEffectiveFrom,
      input.proposedEffectiveUntil
    ]);

    await client.query(`
      update affiliation_contract_threads
      set version = $2, updated_at = now()
      where id = $1
    `, [thread.id, nextRevision]);

    await client.query(`
      insert into audit_events(actor_account_id, action_code, resource_type, resource_id, metadata)
      values (
        $1,
        'CONTRACT_PROPOSAL_REVISION_APPENDED',
        'AFFILIATION_CONTRACT',
        $2,
        jsonb_build_object(
          'affiliation_id', $3::text,
          'revision_number', $4::integer
        )
      )
    `, [actorAccountId, thread.id, affiliationId, nextRevision]);

    await client.query('commit');
    return mapRevision(inserted.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
