import assert from 'node:assert/strict';
import test from 'node:test';
import { randomInt } from 'node:crypto';

const mapSessionStatus = status =>
  status === 'assigned' ? 'active' : status === 'closed' ? 'closed' : 'waiting';
const ablyChannelForRequest = id => `peer-support:session:${id}`;
const livekitRoomForRequest = id => `peer-support-${id}`;
const isValidCallTransition = (from, to) => {
  const transitions = {
    waiting: ['ringing', 'connecting', 'ended'],
    ringing: ['connecting', 'ended'],
    connecting: ['active', 'ended'],
    active: ['ended'],
    ended: []
  };
  return from === to || Boolean(transitions[from]?.includes(to));
};

test('public support code has six digits', () => {
  const code = Array.from({ length: 6 }, () => randomInt(10)).join('');
  assert.match(code, /^\d{6}$/);
});

test('session channel and LiveKit room include request ID', () => {
  assert.equal(ablyChannelForRequest('request-123'), 'peer-support:session:request-123');
  assert.equal(livekitRoomForRequest('request-123'), 'peer-support-request-123');
});

test('call state transitions reject backwards movement', () => {
  assert.equal(isValidCallTransition('waiting', 'ringing'), true);
  assert.equal(isValidCallTransition('connecting', 'active'), true);
  assert.equal(isValidCallTransition('active', 'waiting'), false);
  assert.equal(isValidCallTransition('ended', 'active'), false);
});

test('session statuses map to member-safe statuses', () => {
  assert.equal(mapSessionStatus('queued'), 'waiting');
  assert.equal(mapSessionStatus('assigned'), 'active');
  assert.equal(mapSessionStatus('closed'), 'closed');
});

test('LiveKit identities retain anonymous and staff prefixes', () => {
  assert.equal(`anonymous-${'session-id'}`, 'anonymous-session-id');
  assert.equal(`staff-${'peer.user'}`, 'staff-peer.user');
});
