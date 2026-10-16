#!/usr/bin/env bash
#
# Single quality-gate dispatcher for Claude Code hooks.
#
#   dispatch.sh post   # PostToolUse: format + lint the one edited file
#   dispatch.sh stop   # Stop: run the full gate over the whole repo
#   dispatch.sh budget # Stop: the CLAUDE.md byte budget ALONE, nothing else
#
# post mode reads the hook JSON on stdin (or takes a path as $2 for testing)
# and branches on the file extension:
#   .cs                    -> dotnet format + analyzers (build)
#   .ts .tsx .js .jsx      -> Prettier + ESLint
#   .py                    -> Ruff format + Ruff check
#
# It exits non-zero on any violation so the feedback reaches the agent.
# One dispatcher, one settings entry - never one hook per language.
set -uo pipefail

MODE="${1:-post}"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

log()  { printf '[quality] %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

# Walk up from $1 looking for the first directory that contains a match of $2.
find_up() {
  local dir="$1" pattern="$2"
  while [ "$dir" != "/" ] && [ -n "$dir" ]; do
    # shellcheck disable=SC2086
    if compgen -G "$dir/"$pattern >/dev/null 2>&1; then echo "$dir"; return 0; fi
    dir="$(dirname "$dir")"
  done
  return 1
}

# ---- per-file linters (post mode) -----------------------------------------

lint_csharp() {
  local file="$1" projdir
  have dotnet || { log "dotnet not found; skipping $file"; return 0; }
  projdir="$(find_up "$(dirname "$file")" '*.csproj')" || { log "no .csproj above $file"; return 0; }
  local proj rel
  proj="$(basename "$(compgen -G "$projdir/"'*.csproj' | head -1)")"
  rel="$(realpath --relative-to="$projdir" "$file")"
  # Relative paths only: a leading-slash absolute path is read as an MSBuild switch.
  ( cd "$projdir" && dotnet format "$proj" --include "$rel" >/dev/null 2>&1 || true
    dotnet build "$proj" -clp:ErrorsOnly >/dev/null 2>&1 )
}

lint_js() {
  local file="$1" dir; dir="$(dirname "$file")"
  have npx || { log "npx not found; skipping $file"; return 0; }
  npx prettier --write "$file" >/dev/null 2>&1 || true
  ( cd "$dir" && npx eslint "$file" )
}

lint_python() {
  local file="$1"
  have ruff || { log "ruff not found; skipping $file"; return 0; }
  ruff format "$file" >/dev/null 2>&1 || true
  ruff check "$file"
}

run_post() {
  local file="${1:-}"
  if [ -z "$file" ]; then
    file="$(python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
except Exception:
    d={}
print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null)"
  fi
  [ -n "$file" ] && [ -f "$file" ] || exit 0
  case "$file" in
    *.cs)                 lint_csharp "$file" ;;
    *.ts|*.tsx|*.js|*.jsx) lint_js "$file" ;;
    *.py)                 lint_python "$file" ;;
    *) exit 0 ;;
  esac
}

# ---- CLAUDE.md byte budget (stop mode) ------------------------------------

# The ceiling from core/MEMORY-BUDGET.md, which holds the reasoning. The number
# is literal HERE because this is the enforcement point, and a gate cannot
# compare against prose (STANDARD.md principle 2). Same shape as T5 for Python:
# documented in one place, checked in one place.
CLAUDE_MD_CEILING=12288

# WARNS. Deliberately does not set failed=1.
#
# These are working targets, not platform limits - Claude Code has no hard cap on
# CLAUDE.md - so a red gate here would block real work over a self-imposed number,
# which is the two-fighting-constraints mistake MEMORY-BUDGET.md already records.
# The gap it closes is a different one: measured 2026-08-25, sprintboard's
# CLAUDE.md had reached 75,118 B (6.3x this ceiling) with NOTHING printing at any
# point, because only MEMORY.md warns in session. A budget with no trigger is a
# preference. This is the trigger.
#
# Flip to failed=1 if the warning stops being read.
check_claude_md_budget() {
  [ -f CLAUDE.md ] || return 0
  local bytes; bytes="$(wc -c < CLAUDE.md | tr -d ' ')"
  [ "$bytes" -le "$CLAUDE_MD_CEILING" ] && return 0
  log "CLAUDE.md is ${bytes} B, over the ${CLAUDE_MD_CEILING} B ceiling."
  log "  Every session pays this in full, before MEMORY.md loads."
  log "  Prune it, or move the reasoning to docs/adr/. See core/MEMORY-BUDGET.md."
}

# ---- full gate (stop mode) -------------------------------------------------

run_full_gate() {
  local failed=0
  cd "$ROOT" || exit 0

  check_claude_md_budget

  if compgen -G "**/*.csproj" >/dev/null 2>&1 || compgen -G "*.sln" >/dev/null 2>&1; then
    log "C#: build (analyzers) + test"
    dotnet build -clp:ErrorsOnly >/dev/null 2>&1 || { log "C# build/analyzers failed"; failed=1; }
    dotnet test  --no-build >/dev/null 2>&1 || { log "C# tests/coverage failed"; failed=1; }
  fi

  if [ -f package.json ]; then
    log "JS/TS: eslint + prettier + tests"
    have npx && { npx eslint . >/dev/null 2>&1 || { log "ESLint failed"; failed=1; }; }
    have npx && { npx prettier --check . >/dev/null 2>&1 || { log "Prettier failed"; failed=1; }; }
    grep -q '"test"' package.json && { npm test --silent >/dev/null 2>&1 || { log "JS tests failed"; failed=1; }; }
  fi

  if [ -f ruff.toml ] || [ -f pyproject.toml ]; then
    log "Python: ruff + coverage"
    have ruff && { ruff check . >/dev/null 2>&1 || { log "Ruff check failed"; failed=1; }; }
    have ruff && { ruff format --check . >/dev/null 2>&1 || { log "Ruff format failed"; failed=1; }; }
  fi

  log "Duplication: jscpd"
  have npx && { npx --yes jscpd@4.0.5 . --threshold 3 --gitignore >/dev/null 2>&1 || { log "Duplication over 3%"; failed=1; }; }

  if [ "$failed" -ne 0 ]; then
    log "FULL GATE RED - fix the above before proceeding."
    exit 2
  fi
  log "Full gate green."
}

case "$MODE" in
  stop) run_full_gate ;;
  # A repo whose gate is its own `npm run verify` wires THIS, not `stop`: the full
  # gate would re-impose tooling that repo has deliberately removed, and would run
  # its live suites on every Stop. Warns only; never sets a failing exit.
  budget) check_claude_md_budget ;;
  post) shift || true; run_post "${1:-}" ;;
  *) log "unknown mode: $MODE"; exit 0 ;;
esac
