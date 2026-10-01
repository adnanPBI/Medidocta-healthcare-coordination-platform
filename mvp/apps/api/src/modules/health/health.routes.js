export async function registerHealthRoutes(app, { pool }) {
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await pool.query('select 1');
      return { status: 'ok', database: 'ready' };
    } catch {
      reply.code(503);
      return { status: 'degraded', database: 'unavailable' };
    }
  });
}
