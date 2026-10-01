import { normalizeCountryCode, normalizeLocale } from './taxonomy.validation.js';

const definitions = {
  languages: {
    table: 'taxonomy_languages',
    labelTable: 'taxonomy_language_labels',
    key: 'language_code',
    country: false
  },
  specialties: {
    table: 'taxonomy_specialties',
    labelTable: 'taxonomy_specialty_labels',
    key: 'specialty_code',
    country: false
  },
  cities: {
    table: 'taxonomy_cities',
    labelTable: 'taxonomy_city_labels',
    key: 'city_code',
    country: true
  }
};

export async function listTaxonomy(pool, kind, options = {}) {
  const def = definitions[kind];
  if (!def) {
    const error = new Error('Unknown taxonomy');
    error.statusCode = 404;
    error.code = 'TAXONOMY_NOT_FOUND';
    throw error;
  }

  const locale = normalizeLocale(options.locale);
  const country = def.country ? normalizeCountryCode(options.country) : null;
  const whereCountry = def.country && country ? 'and t.country_code = $2' : '';
  const params = def.country && country ? [locale, country] : [locale];

  const result = await pool.query(`
    select t.code,
           coalesce(lbl.label, fallback.label, t.code) as label
           ${def.country ? ', t.country_code' : ''}
    from ${def.table} t
    left join ${def.labelTable} lbl
      on lbl.${def.key} = t.code and lbl.locale = $1
    left join ${def.labelTable} fallback
      on fallback.${def.key} = t.code and fallback.locale = 'fr'
    where t.status = 'ACTIVE'
      ${whereCountry}
    order by t.sort_order, coalesce(lbl.label, fallback.label, t.code), t.code
  `, params);

  return {
    kind,
    locale,
    items: result.rows.map(row => ({
      code: row.code,
      label: row.label,
      ...(def.country ? { countryCode: row.country_code } : {})
    }))
  };
}
