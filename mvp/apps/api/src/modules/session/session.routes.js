import { bootstrapAccount } from './account-bootstrap.service.js';
import { loadSessionContext } from './session-context.service.js';

export async function registerSessionRoutes(app, deps) {
  app.get('/v1/session/context', { preHandler: deps.requireIdentity }, async request => {
    const context = await loadSessionContext(deps.pool, request.identity.subject);
    if (!context) {
      return { authenticated: true, registered: false, account: null, roles: [], permissions: [] };
    }
    return { authenticated: true, registered: true, ...context };
  });

  app.post('/v1/accounts/bootstrap', { preHandler: deps.requireIdentity }, async (request, reply) => {
    const result = await bootstrapAccount(deps.pool, request.identity, request.body ?? {});
    const context = await loadSessionContext(deps.pool, request.identity.subject);
    reply.code(result.created ? 201 : 200);
    return { created: result.created, context };
  });
}
