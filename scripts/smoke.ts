import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatResult } from '../src/format.js';
import { makeReferee } from '../src/wiring.js';

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'tagteam-smoke-'));
  const referee = await makeReferee(root);
  const result = await referee.open({
    topic: 'Smoke test: function naming',
    claudePosition:
      'Exported TypeScript functions should use camelCase. This is a connectivity check; answer briefly.',
  });
  process.stdout.write(
    `${formatResult(result)}\n\nTranscript: ${join(root, result.transcriptPath)}\n`,
  );
  if (result.status === 'stalled') throw new Error(`Codex turn failed: ${result.error ?? ''}`);
  if (result.chatgpt.startsWith('[referee]'))
    throw new Error('ChatGPT reply did not match the schema');
  const transcript = await readFile(join(root, result.transcriptPath), 'utf8');
  if (!transcript.includes('— ChatGPT:')) throw new Error('Transcript has no ChatGPT turn');
  process.stdout.write('SMOKE OK\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`SMOKE FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
