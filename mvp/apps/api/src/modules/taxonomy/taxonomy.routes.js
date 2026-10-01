import { listTaxonomy } from './taxonomy.service.js';
import { normalizeLocale } from './taxonomy.validation.js';

function requestedLocale(request) {
  return normalizeLocale(request.query?.locale ?? request.headers['accept-language']);
}

export async function registerTaxonomyRoutes(app, { pool }) {
  app.get('/v1/taxonomies/languages', async request =>
    listTaxonomy(pool, 'languages', { locale: requestedLocale(request) })
  );

  app.get('/v1/taxonomies/specialties', async request =>
    listTaxonomy(pool, 'specialties', { locale: requestedLocale(request) })
  );

  app.get('/v1/taxonomies/cities', async request =>
    listTaxonomy(pool, 'cities', {
      locale: requestedLocale(request),
      country: request.query?.country
    })
  );
}
