import { fileURLToPath } from 'node:url';
import { CodexCli } from './codex/cli.js';
import { loadConfig } from './config.js';
import { Referee } from './referee.js';
import { Store } from './store.js';
import { Transcript } from './transcript.js';

export const REPLY_SCHEMA_PATH = fileURLToPath(
  new URL('../schema/reply.schema.json', import.meta.url),
);

export async function makeReferee(root: string): Promise<Referee> {
  const config = await loadConfig(root);
  const runner = new CodexCli({
    bin: process.env.TAGTEAM_CODEX_BIN ?? 'codex',
    cwd: root,
    model: config.model,
    schemaPath: REPLY_SCHEMA_PATH,
    timeoutMs: config.timeoutMs,
  });
  return new Referee({ runner, store: new Store(root), transcript: new Transcript(root), config });
}
