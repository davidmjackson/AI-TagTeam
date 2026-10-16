import { spawn } from 'node:child_process';
import { CodexError, classify } from './errors.js';
import { parseEvents } from './events.js';
import type { CodexReply, CodexRunner } from './runner.js';

export interface CodexCliOptions {
  bin: string;
  cwd: string;
  model: string;
  schemaPath: string;
  timeoutMs: number;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

export function buildArgs(opts: CodexCliOptions, threadId: string | null): string[] {
  const common = [
    '--json',
    '-m',
    opts.model,
    '-c',
    'sandbox_mode="read-only"',
    '--skip-git-repo-check',
    '--output-schema',
    opts.schemaPath,
  ];
  return threadId === null
    ? ['exec', ...common, '-']
    : ['exec', 'resume', ...common, threadId, '-'];
}

function runProcess(opts: CodexCliOptions, args: string[], input: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.bin, args, { cwd: opts.cwd, shell: false });
    const result: ProcessResult = { stdout: '', stderr: '', code: null, timedOut: false };
    const timer = setTimeout(() => {
      result.timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      result.stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      result.stderr += chunk.toString();
    });
    child.stdin.on('error', () => undefined);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new CodexError(`Could not start codex: ${err.message}`, 'failed'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ...result, code });
    });
    child.stdin.end(input);
  });
}

function toReply(result: ProcessResult, timeoutMs: number, knownThread: string | null): CodexReply {
  if (result.timedOut) throw new CodexError(`codex timed out after ${timeoutMs} ms`, 'timeout');
  const run = parseEvents(result.stdout);
  const exitDetail =
    result.code === 0 ? null : result.stderr.trim() || `codex exited with code ${result.code}`;
  const detail = run.failure ?? exitDetail;
  if (detail !== null) throw new CodexError(detail, classify(`${detail}\n${result.stderr}`));
  const threadId = run.threadId ?? knownThread;
  if (threadId === null || run.text === null)
    throw new CodexError('codex produced no reply', 'failed');
  return { threadId, text: run.text };
}

export class CodexCli implements CodexRunner {
  constructor(private readonly opts: CodexCliOptions) {}

  async start(prompt: string): Promise<CodexReply> {
    const result = await runProcess(this.opts, buildArgs(this.opts, null), prompt);
    return toReply(result, this.opts.timeoutMs, null);
  }

  async resume(threadId: string, prompt: string): Promise<CodexReply> {
    const result = await runProcess(this.opts, buildArgs(this.opts, threadId), prompt);
    return toReply(result, this.opts.timeoutMs, threadId);
  }
}
