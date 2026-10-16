import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexCli, buildArgs, type CodexCliOptions } from '../src/codex/cli.js';
import { CodexError } from '../src/codex/errors.js';

const FAKE = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
const options = (overrides: Partial<CodexCliOptions> = {}): CodexCliOptions => ({
  bin: FAKE,
  cwd: process.cwd(),
  model: 'gpt-test',
  schemaPath: '/abs/reply.schema.json',
  timeoutMs: 5_000,
  ...overrides,
});
const echoed = (text: string): { argv: string[]; stdin: string } =>
  JSON.parse(text) as { argv: string[]; stdin: string };

afterEach(() => {
  delete process.env.FAKE_CODEX_MODE;
});

describe('buildArgs', () => {
  it('starts read-only with the schema and reads the prompt from stdin', () => {
    expect(buildArgs(options(), null)).toEqual([
      'exec',
      '--json',
      '-m',
      'gpt-test',
      '-c',
      'sandbox_mode="read-only"',
      '--skip-git-repo-check',
      '--output-schema',
      '/abs/reply.schema.json',
      '-',
    ]);
  });

  it('resumes read-only with the thread id', () => {
    const args = buildArgs(options(), 'thread-9');
    expect(args.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(args).toContain('sandbox_mode="read-only"');
    expect(args.slice(-2)).toEqual(['thread-9', '-']);
  });
});

describe('CodexCli', () => {
  it('returns the thread id and reply text', async () => {
    const reply = await new CodexCli(options()).start('hello');
    expect(reply.threadId).toBe('thread-123');
    expect(echoed(reply.text).stdin).toBe('hello');
  });

  it('passes a hostile prompt byte-for-byte on stdin, never in argv', async () => {
    const prompt = 'He said "no"; `rm -rf /` $(whoami) \'q\'\nline 2 — ünïcode';
    const reply = await new CodexCli(options()).resume('thread-123', prompt);
    const { argv, stdin } = echoed(reply.text);
    expect(stdin).toBe(prompt);
    expect(argv.join(' ')).not.toContain('whoami');
    expect(argv).toContain('sandbox_mode="read-only"');
  });
});

describe('CodexCli error events', () => {
  it('classifies an auth failure reported only as an error event', async () => {
    process.env.FAKE_CODEX_MODE = 'error-event';
    await expect(new CodexCli(options()).start('x')).rejects.toMatchObject({
      kind: 'auth',
      message: 'unauthorized (401)',
    });
  });
});

describe('CodexCli failures', () => {
  it('classifies an auth failure', async () => {
    process.env.FAKE_CODEX_MODE = 'auth';
    await expect(new CodexCli(options()).start('x')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('reports a crash with its stderr', async () => {
    process.env.FAKE_CODEX_MODE = 'crash';
    await expect(new CodexCli(options()).start('x')).rejects.toThrow('boom');
  });

  it('times out a hung process', async () => {
    process.env.FAKE_CODEX_MODE = 'hang';
    const error = await new CodexCli(options({ timeoutMs: 300 }))
      .start('x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CodexError);
    expect(error).toMatchObject({ kind: 'timeout' });
  });

  it('treats an empty final message as no reply', async () => {
    process.env.FAKE_CODEX_MODE = 'empty';
    await expect(new CodexCli(options()).start('x')).rejects.toMatchObject({ kind: 'failed' });
  });

  it('reports a missing binary as a failure', async () => {
    await expect(
      new CodexCli(options({ bin: '/nonexistent/codex' })).start('x'),
    ).rejects.toMatchObject({
      kind: 'failed',
    });
  });
});
