export type Verdict = 'AGREE' | 'OBJECT';

export type DebateStatus = 'open' | 'stalled' | 'agreed' | 'escalated' | 'ruled';

export interface ChatGptTurn {
  verdict: Verdict;
  argument: string;
  agreedSolution: string;
  valid: boolean;
  raw: string;
}

export interface DebateState {
  id: string;
  topic: string;
  createdAt: string;
  transcriptPath: string;
  threadId: string | null;
  round: number;
  maxRounds: number;
  status: DebateStatus;
  lastVerdict: Verdict | null;
  lastClaude: string;
  lastChatGpt: string;
  agreedSolution: string;
  pendingPrompt: string | null;
  lastError: string | null;
}

export interface TagteamConfig {
  model: string;
  checkpoints: string[];
  maxRounds: number;
  timeoutMs: number;
}

export interface TurnResult {
  id: string;
  status: DebateStatus;
  round: number;
  maxRounds: number;
  verdict: Verdict | null;
  chatgpt: string;
  agreedSolution: string;
  transcriptPath: string;
  error: string | null;
}
