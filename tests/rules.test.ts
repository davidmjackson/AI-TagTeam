import { describe, expect, it } from 'vitest';
import { RefereeError, assertAllowed, nextStatus } from '../src/rules.js';

describe('nextStatus', () => {
  it('closes as agreed only on AGREE', () => {
    expect(nextStatus('AGREE', 1, 3)).toBe('agreed');
    expect(nextStatus('AGREE', 3, 3)).toBe('agreed');
  });

  it('stays open on OBJECT before the final round', () => {
    expect(nextStatus('OBJECT', 1, 3)).toBe('open');
    expect(nextStatus('OBJECT', 2, 3)).toBe('open');
  });

  it('escalates on OBJECT in the final round', () => {
    expect(nextStatus('OBJECT', 3, 3)).toBe('escalated');
  });
});

describe('assertAllowed', () => {
  it('allows reply only when open', () => {
    expect(() => assertAllowed('reply', 'open')).not.toThrow();
    for (const status of ['stalled', 'agreed', 'escalated', 'ruled'] as const) {
      expect(() => assertAllowed('reply', status)).toThrow(RefereeError);
    }
  });

  it('allows retry only when stalled', () => {
    expect(() => assertAllowed('retry', 'stalled')).not.toThrow();
    expect(() => assertAllowed('retry', 'open')).toThrow(RefereeError);
  });

  it('allows a ruling only when escalated', () => {
    expect(() => assertAllowed('ruling', 'escalated')).not.toThrow();
    for (const status of ['open', 'stalled', 'agreed', 'ruled'] as const) {
      expect(() => assertAllowed('ruling', status)).toThrow(/requires escalated/);
    }
  });
});
