import { AUTH_HINT, CodexError } from './codex/errors.js';
import type { CodexReply, CodexRunner } from './codex/runner.js';
import { dayStamp, slugify, uniqueId } from './ids.js';
import { followUpPrompt, openingPrompt } from './prompts.js';
import { RefereeError, STILL_WORKING, assertAllowed, nextStatus } from './rules.js';
import type { Store } from './store.js';
import {
  type Transcript,
  renderAgreed,
  renderChatGpt,
  renderClaude,
  renderEscalated,
  renderHeader,
  renderNote,
  renderRuling,
} from './transcript.js';
import type { DebateState, TagteamConfig, TurnResult } from './types.js';
import { parseReply, spoken } from './verdict.js';

export interface RefereeDeps {
  runner: CodexRunner;
  store: Store;
  transcript: Transcript;
  config: TagteamConfig;
  now?: () => Date;
}

export interface OpenInput {
  topic: string;
  claudePosition: string;
  files?: string[];
}

const inFlight = new Set<string>();

const AWAITING =
  'Awaiting ChatGPT. If this persists, the referee was interrupted: call debate_retry.';

interface StateSeed {
  id: string;
  topic: string;
  createdAt: Date;
  transcriptPath: string;
  maxRounds: number;
}

function newState({ createdAt, ...seed }: StateSeed): DebateState {
  return {
    ...seed,
    createdAt: createdAt.toISOString(),
    threadId: null,
    round: 0,
    status: 'open',
    lastVerdict: null,
    lastClaude: '',
    lastChatGpt: '',
    agreedSolution: '',
    pendingPrompt: null,
    lastError: null,
  };
}

function describeFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return err instanceof CodexError && err.kind === 'auth' ? `${message} ${AUTH_HINT}` : message;
}

export class Referee {
  constructor(private readonly deps: RefereeDeps) {}

  async open(input: OpenInput): Promise<TurnResult> {
    const now = (this.deps.now ?? (() => new Date()))();
    const base = `${dayStamp(now)}-${slugify(input.topic)}`;
    const id = await uniqueId(
      base,
      async (candidate) =>
        (await this.deps.store.exists(candidate)) || (await this.deps.transcript.exists(candidate)),
    );
    const key = this.claim(id);
    const { maxRounds } = this.deps.config;
    const state = newState({
      id,
      topic: input.topic,
      createdAt: now,
      transcriptPath: this.deps.transcript.pathFor(id),
      maxRounds,
    });
    await this.guard(key, () =>
      this.deps.transcript.append(id, renderHeader(state, this.deps.config)),
    );
    const prompt = openingPrompt({ ...input, files: input.files ?? [] }, maxRounds);
    return this.claudeTurn(state, input.claudePosition, prompt);
  }

  async reply(id: string, response: string): Promise<TurnResult> {
    const state = await this.deps.store.load(id);
    assertAllowed('reply', state.status);
    this.claim(id);
    const prompt = followUpPrompt(response, state.round + 1, state.maxRounds);
    return this.claudeTurn(state, response, prompt);
  }

  async retry(id: string): Promise<TurnResult> {
    const state = await this.deps.store.load(id);
    assertAllowed('retry', state.status);
    const key = this.claim(id);
    await this.guard(key, () =>
      this.deps.transcript.append(id, renderNote('Retrying the failed ChatGPT turn.')),
    );
    return this.exchange(state, state.pendingPrompt ?? '');
  }

  async recordRuling(id: string, ruling: string): Promise<TurnResult> {
    const state = await this.deps.store.load(id);
    assertAllowed('ruling', state.status);
    state.status = 'ruled';
    await this.deps.store.save(state);
    await this.deps.transcript.append(id, renderRuling(ruling));
    return this.result(state);
  }

  async status(id: string): Promise<TurnResult> {
    const result = this.result(await this.deps.store.load(id));
    return inFlight.has(this.flightKey(id)) ? { ...result, error: STILL_WORKING } : result;
  }

  private flightKey(id: string): string {
    return this.deps.store.statePath(id);
  }

  private claim(id: string): string {
    const key = this.flightKey(id);
    if (inFlight.has(key))
      throw new RefereeError('ChatGPT is still working on this turn; wait for it to finish.');
    inFlight.add(key);
    return key;
  }

  private async guard(key: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      inFlight.delete(key);
      throw err;
    }
  }

  private async claudeTurn(
    state: DebateState,
    message: string,
    prompt: string,
  ): Promise<TurnResult> {
    state.lastClaude = message;
    await this.guard(this.flightKey(state.id), () =>
      this.deps.transcript.append(
        state.id,
        renderClaude(state.round + 1, state.maxRounds, message),
      ),
    );
    return this.exchange(state, prompt);
  }

  private async exchange(state: DebateState, prompt: string): Promise<TurnResult> {
    const key = this.flightKey(state.id);
    let reply: CodexReply;
    try {
      Object.assign(state, { status: 'stalled', pendingPrompt: prompt, lastError: AWAITING });
      await this.deps.store.save(state);
      try {
        reply = await this.run(state, prompt);
      } catch (err) {
        return await this.stall(state, prompt, err);
      }
    } finally {
      inFlight.delete(key);
    }
    return this.record(state, reply);
  }

  private run(state: DebateState, prompt: string): Promise<CodexReply> {
    return state.threadId === null
      ? this.deps.runner.start(prompt)
      : this.deps.runner.resume(state.threadId, prompt);
  }

  private async record(state: DebateState, reply: CodexReply): Promise<TurnResult> {
    const turn = parseReply(reply.text);
    const round = state.round + 1;
    const { maxRounds } = state;
    Object.assign(state, {
      threadId: reply.threadId,
      round,
      lastVerdict: turn.verdict,
      lastChatGpt: spoken(turn),
      agreedSolution: turn.agreedSolution,
      pendingPrompt: null,
      lastError: null,
      status: nextStatus(turn.verdict, round, maxRounds),
    });
    await this.deps.store.save(state);
    await this.deps.transcript.append(state.id, renderChatGpt(round, maxRounds, turn));
    if (state.status === 'agreed')
      await this.deps.transcript.append(state.id, renderAgreed(turn.agreedSolution));
    if (state.status === 'escalated')
      await this.deps.transcript.append(state.id, renderEscalated(state));
    return this.result(state);
  }

  private async stall(state: DebateState, prompt: string, err: unknown): Promise<TurnResult> {
    const message = describeFailure(err);
    Object.assign(state, { status: 'stalled', pendingPrompt: prompt, lastError: message });
    await this.deps.store.save(state);
    await this.deps.transcript.append(
      state.id,
      renderNote(`ChatGPT turn failed; round not counted. ${message}`),
    );
    return this.result(state);
  }

  private result(state: DebateState): TurnResult {
    return {
      id: state.id,
      status: state.status,
      round: state.round,
      maxRounds: state.maxRounds,
      verdict: state.lastVerdict,
      chatgpt: state.lastChatGpt,
      agreedSolution: state.agreedSolution,
      transcriptPath: state.transcriptPath,
      error: state.lastError,
    };
  }
}
