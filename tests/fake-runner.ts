import type { CodexReply, CodexRunner } from '../src/codex/runner.js';

export interface RunnerCall {
  kind: 'start' | 'resume';
  threadId?: string;
  prompt: string;
}

export class FakeRunner implements CodexRunner {
  readonly calls: RunnerCall[] = [];

  constructor(private readonly replies: Array<string | Error>) {}

  async start(prompt: string): Promise<CodexReply> {
    this.calls.push({ kind: 'start', prompt });
    return this.next('thread-1');
  }

  async resume(threadId: string, prompt: string): Promise<CodexReply> {
    this.calls.push({ kind: 'resume', threadId, prompt });
    return this.next(threadId);
  }

  private next(threadId: string): CodexReply {
    const reply = this.replies.shift();
    if (reply === undefined) throw new Error('FakeRunner: no reply queued');
    if (reply instanceof Error) throw reply;
    return { threadId, text: reply };
  }
}

export const agree = (solution: string): string =>
  JSON.stringify({ verdict: 'AGREE', argument: 'Convinced.', agreed_solution: solution });

export const object = (argument: string): string =>
  JSON.stringify({ verdict: 'OBJECT', argument, agreed_solution: '' });
