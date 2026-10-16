import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, loadConfig, parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  it('fills defaults', () => {
    expect(parseConfig('{}')).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toEqual({
      model: 'gpt-6.1-sol',
      checkpoints: [],
      maxRounds: 3,
      timeoutMs: 300_000,
    });
  });

  it('accepts overrides', () => {
    const config = parseConfig(
      '{"model":"gpt-6-astra","checkpoints":["design-final"],"maxRounds":2}',
    );
    expect(config).toMatchObject({
      model: 'gpt-6-astra',
      checkpoints: ['design-final'],
      maxRounds: 2,
    });
  });
});

describe('parseConfig rejections', () => {
  it('rejects malformed JSON with a readable message', () => {
    expect(() => parseConfig('{ model: ')).toThrow(/\.tagteam\.json is not valid JSON/);
  });

  it.each([
    ['{"maxRounds":0}', /maxRounds/],
    ['{"maxRounds":2.5}', /maxRounds/],
    ['{"model":""}', /model/],
    ['{"checkpoints":"design"}', /checkpoints/],
    ['{"timeoutMs":10}', /timeoutMs/],
    ['{"modle":"x"}', /modle/],
  ])('rejects %s', (text, message) => {
    expect(() => parseConfig(text)).toThrow(message);
  });
});

describe('loadConfig', () => {
  it('uses defaults when the file is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tagteam-config-'));
    expect(await loadConfig(root)).toEqual(DEFAULT_CONFIG);
  });

  it('reads the file when present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tagteam-config-'));
    await writeFile(join(root, '.tagteam.json'), '{"maxRounds":5}');
    expect((await loadConfig(root)).maxRounds).toBe(5);
  });
});
