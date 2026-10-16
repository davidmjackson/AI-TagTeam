import { describe, expect, it } from 'vitest';
import { classify } from '../src/codex/errors.js';
import { parseEvents } from '../src/codex/events.js';

const line = (event: unknown): string => JSON.stringify(event);

describe('parseEvents', () => {
  it('reads the thread id and the last agent message, skipping noise', () => {
    const stdout = [
      'warning: not json',
      line({ type: 'error', message: 'Reconnecting... 1/5' }),
      line({ type: 'thread.started', thread_id: 't-1' }),
      line({ type: 'item.completed', item: { type: 'error', message: 'model metadata' } }),
      line({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
      line({ type: 'item.completed', item: { type: 'agent_message', text: 'final' } }),
      '',
    ].join('\n');
    expect(parseEvents(stdout)).toEqual({
      threadId: 't-1',
      text: 'final',
      failure: null,
      lastError: 'Reconnecting... 1/5',
    });
  });

  it('reports a failed turn', () => {
    const stdout = line({ type: 'turn.failed', error: { message: 'usage limit reached' } });
    expect(parseEvents(stdout).failure).toBe('usage limit reached');
  });
});

describe('parseEvents lastError', () => {
  it('keeps the last top-level error message', () => {
    const stdout = [
      line({ type: 'error', message: 'first' }),
      line({ type: 'error', message: 'unauthorized (401)' }),
    ].join('\n');
    expect(parseEvents(stdout).lastError).toBe('unauthorized (401)');
  });
});

describe('classify', () => {
  it.each([
    ['Could not validate: invalid_refresh_token', 'auth'],
    ['workspace routing discovery unauthorized (401)', 'auth'],
    ["You've hit your usage limit. Try again at 3pm.", 'limit'],
    ['status 429 Too Many Requests', 'limit'],
    ['boom', 'failed'],
  ])('%s → %s', (detail, kind) => {
    expect(classify(detail)).toBe(kind);
  });
});
