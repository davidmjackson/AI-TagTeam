interface CodexEvent {
  type?: string;
  message?: string;
  thread_id?: string;
  item?: { type?: string; text?: string };
  error?: { message?: string };
}

export interface ParsedRun {
  threadId: string | null;
  text: string | null;
  failure: string | null;
  lastError: string | null;
}

function toEvent(line: string): CodexEvent | null {
  try {
    return JSON.parse(line) as CodexEvent;
  } catch {
    return null;
  }
}

function applyMessage(run: ParsedRun, event: CodexEvent): void {
  if (event.type === 'item.completed' && event.item?.type === 'agent_message')
    run.text = event.item.text ?? '';
  if (event.type === 'error' && event.message) run.lastError = event.message;
}

function apply(run: ParsedRun, event: CodexEvent): void {
  if (event.type === 'thread.started' && event.thread_id) run.threadId = event.thread_id;
  applyMessage(run, event);
  if (event.type === 'turn.failed') run.failure = event.error?.message ?? 'turn failed';
}

export function parseEvents(stdout: string): ParsedRun {
  const run: ParsedRun = { threadId: null, text: null, failure: null, lastError: null };
  for (const line of stdout.split('\n')) {
    const event = toEvent(line.trim());
    if (event) apply(run, event);
  }
  return run;
}
