import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateArrivalFact,
  validateConsultationFact,
  validateOperationalWindow,
  validateRoomAssignmentRevision
} from '../src/modules/operations/operations.validation.js';

const roomId = '11111111-1111-4111-8111-111111111111';

test('Patient and Doctor arrivals remain independent structural facts', () => {
  const patient = validateArrivalFact({
    partyKind: 'patient',
    arrivedAt: '2026-10-05T08:50:00Z',
    semanticKey: 'arrival:patient:1'
  });
  const doctor = validateArrivalFact({
    partyKind: 'doctor',
    arrivedAt: '2026-10-05T08:55:00Z',
    semanticKey: 'arrival:doctor:1'
  });
  assert.equal(patient.partyKind, 'PATIENT');
  assert.equal(doctor.partyKind, 'DOCTOR');
});

test('consultation facts are structural start/complete facts, not lifecycle transitions', () => {
  assert.equal(validateConsultationFact({
    factCode: 'CONSULTATION_STARTED',
    occurredAt: '2026-10-05T09:02:00Z',
    semanticKey: 'consult:start:1'
  }).factCode, 'CONSULTATION_STARTED');

  assert.equal(validateConsultationFact({
    factCode: 'CONSULTATION_COMPLETED',
    occurredAt: '2026-10-05T09:24:00Z',
    semanticKey: 'consult:complete:1'
  }).factCode, 'CONSULTATION_COMPLETED');

  assert.throws(
    () => validateConsultationFact({
      factCode: 'CANCELLED',
      occurredAt: '2026-10-05T09:24:00Z',
      semanticKey: 'invented'
    }),
    error => error.code === 'INVALID_CONSULTATION_FACT'
  );
});

test('room assignment requires optimistic version and allows explicit interval only when complete', () => {
  const value = validateRoomAssignmentRevision({
    roomId,
    expectedVersion: 0
  });
  assert.equal(value.expectedVersion, 0);
  assert.equal(value.startsAt, null);
  assert.equal(value.endsAt, null);

  assert.throws(
    () => validateRoomAssignmentRevision({
      roomId,
      expectedVersion: 0,
      startsAt: '2026-10-05T09:00:00Z'
    }),
    error => error.code === 'INVALID_ROOM_ASSIGNMENT_INTERVAL'
  );
});

test('operational read window has only a technical size cap', () => {
  const value = validateOperationalWindow({
    from: '2026-10-05T00:00:00Z',
    to: '2026-10-06T00:00:00Z'
  });
  assert.equal(value.to.diff(value.from, 'hours').hours, 24);

  assert.throws(
    () => validateOperationalWindow({
      from: '2026-10-01T00:00:00Z',
      to: '2026-11-15T00:00:00Z'
    }),
    error => error.code === 'OPERATION_WINDOW_TOO_LARGE'
  );
});
