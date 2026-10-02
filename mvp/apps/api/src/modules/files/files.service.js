import {
  validateFileAttachment,
  validateFileRegistration
} from './files.validation.js';

function notFound(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 404;
  return error;
}

function mapFile(row) {
  return {
    id: row.id,
    createdByAccountId: row.created_by_account_id,
    storageBackendCode: row.storage_backend_code,
    storageObjectKey: row.storage_object_key,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function mapAttachment(row) {
  return {
    id: row.id,
    fileId: row.file_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    relationCode: row.relation_code,
    attachedByAccountId: row.attached_by_account_id,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

/*
 * Metadata-only foundation. The caller must already have completed the approved
 * private-object-storage upload/integrity checks before registering the object.
 * No storage provider, malware policy, signed-URL policy, or retention policy
 * is selected here.
 */
export async function registerFileObjectForAuthorizedActor(pool, {
  actorAccountId,
  ...rawInput
}) {
  const input = validateFileRegistration(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const inserted = await client.query(`
      insert into file_objects(
        created_by_account_id,
        storage_backend_code,
        storage_object_key,
        original_filename,
        content_type,
        byte_size,
        sha256,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      returning *
    `, [
      actorAccountId,
      input.storageBackendCode,
      input.storageObjectKey,
      input.originalFilename,
      input.contentType,
      input.byteSize,
      input.sha256,
      JSON.stringify(input.metadata)
    ]);

    await client.query(`
      insert into audit_events(
        actor_account_id, action_code, resource_type, resource_id, metadata
      )
      values (
        $1, 'FILE_OBJECT_REGISTERED', 'FILE_OBJECT', $2,
        jsonb_build_object(
          'storage_backend_code', $3::text,
          'content_type', $4::text,
          'byte_size', $5::bigint,
          'sha256', $6::text
        )
      )
    `, [
      actorAccountId,
      inserted.rows[0].id,
      input.storageBackendCode,
      input.contentType,
      input.byteSize,
      input.sha256
    ]);

    await client.query('commit');
    return mapFile(inserted.rows[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function attachFileObjectForAuthorizedActor(pool, {
  actorAccountId,
  ...rawInput
}) {
  const input = validateFileAttachment(rawInput);
  const client = await pool.connect();

  try {
    await client.query('begin');
    const file = await client.query(
      'select id from file_objects where id = $1',
      [input.fileId]
    );
    if (!file.rowCount) throw notFound('FILE_OBJECT_NOT_FOUND', 'File object not found');

    const inserted = await client.query(`
      insert into file_attachment_links(
        file_id,
        resource_type,
        resource_id,
        relation_code,
        attached_by_account_id,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
      on conflict (file_id, resource_type, resource_id, relation_code) do nothing
      returning *
    `, [
      input.fileId,
      input.resourceType,
      input.resourceId,
      input.relationCode,
      actorAccountId,
      JSON.stringify(input.metadata)
    ]);

    let row = inserted.rows[0];
    let idempotentReplay = false;
    if (!row) {
      const existing = await client.query(`
        select *,
               metadata = $5::jsonb as metadata_matches
        from file_attachment_links
        where file_id = $1
          and resource_type = $2
          and resource_id = $3
          and relation_code = $4
      `, [
        input.fileId,
        input.resourceType,
        input.resourceId,
        input.relationCode,
        JSON.stringify(input.metadata)
      ]);
      row = existing.rows[0];
      if (!row?.metadata_matches) {
        const error = new Error('File attachment link already exists with different metadata');
        error.code = 'FILE_ATTACHMENT_IDEMPOTENCY_CONFLICT';
        error.statusCode = 409;
        throw error;
      }
      idempotentReplay = true;
    }

    if (!idempotentReplay) {
      await client.query(`
        insert into audit_events(
          actor_account_id, action_code, resource_type, resource_id, metadata
        )
        values (
          $1, 'FILE_OBJECT_ATTACHED', $2, $3,
          jsonb_build_object(
            'file_id', $4::text,
            'relation_code', $5::text,
            'attachment_link_id', $6::text
          )
        )
      `, [
        actorAccountId,
        input.resourceType,
        input.resourceId,
        input.fileId,
        input.relationCode,
        row.id
      ]);
    }

    await client.query('commit');
    return { attachment: mapAttachment(row), idempotentReplay };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function getFileObject(pool, fileId) {
  const file = await pool.query(
    'select * from file_objects where id = $1',
    [fileId]
  );
  if (!file.rows[0]) throw notFound('FILE_OBJECT_NOT_FOUND', 'File object not found');

  const attachments = await pool.query(`
    select *
    from file_attachment_links
    where file_id = $1
    order by created_at, id
  `, [fileId]);

  return {
    file: mapFile(file.rows[0]),
    attachments: attachments.rows.map(mapAttachment),
    bytesAccessibleThroughApi: false,
    signedAccessImplemented: false
  };
}

export async function listFileObjects(pool, { limit = 100, offset = 0 } = {}) {
  const result = await pool.query(`
    select *
    from file_objects
    order by created_at desc, id desc
    limit $1 offset $2
  `, [limit, offset]);
  return result.rows.map(mapFile);
}
