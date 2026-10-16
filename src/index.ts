#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { makeReferee } from './wiring.js';

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

createServer(() => makeReferee(root))
  .connect(new StdioServerTransport())
  .catch((err: unknown) => {
    process.stderr.write(`tagteam: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
