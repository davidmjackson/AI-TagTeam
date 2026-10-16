import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RefereeError } from '../src/rules.js';
import { Transcript, renderChatGpt, renderEscalated } from '../src/transcript.js';
import type { ChatGptTurn, DebateState } from '../src/types.js';

const turn = (overrides: Partial<ChatGptTurn>): ChatGptTurn => ({
  verdict: 'OBJECT',
  argument: 'Because.',
  agreedSolution: '',
  valid: true,
  raw: '{}',
  ...overrides,
});

describe('Transcript', () => {
  it('appends to docs/debates/<id>.md', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tagteam-transcript-'));
    const transcript = new Transcript(root);
    await transcript.append('d-1', 'one\n');
    await transcript.append('d-1', 'two\n');
    expect(transcript.pathFor('d-1')).toBe(join('docs', 'debates', 'd-1.md'));
    expect(await readFile(join(root, 'docs', 'debates', 'd-1.md'), 'utf8')).toBe('one\ntwo\n');
  });

  it('rejects path-like ids', async () => {
    const transcript = new Transcript(await mkdtemp(join(tmpdir(), 'tagteam-transcript-')));
    await expect(transcript.append('../x', 'y')).rejects.toThrow(RefereeError);
  });
});

describe('renderers', () => {
  it('keeps ChatGPT text verbatim', () => {
    const argument = 'Line 1\n\n```ts\nconst x = `a`;\n```\n— ünïcode *not emphasis*';
    expect(renderChatGpt(2, 3, turn({ argument }))).toContain(argument);
  });

  it('shows the raw reply for an invalid turn', () => {
    const text = renderChatGpt(
      1,
      3,
      turn({ valid: false, raw: 'free text', argument: '[referee] rejected' }),
    );
    expect(text).toContain('[referee] rejected');
    expect(text).toContain('free text');
  });

  it('puts both final positions side by side on escalation', () => {
    const text = renderEscalated({
      lastClaude: 'Claude final',
      lastChatGpt: 'ChatGPT final',
    } as DebateState);
    expect(text).toContain('ESCALATED');
    expect(text.indexOf('Claude final')).toBeLessThan(text.indexOf('ChatGPT final'));
  });
});
