function required(name, value) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const authMode = env.AUTH_MODE ?? 'oidc';
  if (nodeEnv === 'production' && authMode === 'dev') {
    throw new Error('AUTH_MODE=dev is forbidden in production');
  }

  const config = {
    nodeEnv,
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: required('DATABASE_URL', env.DATABASE_URL),
    databaseSsl: env.DATABASE_SSL === 'true',
    authMode,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:4173').split(',').map(v => v.trim()).filter(Boolean),
    oidc: null
  };

  if (authMode === 'oidc') {
    config.oidc = {
      issuer: required('AUTH_ISSUER', env.AUTH_ISSUER),
      audience: required('AUTH_AUDIENCE', env.AUTH_AUDIENCE),
      jwksUrl: required('AUTH_JWKS_URL', env.AUTH_JWKS_URL)
    };
  }

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return config;
}
