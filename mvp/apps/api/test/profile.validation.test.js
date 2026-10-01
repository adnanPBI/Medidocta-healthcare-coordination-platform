import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDoctorProfilePatch,
  validateFacilityProfilePatch
} from '../src/modules/profiles/profile.validation.js';

test('doctor profile patch accepts minimal approved fields and deduplicates codes', () => {
  const value = validateDoctorProfilePatch({
    version: 2,
    displayName: ' Dr. Example ',
    publicBio: 'Short biography',
    specialtyCodes: ['cardiology', 'cardiology', 'internal-medicine'],
    primarySpecialtyCode: 'cardiology',
    languageCodes: ['fr', 'en', 'fr']
  });
  assert.equal(value.displayName, 'Dr. Example');
  assert.deepEqual(value.specialtyCodes, ['cardiology', 'internal-medicine']);
  assert.deepEqual(value.languageCodes, ['fr', 'en']);
});

test('doctor primary specialty must be selected when specialties are supplied', () => {
  assert.throws(() => validateDoctorProfilePatch({
    version: 1,
    specialtyCodes: ['cardiology'],
    primarySpecialtyCode: 'dermatology'
  }), error => error.code === 'PRIMARY_SPECIALTY_NOT_SELECTED');
});

test('unknown Figma-dependent fields are rejected instead of silently persisted', () => {
  assert.throws(() => validateDoctorProfilePatch({
    version: 1,
    medicalLicenseNumber: 'invented-field'
  }), error => error.code === 'UNKNOWN_PROFILE_FIELD');
});

test('facility profile accepts only the minimal current field contract', () => {
  assert.deepEqual(validateFacilityProfilePatch({
    version: 3,
    displayName: 'Clinic Example',
    publicSummary: null,
    cityCode: 'douala'
  }), {
    version: 3,
    displayName: 'Clinic Example',
    publicSummary: null,
    cityCode: 'douala'
  });
});
