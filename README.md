# AI-TagTeam

An MCP server that lets Claude Code debate decisions with ChatGPT. ChatGPT runs
through the Codex CLI on your ChatGPT account, read-only. Only ChatGPT can mark a
debate agreed. If it still objects after the final round, the decision comes to
you.

## Install

1. `npm install -g @openai/codex`, then `codex login --device-auth`.
2. In this repo: `npm ci`, then `npm run build`.
3. Register it once for every project:
   `claude mcp add --scope user tagteam -- node /var/www/AI-TagTeam/dist/index.js`
4. Check it: `npm run smoke`.

## Use in a repo

- Paste `templates/CLAUDE-tagteam.md` into the repo's `CLAUDE.md`.
- Optionally copy `templates/tagteam.example.json` to `.tagteam.json` and edit
  the checkpoints.
- Ask Claude to "debate X with ChatGPT", or let the checkpoints trigger it.
- Watch live in a split terminal: `tail -f docs/debates/<id>.md`.
- Add `docs/debates/` to version control if you want the record kept; `.tagteam/` is git-ignored automatically.

## Tools

| Tool                   | When                                                 |
| ---------------------- | ---------------------------------------------------- |
| `debate_open`          | Start a debate                                       |
| `debate_reply`         | Claude's next message while the debate is open       |
| `debate_retry`         | Resend a ChatGPT turn that failed or was interrupted |
| `debate_record_ruling` | Your decision, after escalation only                 |
| `debate_status`        | Look up a debate                                     |
