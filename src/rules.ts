import type { DebateStatus, Verdict } from './types.js';

export class RefereeError extends Error {}

export const STILL_WORKING = 'ChatGPT is still working on this turn.';

type Action = 'reply' | 'retry' | 'ruling';

const REQUIRED_STATUS: Record<Action, DebateStatus> = {
  reply: 'open',
  retry: 'stalled',
  ruling: 'escalated',
};

export function assertAllowed(action: Action, status: DebateStatus): void {
  const required = REQUIRED_STATUS[action];
  if (status !== required) {
    throw new RefereeError(
      `Cannot ${action}: the debate is ${status}; ${action} requires ${required}.`,
    );
  }
}

export function nextStatus(verdict: Verdict, round: number, maxRounds: number): DebateStatus {
  if (verdict === 'AGREE') return 'agreed';
  return round >= maxRounds ? 'escalated' : 'open';
}
