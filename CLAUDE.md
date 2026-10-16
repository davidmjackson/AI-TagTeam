# AI-TagTeam

Done means: from Claude Code in any repo, a debate can be opened with ChatGPT via Codex,
runs up to 3 rounds, ends as agreed (only ChatGPT can make it so) or escalated to David,
and leaves a verbatim transcript in `docs/debates/`. Anything else is a new project.

**Where the weight is earned:** the referee's neutrality rules (`src/rules.ts`,
`src/verdict.ts`, `src/referee.ts`) and the read-only Codex invocation
(`src/codex/cli.ts`). Everything else gets ordinary care.

Design: `docs/superpowers/specs/2026-10-16-ai-tagteam-design.md`.

The MCP server runs from `dist/`: after any change to `src/`, run `npm run build`
before it takes effect in Claude Code.

## Code quality

This repo follows the shared standard. Before changing code, read
`/var/www/CodingStandards/CLAUDE.md`; thresholds are in
`/var/www/CodingStandards/core/THRESHOLDS.md`, scope rules in
`/var/www/CodingStandards/core/SCOPE-DISCIPLINE.md`. Do not copy them here.

The gate is `npm run verify`. Any deviation from a threshold is an ADR in
`docs/adr/`, never an inline disable.
