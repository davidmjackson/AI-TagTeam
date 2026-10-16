import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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

function killGroup(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // group already gone
  }
}

function collectOutput(child: ChildProcessWithoutNullStreams, result: ProcessResult): void {
  child.stdout.on('data', (chunk: Buffer) => {
    result.stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    result.stderr += chunk.toString();
  });
}

function runProcess(opts: CodexCliOptions, args: string[], input: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.bin, args, { cwd: opts.cwd, shell: false, detached: true });
    const result: ProcessResult = { stdout: '', stderr: '', code: null, timedOut: false };
    let settled = false;
    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish();
    };
    const timer = setTimeout(() => {
      result.timedOut = true;
      killGroup(child.pid);
      settle(() => resolve({ ...result }));
    }, opts.timeoutMs);
    collectOutput(child, result);
    child.stdin.on('error', () => undefined);
    child.on('error', (err) => {
      settle(() => reject(new CodexError(`Could not start codex: ${err.message}`, 'failed')));
    });
    child.on('close', (code) => {
      settle(() => resolve({ ...result, code }));
    });
    child.stdin.end(input);
  });
}

function exitDetail(result: ProcessResult, lastError: string | null): string | null {
  if (result.code === 0) return null;
  return result.stderr.trim() || lastError || `codex exited with code ${result.code}`;
}

function toReply(result: ProcessResult, timeoutMs: number, knownThread: string | null): CodexReply {
  if (result.timedOut) throw new CodexError(`codex timed out after ${timeoutMs} ms`, 'timeout');
  const run = parseEvents(result.stdout);
  const detail = run.failure ?? exitDetail(result, run.lastError);
  if (detail !== null) throw new CodexError(detail, classify(`${detail}\n${result.stderr}`));
  const threadId = run.threadId ?? knownThread;
  if (threadId === null || run.text === null || run.text.trim() === '')
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
