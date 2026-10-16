# AI-TagTeam

Done means: from Claude Code in any repo, a debate can be opened with ChatGPT via Codex,
runs up to 3 rounds, ends as agreed (only ChatGPT can make it so) or escalated to David,
and leaves a verbatim transcript in `docs/debates/`. Anything else is a new project.

**Where the weight is earned:** the referee's neutrality rules (`src/rules.ts`,
`src/verdict.ts`, `src/referee.ts`) and the read-only Codex invocation
(`src/codex/cli.ts`). Everything else gets ordinary care.

Design: `docs/superpowers/specs/2026-10-16-ai-tagteam-design.md`.

---

# Code Quality Standard

This file governs all code written in this repository, including code you write.
Read it before making changes.

This file and the thresholds govern *how* code is written. That one governs *how
much* gets written, which is the failure the gates cannot catch: Sprintboard
shipped good code, and roughly 30 percent of its artefacts were never asked for.
It holds the stop-condition rule, four questions to answer before designing
anything, and the signals that scope has already gone.

## Definition of Done

A change is not complete until **all** of the following pass:

- Formatter reports no changes needed
- All analyzers pass with zero warnings
- All tests pass
- Coverage is at or above threshold
- Duplication check is under threshold

**Do not report work as complete while any gate is red.** If a gate fails, fix it
and re-run. If you cannot fix it, stop and say so explicitly rather than
describing the work as finished.

## Thresholds

The numbers are defined once, in [`core/THRESHOLDS.md`](core/THRESHOLDS.md), and
enforced by the analyzers in each profile — not by review, and not restated
here (so they can never drift). Method length, cyclomatic and cognitive
complexity, parameter count, class/module length, duplication, and coverage all
have a named rule or check in every profile. Read `core/THRESHOLDS.md` for the
table and the per-language rule mapping.

They are enforced, not suggestions.

## Duplication

**Do not copy and paste code.** If the same logic appears a second time, extract
it. Three near-identical blocks with small variations is a sign of a missing
abstraction, not three separate concerns.

Before adding a new method, check whether an equivalent already exists in this
repo. Prefer extending or calling existing code over reimplementing it.

## Size and structure

- If a method exceeds the line limit, extract sub-steps into named private
  methods. Name them after **what** they do, not how.
- If a class exceeds the length limit, it is doing more than one job. Split it
  along responsibility lines.
- More than four parameters means the parameters want to be an object.
- Deep nesting is a complexity signal. Prefer early returns and guard clauses.

## Design guidance

Analyzers cannot check these. Apply them yourself and expect them at review.

- **Single responsibility.** One reason to change per class.
- **Dependency direction.** Depend on abstractions, not concrete implementations,
  at module boundaries.
- **Cohesion.** Methods in a class should use the class's own state. If a method
  ignores it entirely, it probably belongs somewhere else.
- **No God classes.** A class that everything depends on is a design failure, not
  a convenience.
- **Naming carries intent.** Reveal purpose. Avoid abbreviations and vague nouns
  like `Manager`, `Helper`, `Processor`, and `Data`.

## Error handling

- Do not swallow exceptions. Never write an empty catch block.
- Catch specific exception types, not the base type.
- Fail fast on invalid input. Validate at the boundary.

## Tests

- New behaviour needs new tests. Fixed bugs need a regression test.
- One assertion concept per test. Name tests for the behaviour under test.
- Do not weaken or delete a test to make a build pass. If a test is wrong, say so
  and explain why before changing it.

## Working practice

- **Small changes.** Keep diffs reviewable. Do not bundle refactoring with
  feature work in the same commit.
- **Read before writing.** Check existing patterns in this repo and follow them.
  Consistency beats personal preference.
- **Ask when ambiguous.** If requirements are unclear, ask rather than guessing
  and building the wrong thing.
- **No unrequested scope.** Do not add features, abstractions, or dependencies
  that were not asked for.
- **No suppressions without justification.** Do not add analyzer suppression
  comments to make a gate pass. If a rule genuinely does not apply, explain why
  in the comment and flag it in your summary.

## Overrides

Thresholds in this file come from the shared standards repository. **Do not
change them locally.** If a threshold genuinely does not fit this project, raise
it as an ADR rather than editing this file.
