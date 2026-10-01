import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { buildAuthenticator } from './modules/auth/authenticate.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { registerSessionRoutes } from './modules/session/session.routes.js';

export async function buildApp({ config, pool }) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } });
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });

  const authenticate = buildAuthenticator(config);
  async function requireIdentity(request) {
    request.identity = await authenticate(request);
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
  await registerSessionRoutes(app, { pool, requireIdentity });
  return app;
}
