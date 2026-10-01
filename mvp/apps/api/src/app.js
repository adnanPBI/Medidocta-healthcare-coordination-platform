import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { buildAuthenticator } from './modules/auth/authenticate.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerSessionRoutes } from './modules/session/session.routes.js';
import { loadSessionContext } from './modules/session/session-context.service.js';
import { registerTaxonomyRoutes } from './modules/taxonomy/taxonomy.routes.js';
import { registerProfileRoutes } from './modules/profiles/profile.routes.js';
import { registerFacilityRbacRoutes } from './modules/facility-rbac/facility-rbac.routes.js';

export async function buildApp({ config, pool }) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } });
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });

  const authenticate = buildAuthenticator(config);

  async function requireIdentity(request) {
    request.identity = await authenticate(request);
  }

  async function requireRegisteredContext(request) {
    request.identity = await authenticate(request);
    request.context = await loadSessionContext(pool, request.identity.subject);
    if (!request.context) {
      const error = new Error('Registered Medidocta account required');
      error.statusCode = 403;
      error.code = 'ACCOUNT_NOT_REGISTERED';
      throw error;
    }
    if (request.context.account.status !== 'ACTIVE') {
      const error = new Error('Medidocta account is not active');
      error.statusCode = 403;
      error.code = 'ACCOUNT_INACTIVE';
      throw error;
    }
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, code: error.code }, 'request failed');
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.code(statusCode).send({
      error: error.code ?? (statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      requestId: request.id
    });
  });

  await registerHealthRoutes(app, { pool });
  await registerTaxonomyRoutes(app, { pool });
  await registerSessionRoutes(app, { pool, requireIdentity });
  await registerProfileRoutes(app, { pool, requireRegisteredContext });
  await registerFacilityRbacRoutes(app, { pool, requireRegisteredContext });
  return app;
}
