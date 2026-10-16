import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { Referee } from '../src/referee.js';
import { RefereeError } from '../src/rules.js';
import { createServer } from '../src/server.js';
import { Store } from '../src/store.js';
import { Transcript } from '../src/transcript.js';
import { makeReferee } from '../src/wiring.js';
import { FakeRunner, object } from './fake-runner.js';

async function connect(getReferee: () => Promise<Referee>): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([createServer(getReferee).connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function fakeReferee(replies: string[]): Promise<Referee> {
  const root = await mkdtemp(join(tmpdir(), 'tagteam-server-'));
  return new Referee({
    runner: new FakeRunner(replies),
    store: new Store(root),
    transcript: new Transcript(root),
    config: DEFAULT_CONFIG,
  });
}

const text = (result: Awaited<ReturnType<Client['callTool']>>): string =>
  (result.content as Array<{ type: string; text: string }>)[0]?.text ?? '';

async function openedDebate(): Promise<{ client: Client; id: string }> {
  const referee = await fakeReferee([object('A')]);
  const client = await connect(async () => referee);
  const opened = await client.callTool({
    name: 'debate_open',
    arguments: { topic: 'T', claude_position: 'P' },
  });
  return { client, id: /Debate ([a-z0-9-]+)/.exec(text(opened))?.[1] ?? '' };
}

describe('MCP server', () => {
  it('exposes exactly five tools and none that closes a debate', async () => {
    const client = await connect(() => fakeReferee([]));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'debate_open',
      'debate_record_ruling',
      'debate_reply',
      'debate_retry',
      'debate_status',
    ]);
  });

  it('opens a debate and returns ChatGPT verbatim', async () => {
    const referee = await fakeReferee([object('Hold on: X.')]);
    const client = await connect(async () => referee);
    const result = await client.callTool({
      name: 'debate_open',
      arguments: { topic: 'T', claude_position: 'P', files: ['src/a.ts'] },
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('Hold on: X.');
  });
});

describe('MCP server errors', () => {
  it('returns referee errors as tool errors and keeps serving', async () => {
    const client = await connect(async () => {
      throw new RefereeError('.tagteam.json is not valid JSON: Unexpected token');
    });
    const first = await client.callTool({ name: 'debate_status', arguments: { debate_id: 'x' } });
    expect(first.isError).toBe(true);
    expect(text(first)).toContain('.tagteam.json is not valid JSON');
    const second = await client.callTool({ name: 'debate_retry', arguments: { debate_id: 'x' } });
    expect(second.isError).toBe(true);
  });
});

describe('MCP server turn rules', () => {
  it('refuses a ruling on a debate that is not escalated', async () => {
    const { client, id } = await openedDebate();
    const ruling = await client.callTool({
      name: 'debate_record_ruling',
      arguments: { debate_id: id, ruling: 'R' },
    });
    expect(ruling.isError).toBe(true);
    expect(text(ruling)).toContain('requires escalated');
  });

  it('reports a failed reply as a stalled result, not a tool error', async () => {
    const { client, id } = await openedDebate();
    const reply = await client.callTool({
      name: 'debate_reply',
      arguments: { debate_id: id, response: 'C' },
    });
    // No second reply is queued, so the runner throws and the referee stalls.
    expect(reply.isError).toBeFalsy();
    expect(text(reply)).toContain('status: stalled');
    expect(text(reply)).toContain('no reply queued');
  });
});

describe('makeReferee', () => {
  it('surfaces a malformed .tagteam.json as a RefereeError', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tagteam-wiring-'));
    await writeFile(join(root, '.tagteam.json'), '{ broken');
    await expect(makeReferee(root)).rejects.toThrow(RefereeError);
  });

  it('builds a referee from defaults', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tagteam-wiring-'));
    await expect(makeReferee(root)).resolves.toBeInstanceOf(Referee);
  });
});
