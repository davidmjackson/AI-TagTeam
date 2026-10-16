import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexError } from '../src/codex/errors.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { Referee } from '../src/referee.js';
import { RefereeError } from '../src/rules.js';
import { Store } from '../src/store.js';
import { Transcript } from '../src/transcript.js';
import { FakeRunner, agree, object } from './fake-runner.js';

const NOW = new Date('2026-10-16T09:00:00Z');

async function setup(replies: Array<string | Error>, root?: string) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), 'tagteam-referee-')));
  const runner = new FakeRunner(replies);
  const referee = new Referee({
    runner,
    store: new Store(dir),
    transcript: new Transcript(dir),
    config: DEFAULT_CONFIG,
    now: () => NOW,
  });
  const read = (path: string) => readFile(join(dir, path), 'utf8');
  return { dir, runner, referee, read };
}

const open = { topic: 'Use tabs?', claudePosition: 'Tabs, for accessibility.' };

describe('agreement', () => {
  it('closes as agreed on a valid AGREE and records the solution', async () => {
    const { referee, read } = await setup([agree('Use tabs with .editorconfig.')]);
    const result = await referee.open(open);
    expect(result).toMatchObject({
      status: 'agreed',
      round: 1,
      verdict: 'AGREE',
      agreedSolution: 'Use tabs with .editorconfig.',
    });
    expect(await read(result.transcriptPath)).toContain('## Outcome: AGREED');
  });

  it.each([
    ['malformed text', 'I agree!'],
    [
      'AGREE without a solution',
      JSON.stringify({ verdict: 'AGREE', argument: 'ok', agreed_solution: '' }),
    ],
  ])('does not close on %s', async (_label, text) => {
    const { referee, read } = await setup([text]);
    const result = await referee.open(open);
    expect(result).toMatchObject({ status: 'open', verdict: 'OBJECT' });
    expect(await read(result.transcriptPath)).toContain(text);
  });
});

describe('rounds and escalation', () => {
  it('escalates after the final OBJECT and allows no further round', async () => {
    const { referee, runner, read } = await setup([object('A'), object('B'), object('C final')]);
    const { id } = await referee.open(open);
    await referee.reply(id, 'Counter 1');
    const last = await referee.reply(id, 'Claude final');
    expect(last).toMatchObject({ status: 'escalated', round: 3 });
    await expect(referee.reply(id, 'one more')).rejects.toThrow(RefereeError);
    expect(runner.calls).toHaveLength(3);
    const transcript = await read(last.transcriptPath);
    expect(transcript).toContain('## Outcome: ESCALATED to David');
    expect(transcript).toContain('Claude final');
    expect(transcript).toContain('C final');
  });

  it('resumes the same Codex thread after the first round', async () => {
    const { referee, runner } = await setup([object('A'), agree('S')]);
    const { id } = await referee.open(open);
    await referee.reply(id, 'Counter');
    expect(runner.calls.map((c) => c.kind)).toEqual(['start', 'resume']);
    expect(runner.calls[1]?.threadId).toBe('thread-1');
    expect(runner.calls[1]?.prompt).toContain('Round 2 of 3');
  });

  it('refuses replies to a closed debate', async () => {
    const { referee } = await setup([agree('S')]);
    const { id } = await referee.open(open);
    await expect(referee.reply(id, 'more')).rejects.toThrow(/agreed/);
  });
});

describe('failures', () => {
  it('stalls without consuming a round, then retries the same prompt', async () => {
    const { referee, runner, read } = await setup([
      new CodexError('timed out', 'timeout'),
      agree('S'),
    ]);
    const stalled = await referee.open(open);
    expect(stalled).toMatchObject({ status: 'stalled', round: 0, error: 'timed out' });
    await expect(referee.reply(stalled.id, 'x')).rejects.toThrow(RefereeError);
    const retried = await referee.retry(stalled.id);
    expect(retried).toMatchObject({ status: 'agreed', round: 1 });
    expect(runner.calls[1]?.prompt).toBe(runner.calls[0]?.prompt);
    const transcript = await read(retried.transcriptPath);
    expect(transcript.match(/— Claude/g)).toHaveLength(1);
    expect(transcript).toContain('round not counted');
  });

  it('adds the sign-in hint to an auth failure', async () => {
    const { referee } = await setup([new CodexError('unauthorized (401)', 'auth')]);
    const result = await referee.open(open);
    expect(result.error).toContain('codex login --device-auth');
  });

  it('refuses a retry when not stalled', async () => {
    const { referee } = await setup([object('A')]);
    const { id } = await referee.open(open);
    await expect(referee.retry(id)).rejects.toThrow(/requires stalled/);
  });
});

describe('rulings', () => {
  it('records a ruling only after escalation', async () => {
    const { referee, read } = await setup([object('A'), object('B'), object('C')]);
    const { id } = await referee.open(open);
    await expect(referee.recordRuling(id, 'Spaces.')).rejects.toThrow(/requires escalated/);
    await referee.reply(id, 'r2');
    await referee.reply(id, 'r3');
    const ruled = await referee.recordRuling(id, 'Spaces, per house style.');
    expect(ruled.status).toBe('ruled');
    expect(await read(ruled.transcriptPath)).toContain(
      "## David's ruling (relayed by Claude)\n\nSpaces, per house style.",
    );
    await expect(referee.recordRuling(id, 'again')).rejects.toThrow(RefereeError);
  });
});

describe('records', () => {
  it('writes ChatGPT text byte-for-byte', async () => {
    const argument = 'See `src/a.ts`:\n\n```ts\nconst x = 1;\n```\n— naïve *case*';
    const { referee, read } = await setup([object(argument)]);
    const result = await referee.open(open);
    expect(result.chatgpt).toBe(argument);
    expect(await read(result.transcriptPath)).toContain(argument);
  });

  it('gives same-day debates on the same topic separate transcripts', async () => {
    const { referee } = await setup([object('A'), object('B')]);
    const first = await referee.open(open);
    const second = await referee.open(open);
    expect(first.id).toBe('2026-10-16-use-tabs');
    expect(second.id).toBe('2026-10-16-use-tabs-2');
    expect(second.transcriptPath).not.toBe(first.transcriptPath);
  });
});

describe('persistence', () => {
  it('continues a debate after a restart', async () => {
    const first = await setup([object('A')]);
    const { id } = await first.referee.open(open);
    const second = await setup([agree('S')], first.dir);
    const result = await second.referee.reply(id, 'Counter');
    expect(result).toMatchObject({ status: 'agreed', round: 2 });
    expect(second.runner.calls[0]).toMatchObject({ kind: 'resume', threadId: 'thread-1' });
  });

  it('reports status without calling Codex', async () => {
    const { referee, runner } = await setup([object('A')]);
    const { id } = await referee.open(open);
    expect(await referee.status(id)).toMatchObject({ status: 'open', round: 1, chatgpt: 'A' });
    expect(runner.calls).toHaveLength(1);
  });
});
