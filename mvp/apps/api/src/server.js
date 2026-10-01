import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { buildApp } from './app.js';

const config = loadConfig();
const pool = createPool(config);
const app = await buildApp({ config, pool });

async function shutdown(signal) {
  app.log.info({ signal }, 'shutdown requested');
  await app.close();
  await pool.end();
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exit(1);
}
