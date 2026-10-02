import { listTaxonomy } from './taxonomy.service.js';
import { resolveRequestLocale } from '../localization/localization.js';

export async function registerTaxonomyRoutes(app, { pool }) {
  app.get('/v1/taxonomies/languages', async request =>
    listTaxonomy(pool, 'languages', { locale: resolveRequestLocale(request) })
  );

  app.get('/v1/taxonomies/specialties', async request =>
    listTaxonomy(pool, 'specialties', { locale: resolveRequestLocale(request) })
  );

  app.get('/v1/taxonomies/cities', async request =>
    listTaxonomy(pool, 'cities', {
      locale: resolveRequestLocale(request),
      country: request.query?.country
    })
  );
}
