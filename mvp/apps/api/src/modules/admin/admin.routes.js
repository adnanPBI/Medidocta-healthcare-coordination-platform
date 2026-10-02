import {
  requireAdminOversight,
  requireAuditRead
} from './admin.authorization.js';
import {
  getAdminFile,
  listAdminFiles,
  listAdminNotificationIntents,
  listAuditEvents,
  listOutboxEvents,
  retryFailedOutboxEvent
} from './admin.service.js';
import {
  validateAdminPaging,
  validateAdminResourceId,
  validateAuditFilters,
  validateNotificationFilters,
  validateOutboxFilters
} from './admin.validation.js';

export async function registerAdminRoutes(app, deps) {
  app.get('/v1/admin/audit-events', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requireAuditRead(request.context);
    return {
      items: await listAuditEvents(
        deps.pool,
        validateAuditFilters(request.query ?? {})
      )
    };
  });

  app.get('/v1/admin/outbox-events', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requireAdminOversight(request.context);
    return {
      items: await listOutboxEvents(
        deps.pool,
        validateOutboxFilters(request.query ?? {})
      )
    };
  });

  app.post('/v1/admin/outbox-events/:eventId/retry', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requireAdminOversight(request.context);
    return retryFailedOutboxEvent(deps.pool, {
      eventId: validateAdminResourceId(request.params.eventId, 'eventId'),
      actorAccountId: request.context.account.id
    });
  });

  app.get('/v1/admin/notification-intents', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requireAdminOversight(request.context);
    return {
      items: await listAdminNotificationIntents(
        deps.pool,
        validateNotificationFilters(request.query ?? {})
      ),
      policy: {
        automaticRoutingEnabled: false,
        channelConsentPolicyResolved: false,
        templatePolicyResolved: false
      }
    };
  });

  app.get('/v1/admin/files', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requireAdminOversight(request.context);
    return {
      items: await listAdminFiles(
        deps.pool,
        validateAdminPaging(request.query ?? {})
      ),
      bytesAccessibleThroughApi: false
    };
  });

  app.get('/v1/admin/files/:fileId', {
    preHandler: deps.requireRegisteredContext
  }, async request => {
    requireAdminOversight(request.context);
    return getAdminFile(
      deps.pool,
      validateAdminResourceId(request.params.fileId, 'fileId')
    );
  });
}
