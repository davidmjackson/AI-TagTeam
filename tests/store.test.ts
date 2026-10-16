import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RefereeError } from '../src/rules.js';
import { Store } from '../src/store.js';
import type { DebateState } from '../src/types.js';

const state = (id: string): DebateState => ({
  id,
  topic: 't',
  createdAt: '2026-10-16T00:00:00.000Z',
  transcriptPath: `docs/debates/${id}.md`,
  threadId: null,
  round: 0,
  maxRounds: 3,
  status: 'open',
  lastVerdict: null,
  lastClaude: '',
  lastChatGpt: '',
  agreedSolution: '',
  pendingPrompt: null,
  lastError: null,
});

describe('Store', () => {
  it('round-trips state and gitignores its folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tagteam-store-'));
    const store = new Store(root);
    await store.save(state('d-1'));
    expect(await store.load('d-1')).toEqual(state('d-1'));
    expect(await store.exists('d-1')).toBe(true);
    expect(await store.exists('d-2')).toBe(false);
    expect(await readFile(join(root, '.tagteam', '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('reports an unknown debate', async () => {
    const store = new Store(await mkdtemp(join(tmpdir(), 'tagteam-store-')));
    await expect(store.load('missing')).rejects.toThrow('No debate with id "missing"');
  });

  it('reports an unreadable state file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tagteam-store-'));
    const store = new Store(root);
    await store.save(state('d-1'));
    await writeFile(join(root, '.tagteam', 'state', 'd-1.json'), '{broken');
    await expect(store.load('d-1')).rejects.toThrow(/unreadable/);
  });

  it('rejects path-like ids before touching disk', async () => {
    const store = new Store(await mkdtemp(join(tmpdir(), 'tagteam-store-')));
    await expect(store.load('../../etc/passwd')).rejects.toThrow(RefereeError);
  });
});
