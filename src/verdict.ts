import type { ChatGptTurn } from './types.js';

function invalid(raw: string, reason: string): ChatGptTurn {
  return {
    verdict: 'OBJECT',
    argument: `[referee] Reply rejected (${reason}); recorded as OBJECT.`,
    agreedSolution: '',
    valid: false,
    raw,
  };
}

function readObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
    return isObject ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseReply(raw: string): ChatGptTurn {
  const json = readObject(raw);
  if (json === null) return invalid(raw, 'not a JSON object');
  const { verdict, argument, agreed_solution: solution } = json;
  if (verdict !== 'AGREE' && verdict !== 'OBJECT')
    return invalid(raw, 'verdict missing or unknown');
  if (typeof argument !== 'string' || argument.trim() === '')
    return invalid(raw, 'argument missing');
  const agreedSolution = typeof solution === 'string' ? solution : '';
  if (verdict === 'AGREE' && agreedSolution.trim() === '') {
    return invalid(raw, 'AGREE without agreed_solution');
  }
  return { verdict, argument, agreedSolution, valid: true, raw };
}

export function spoken(turn: ChatGptTurn): string {
  return turn.valid ? turn.argument : `${turn.argument}\n\nRaw reply:\n${turn.raw}`;
}
