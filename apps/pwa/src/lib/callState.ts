export type CallState = 'idle' | 'requested' | 'ringing' | 'accepted' | 'declined' | 'joining' | 'active' | 'ended' | 'failed';

const transitions: Record<CallState, CallState[]> = {
  idle: ['requested', 'ringing'],
  requested: ['ringing', 'accepted', 'declined', 'ended', 'failed'],
  ringing: ['accepted', 'declined', 'ended', 'failed'],
  accepted: ['joining', 'ended', 'failed'],
  declined: ['idle'],
  joining: ['active', 'ended', 'failed'],
  active: ['ended', 'failed'],
  ended: ['idle'],
  failed: ['idle']
};

export function validateTransition(from: CallState, to: CallState): boolean {
  return from === to || transitions[from].includes(to);
}

export function reduceCallState(current: CallState, next: CallState): CallState {
  return validateTransition(current, next) ? next : current;
}
