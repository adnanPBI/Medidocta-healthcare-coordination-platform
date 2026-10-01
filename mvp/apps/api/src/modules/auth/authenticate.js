import { createRemoteJWKSet, jwtVerify } from 'jose';

function parseBearer(header) {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function buildAuthenticator(config) {
  if (config.authMode === 'dev') {
    return async function devAuthenticator(request) {
      const subject = request.headers['x-dev-sub'];
      if (!subject) {
        const error = new Error('Missing x-dev-sub in AUTH_MODE=dev');
        error.statusCode = 401;
        error.code = 'UNAUTHENTICATED';
        throw error;
      }
      return {
        subject: String(subject),
        email: request.headers['x-dev-email'] ? String(request.headers['x-dev-email']) : null,
        claims: { dev: true }
      };
    };
  }

  const jwks = createRemoteJWKSet(new URL(config.oidc.jwksUrl));
  return async function oidcAuthenticator(request) {
    const token = parseBearer(request.headers.authorization);
    if (!token) {
      const error = new Error('Bearer token required');
      error.statusCode = 401;
      error.code = 'UNAUTHENTICATED';
      throw error;
    }
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.oidc.issuer,
        audience: config.oidc.audience
      });
      return {
        subject: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        claims: payload
      };
    } catch {
      const error = new Error('Invalid or expired access token');
      error.statusCode = 401;
      error.code = 'UNAUTHENTICATED';
      throw error;
    }
  };
}
