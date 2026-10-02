import {
  localizationMetadata,
  resolveRequestLocale
} from './localization.js';

export async function registerLocalizationRoutes(app) {
  app.get('/v1/localization/meta', async request => ({
    ...localizationMetadata(resolveRequestLocale(request)),
    canonicalBusinessRecordsLocalized: false,
    uiCatalogOwnership: 'CLIENT',
    machineErrorCodesStable: true
  }));
}
