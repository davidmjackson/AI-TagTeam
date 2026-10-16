export type CodexFailureKind = 'auth' | 'timeout' | 'limit' | 'failed';

export class CodexError extends Error {
  constructor(
    message: string,
    readonly kind: CodexFailureKind,
  ) {
    super(message);
  }
}

export const AUTH_HINT = 'Sign in again: run `codex login --device-auth` in a terminal.';

export function classify(detail: string): CodexFailureKind {
  if (/invalid_refresh_token|unauthorized|\b401\b/i.test(detail)) return 'auth';
  if (/usage limit|rate limit|\b429\b/i.test(detail)) return 'limit';
  return 'failed';
}
