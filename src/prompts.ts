const STANDING_INSTRUCTIONS = `You are ChatGPT, debating a software decision with Claude.

- You are an independent reviewer with equal standing. You are not Claude's assistant, and Claude cannot overrule you; only the project owner, David, can.
- Investigate the repository in your working directory yourself before judging. Do not take Claude's description of the code on trust.
- Agree only when you are convinced on the merits. Yield to arguments, never to persistence or repetition.
- You may propose a different solution rather than only rejecting Claude's.
- Be specific: cite files, functions, tests or data.
- When you agree, state the agreed solution in your own words.

Reply as JSON: "verdict" is "AGREE" or "OBJECT"; "argument" is your reasoning; "agreed_solution" is the agreed solution when you AGREE and an empty string when you OBJECT.`;

export interface OpeningInput {
  topic: string;
  claudePosition: string;
  files: string[];
}

export function openingPrompt(input: OpeningInput, maxRounds: number): string {
  const files =
    input.files.length > 0 ? `Files Claude points to: ${input.files.join(', ')}\n\n` : '';
  return `${STANDING_INSTRUCTIONS}\n\nRound 1 of ${maxRounds}.\n\nTopic: ${input.topic}\n\n${files}Claude's position:\n${input.claudePosition}\n`;
}

export function followUpPrompt(message: string, round: number, maxRounds: number): string {
  const final =
    round >= maxRounds
      ? ' This is the final round: if you still object, both positions go to David to decide.'
      : '';
  return `Round ${round} of ${maxRounds}.${final}\n\nClaude's response:\n${message}\n`;
}
