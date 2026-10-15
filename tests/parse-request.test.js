import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateParsedRequest,
  validateUserRequest,
  getCompatibleDonors,
  canDonate,
  normalizeBloodGroup,
  heuristicParseRequest
} from '../lib/parse-request.js';

test('accepts valid request filters', () => {
  assert.deepEqual(validateParsedRequest({ intent: 'find_donors', bloodGroup: 'o+', city: 'Lahore' }), {
    intent: 'find_donors',
    bloodGroup: 'O+',
    city: 'Lahore',
    urgency: 'standard',
    hospital: null,
    clarification: null
  });
});

test('asks for clarification when a required field is missing', () => {
  const result = validateParsedRequest({ intent: 'find_donors', bloodGroup: 'A+', city: null });
  assert.equal(result.intent, 'clarify');
  assert.ok(result.clarification);
});

test('rejects an unsupported blood group by requesting clarification', () => {
  const result = validateParsedRequest({ intent: 'find_donors', bloodGroup: 'X+', city: 'Lahore' });
  assert.equal(result.intent, 'clarify');
  assert.equal(result.bloodGroup, null);
});

test('rejects non-object model output', () => {
  assert.throws(() => validateParsedRequest('not json object'));
});

test('trims valid user requests', () => {
  assert.equal(validateUserRequest('  Need O+ in Lahore  '), 'Need O+ in Lahore');
});

test('rejects too-short and too-long user requests', () => {
  assert.throws(() => validateUserRequest('x'));
  assert.throws(() => validateUserRequest('x'.repeat(501)));
});

// Blood Compatibility Tests
test('blood compatibility: O- is universal red cell donor', () => {
  assert.deepEqual(getCompatibleDonors('O-'), ['O-']);
  assert.ok(canDonate('O-', 'O+'));
  assert.ok(canDonate('O-', 'A+'));
  assert.ok(canDonate('O-', 'B+'));
  assert.ok(canDonate('O-', 'AB+'));
});

test('blood compatibility: AB+ is universal recipient', () => {
  const allGroups = ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'];
  assert.deepEqual(getCompatibleDonors('AB+'), allGroups);
  for (const group of allGroups) {
    assert.ok(canDonate(group, 'AB+'), `${group} should be able to donate to AB+`);
  }
});

test('blood compatibility: O+ can receive from O+ and O-', () => {
  assert.deepEqual(getCompatibleDonors('O+'), ['O+', 'O-']);
  assert.ok(canDonate('O+', 'O+'));
  assert.ok(canDonate('O-', 'O+'));
  assert.equal(canDonate('A+', 'O+'), false);
});

// Blood group normalization tests
test('normalizes blood group variations correctly', () => {
  assert.equal(normalizeBloodGroup('o positive'), 'O+');
  assert.equal(normalizeBloodGroup('B neg'), 'B-');
  assert.equal(normalizeBloodGroup('ab-pos'), 'AB+');
  assert.equal(normalizeBloodGroup('a -ve'), 'A-');
  assert.equal(normalizeBloodGroup('O+'), 'O+');
});

// Heuristic Fallback Parser Tests (Offline / No API Key mode)
test('heuristic parser extracts English search request', () => {
  const res = heuristicParseRequest('Need O-positive blood donor in Lahore urgently');
  assert.equal(res.intent, 'find_donors');
  assert.equal(res.bloodGroup, 'O+');
  assert.equal(res.city, 'Lahore');
  assert.equal(res.urgency, 'urgent');
});

test('heuristic parser extracts Roman Urdu search request', () => {
  const res = heuristicParseRequest('Mujhe Lahore mein B negative donor ki sakht zaroorat hai');
  assert.equal(res.intent, 'find_donors');
  assert.equal(res.bloodGroup, 'B-');
  assert.equal(res.city, 'Lahore');
});

test('heuristic parser detects hospital mentions', () => {
  const res = heuristicParseRequest('Emergency blood request: 2 units of A+ at Services Hospital in Lahore');
  assert.equal(res.intent, 'find_donors');
  assert.equal(res.bloodGroup, 'A+');
  assert.equal(res.city, 'Lahore');
  assert.equal(res.urgency, 'critical');
  assert.equal(res.hospital, 'Services Hospital');
});

test('heuristic parser clarifies off-topic input', () => {
  const res = heuristicParseRequest('What is the weather today?');
  assert.equal(res.intent, 'clarify');
  assert.ok(res.clarification);
});
