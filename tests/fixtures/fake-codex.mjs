#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout } from 'node:timers';

const mode = process.env.FAKE_CODEX_MODE ?? 'ok';
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
let input = '';

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  if (mode === 'hang') {
    spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { stdio: 'inherit' });
    setTimeout(() => {}, 60_000);
    return;
  }
  process.stdout.write('warning: not json\n');
  emit({ type: 'error', message: 'Reconnecting... 1/5' });
  emit({ type: 'thread.started', thread_id: 'thread-123' });
  if (mode === 'auth') {
    emit({
      type: 'turn.failed',
      error: { message: 'workspace routing discovery unauthorized (401)' },
    });
    process.exit(1);
  }
  if (mode === 'crash') {
    process.stderr.write('boom\n');
    process.exit(2);
  }
  if (mode === 'empty') {
    emit({ type: 'item.completed', item: { type: 'agent_message', text: '' } });
    process.exit(0);
  }
  const echo = JSON.stringify({ argv: process.argv.slice(2), stdin: input });
  emit({ type: 'item.completed', item: { type: 'agent_message', text: echo } });
  emit({ type: 'turn.completed' });
});
