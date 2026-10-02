import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApplicationShell } from '../src/app-shell.js';
import { layoutModeForWidth, responsiveContract } from '../src/responsive.js';

const context = {
  account: {
    id: 'account-1',
    preferredLocale: 'fr'
  },
  roles: [
    { role: 'PATIENT', permissions: ['appointment.read'] },
    { role: 'DOCTOR', permissions: ['appointment.read'] }
  ],
  permissions: [
    'session.context.read',
    'search.public.read',
    'appointment.read',
    'profile.patient.read',
    'profile.doctor.read'
  ],
  facilityMemberships: [],
  doctorAffiliations: [
    { affiliationId: 'aff-1', facilityId: 'facility-1' }
  ]
};

test('responsive contracts map phone, tablet and desktop without changing business authority', () => {
  assert.equal(layoutModeForWidth(390), 'phone');
  assert.equal(layoutModeForWidth(820), 'tablet');
  assert.equal(layoutModeForWidth(1440), 'desktop');

  for (const width of [390, 820, 1440]) {
    assert.equal(
      responsiveContract(width).concurrencySensitiveWrites,
      'online-server-authoritative'
    );
  }
});

test('one shared application shell preserves canonical Appointment API at every breakpoint', () => {
  const shells = [390, 820, 1440].map(width =>
    buildApplicationShell({ sessionContext: context, width })
  );

  assert.ok(shells.every(shell => shell.singleApplication === true));
  assert.ok(shells.every(shell => shell.accountId === 'account-1'));
  assert.ok(shells.every(shell =>
    shell.canonicalApi.appointmentResource === '/v1/appointments/:appointmentId'
  ));
  assert.ok(shells.every(shell =>
    shell.canonicalApi.deviceSpecificBusinessApi === false
  ));
  assert.deepEqual(shells.map(shell => shell.responsive.mode), ['phone', 'tablet', 'desktop']);
});

test('role contexts coexist in the same shell and navigation is permission-derived', () => {
  const shell = buildApplicationShell({
    sessionContext: context,
    width: 1440,
    locale: 'en'
  });

  assert.deepEqual(shell.roleContexts, ['PATIENT', 'DOCTOR']);
  assert.equal(shell.locale, 'en');
  assert.ok(shell.navigation.some(item => item.id === 'appointments'));
  assert.ok(shell.navigation.some(item => item.id === 'profile'));
  assert.equal(shell.navigation.some(item => item.id === 'admin'), false);
  assert.equal(shell.navigation.some(item => item.id === 'staff'), false);
});
