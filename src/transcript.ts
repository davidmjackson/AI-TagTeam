import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertValidId } from './ids.js';
import type { ChatGptTurn, DebateState, TagteamConfig } from './types.js';

export class Transcript {
  constructor(private readonly root: string) {}

  pathFor(id: string): string {
    assertValidId(id);
    return join('docs', 'debates', `${id}.md`);
  }

  async append(id: string, text: string): Promise<void> {
    const file = join(this.root, this.pathFor(id));
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, text, 'utf8');
  }
}

export function renderHeader(state: DebateState, config: TagteamConfig): string {
  return `# Debate: ${state.topic}\n\n- Id: ${state.id}\n- Opened: ${state.createdAt}\n- Model: ${config.model}\n- Max rounds: ${config.maxRounds}\n\n`;
}

export function renderClaude(round: number, maxRounds: number, text: string): string {
  return `## Round ${round}/${maxRounds} — Claude\n\n${text}\n\n`;
}

export function renderChatGpt(round: number, maxRounds: number, turn: ChatGptTurn): string {
  const raw = turn.valid ? '' : `Raw reply:\n\n\`\`\`\`text\n${turn.raw}\n\`\`\`\`\n\n`;
  return `## Round ${round}/${maxRounds} — ChatGPT: ${turn.verdict}\n\n${turn.argument}\n\n${raw}`;
}

export function renderAgreed(solution: string): string {
  return `## Outcome: AGREED\n\n**Agreed solution, in ChatGPT's words:**\n\n${solution}\n\n`;
}

export function renderEscalated(state: DebateState): string {
  return `## Outcome: ESCALATED to David\n\n### Claude's final position\n\n${state.lastClaude}\n\n### ChatGPT's final position\n\n${state.lastChatGpt}\n\n`;
}

export function renderRuling(ruling: string): string {
  return `## David's ruling (relayed by Claude)\n\n${ruling}\n\n`;
}

export function renderNote(text: string): string {
  return `> **Referee:** ${text}\n\n`;
}
