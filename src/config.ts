import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { RefereeError } from './rules.js';
import type { TagteamConfig } from './types.js';

const ConfigSchema = z
  .object({
    model: z.string().min(1).default('gpt-6.1-sol'),
    checkpoints: z.array(z.string()).default([]),
    maxRounds: z.number().int().min(1).max(10).default(3),
    timeoutMs: z.number().int().min(1000).default(300_000),
  })
  .strict();

export const DEFAULT_CONFIG: TagteamConfig = ConfigSchema.parse({});

export function parseConfig(text: string): TagteamConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new RefereeError(`.tagteam.json is not valid JSON: ${(err as Error).message}`);
  }
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) =>
      i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message,
    );
    throw new RefereeError(`.tagteam.json is invalid: ${issues.join('; ')}`);
  }
  return result.data;
}

export async function loadConfig(root: string): Promise<TagteamConfig> {
  try {
    return parseConfig(await readFile(join(root, '.tagteam.json'), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_CONFIG };
    throw err;
  }
}
