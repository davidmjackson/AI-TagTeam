import { describe, expect, it } from 'vitest';
import { followUpPrompt, openingPrompt } from '../src/prompts.js';

describe('openingPrompt', () => {
  const prompt = openingPrompt(
    {
      topic: 'Move auth to middleware',
      claudePosition: 'Yes, because X.',
      files: ['src/auth.ts', 'src/app.ts'],
    },
    3,
  );

  it('carries the standing instructions', () => {
    expect(prompt).toContain('independent reviewer with equal standing');
    expect(prompt).toContain('Investigate the repository');
    expect(prompt).toContain('never to persistence');
  });

  it('carries the topic, position, files and round budget', () => {
    expect(prompt).toContain('Move auth to middleware');
    expect(prompt).toContain('Yes, because X.');
    expect(prompt).toContain('src/auth.ts, src/app.ts');
    expect(prompt).toContain('Round 1 of 3');
  });

  it('omits the files line when none are given', () => {
    expect(openingPrompt({ topic: 't', claudePosition: 'p', files: [] }, 3)).not.toContain(
      'Files Claude points to',
    );
  });
});

describe('followUpPrompt', () => {
  it('names the round and carries the message', () => {
    const prompt = followUpPrompt('I concede point 1.', 2, 3);
    expect(prompt).toContain('Round 2 of 3');
    expect(prompt).toContain('I concede point 1.');
    expect(prompt).not.toContain('final round');
  });

  it('warns on the final round', () => {
    expect(followUpPrompt('m', 3, 3)).toContain('final round');
  });
});
