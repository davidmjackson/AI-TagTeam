import { describe, expect, it } from 'vitest';
import { parseReply, spoken } from '../src/verdict.js';

const reply = (value: unknown): string => JSON.stringify(value);

const invalidReplies: [string, string][] = [
  ['not JSON', 'I agree with Claude.'],
  ['a JSON array', '[]'],
  ['JSON null', 'null'],
  ['an empty string', ''],
  ['an unknown verdict', reply({ verdict: 'MAYBE', argument: 'x', agreed_solution: '' })],
  ['a missing argument', reply({ verdict: 'OBJECT', agreed_solution: '' })],
  ['a blank argument', reply({ verdict: 'OBJECT', argument: '  ', agreed_solution: '' })],
  [
    'AGREE without a solution',
    reply({ verdict: 'AGREE', argument: 'Fine.', agreed_solution: ' ' }),
  ],
  ['AGREE with no solution field', reply({ verdict: 'AGREE', argument: 'Fine.' })],
];

describe('parseReply', () => {
  it('accepts a valid AGREE with a solution', () => {
    const turn = parseReply(
      reply({ verdict: 'AGREE', argument: 'Sound.', agreed_solution: 'Use X.' }),
    );
    expect(turn).toMatchObject({
      verdict: 'AGREE',
      argument: 'Sound.',
      agreedSolution: 'Use X.',
      valid: true,
    });
  });

  it('accepts a valid OBJECT with an empty solution', () => {
    const turn = parseReply(
      reply({ verdict: 'OBJECT', argument: 'No: Y breaks.', agreed_solution: '' }),
    );
    expect(turn).toMatchObject({ verdict: 'OBJECT', valid: true });
  });

  it.each(invalidReplies)('treats %s as an invalid OBJECT', (_label, raw) => {
    const turn = parseReply(raw);
    expect(turn.verdict).toBe('OBJECT');
    expect(turn.valid).toBe(false);
    expect(turn.raw).toBe(raw);
  });
});

describe('spoken', () => {
  it('is the argument for a valid turn', () => {
    expect(
      spoken(parseReply(reply({ verdict: 'OBJECT', argument: 'Because Z.', agreed_solution: '' }))),
    ).toBe('Because Z.');
  });

  it('carries the raw text for an invalid turn', () => {
    const text = spoken(parseReply('free text'));
    expect(text).toContain('[referee]');
    expect(text).toContain('free text');
  });
});
