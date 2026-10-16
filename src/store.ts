import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertValidId } from './ids.js';
import { RefereeError } from './rules.js';
import type { DebateState } from './types.js';

export class Store {
  private readonly dir: string;

  constructor(root: string) {
    this.dir = join(root, '.tagteam', 'state');
  }

  async save(state: DebateState): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, '..', '.gitignore'), '*\n');
    await writeFile(this.path(state.id), `${JSON.stringify(state, null, 2)}\n`);
  }

  async load(id: string): Promise<DebateState> {
    const file = this.path(id);
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      throw new RefereeError(`No debate with id "${id}".`);
    }
    try {
      return JSON.parse(text) as DebateState;
    } catch {
      throw new RefereeError(`State for debate "${id}" is unreadable: ${file}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    return access(this.path(id)).then(
      () => true,
      () => false,
    );
  }

  private path(id: string): string {
    assertValidId(id);
    return join(this.dir, `${id}.json`);
  }
}
