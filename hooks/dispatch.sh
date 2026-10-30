#!/usr/bin/env bash
#
# Single quality-gate dispatcher for Claude Code hooks and CI.
#
#   dispatch.sh post   # PostToolUse: format + lint the one edited file
#   dispatch.sh stop   # Stop or CI: run the full gate over the whole repo
#   dispatch.sh budget # Stop: the CLAUDE.md byte budget ALONE, nothing else
#
# post mode reads the hook JSON on stdin (or takes a path as $2 for testing)
# and branches on the file extension:
#   .cs                    -> dotnet format + analyzers (build)
#   .ts .tsx .js .jsx      -> Prettier + ESLint
#   .py                    -> Ruff format + Ruff check
#
# Exit 2 is the only code whose stderr Claude Code passes to the agent, so every
# failure uses it. A required tool that is missing is a failure, never a skip.
# One dispatcher, one settings entry - never one hook per language.
set -uo pipefail

MODE="${1:-post}"
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# The enforcement points for T5 and T7 in Python, where no analyzer rule carries
# them. core/THRESHOLDS.md holds the definitions.
MODULE_MAX_LINES=400
COVERAGE_MIN=80
OUTPUT_TAIL_LINES=40

GATE_FAILED=0

[ -d "$ROOT/.venv/bin" ] && PATH="$ROOT/.venv/bin:$PATH"

log()  { printf '[quality] %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

require() {
  have "$1" && return 0
  log "$1 is required but not on PATH."
  GATE_FAILED=1
  return 1
}

# check <label> <command...>: on failure, show the tool's output and mark red.
check() {
  local label="$1" output
  shift
  output="$("$@" 2>&1)" && return 0
  log "$label failed:"
  printf '%s\n' "$output" | tail -n "$OUTPUT_TAIL_LINES" >&2
  GATE_FAILED=1
  return 1
}

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
  require dotnet || return 1
  projdir="$(find_up "$(dirname "$file")" '*.csproj')" || { log "no .csproj above $file"; return 0; }
  local proj rel
  proj="$(basename "$(compgen -G "$projdir/"'*.csproj' | head -1)")"
  rel="$(realpath --relative-to="$projdir" "$file")"
  # Relative paths only: a leading-slash absolute path is read as an MSBuild switch.
  ( cd "$projdir" && dotnet format "$proj" --include "$rel" &&
    dotnet build "$proj" -clp:ErrorsOnly )
}

lint_js() {
  local file="$1" dir; dir="$(dirname "$file")"
  require npx || return 1
  npx --no -- prettier --write "$file" && ( cd "$dir" && npx --no -- eslint "$file" )
}

lint_python() {
  local file="$1"
  require ruff || return 1
  ruff format "$file" && ruff check "$file"
}

edited_file() {
  require python3 || return 1
  python3 -c 'import sys,json
print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))'
}

lint_file() {
  local file="$1"
  case "$file" in
    *.cs)                  lint_csharp "$file" ;;
    *.ts|*.tsx|*.js|*.jsx) lint_js "$file" ;;
    *.py)                  lint_python "$file" ;;
    *) return 0 ;;
  esac
}

run_post() {
  local file="${1:-}" output
  if [ -z "$file" ]; then
    file="$(edited_file)" || { log "cannot read the hook input."; exit 2; }
  fi
  [ -n "$file" ] && [ -f "$file" ] || exit 0
  file="$(realpath "$file")" || { log "cannot resolve $file."; exit 2; }
  output="$(lint_file "$file" 2>&1)" && exit 0
  log "$file failed the gate:"
  printf '%s\n' "$output" | tail -n "$OUTPUT_TAIL_LINES" >&2
  exit 2
}

# ---- CLAUDE.md byte budget (stop mode) ------------------------------------

# The ceiling from core/MEMORY-BUDGET.md, which holds the reasoning.
CLAUDE_MD_CEILING=12288

# WARNS, deliberately. These are working targets, not platform limits, so a red
# gate would block real work over a self-imposed number.
check_claude_md_budget() {
  [ -f CLAUDE.md ] || return 0
  local bytes; bytes="$(wc -c < CLAUDE.md | tr -d ' ')"
  [ "$bytes" -le "$CLAUDE_MD_CEILING" ] && return 0
  log "CLAUDE.md is ${bytes} B, over the ${CLAUDE_MD_CEILING} B ceiling."
  log "  Every session pays this in full, before MEMORY.md loads."
  log "  Prune it, or move the reasoning to docs/adr/. See core/MEMORY-BUDGET.md."
}

# ---- full gate (stop mode) -------------------------------------------------

has_csharp() {
  [ -n "$(find . \( -name '*.csproj' -o -name '*.sln' \) -not -path '*/.*' \
    -not -path '*/node_modules/*' -print -quit)" ]
}

gate_csharp() {
  log "C#: build (analyzers) + test"
  require dotnet || return 0
  check "C# build/analyzers" dotnet build -clp:ErrorsOnly
  check "C# tests/coverage" dotnet test --no-build
}

# The repo's own verify script is the whole JS/TS gate, so CI and this hook
# cannot disagree. It owns tests, coverage and duplication.
gate_js() {
  log "JS/TS: npm run verify"
  if ! grep -Eq '"verify"[[:space:]]*:' package.json; then
    log "package.json has no verify script. See skill/scaffold-standards/SKILL.md."
    GATE_FAILED=1
    return 0
  fi
  require npm && check "npm run verify" npm run --silent verify
}

python_modules() {
  find . -name '*.py' -not -path '*/.*' -not -path '*/node_modules/*' \
    -not -path '*/venv/*' -not -path '*/__pycache__/*'
}

check_module_length() {
  local module
  while IFS= read -r module; do
    [ "$(wc -l < "$module")" -le "$MODULE_MAX_LINES" ] && continue
    log "$module is over the $MODULE_MAX_LINES line limit."
    GATE_FAILED=1
  done < <(python_modules)
}

# pytest when installed; otherwise unittest, which errors on a pytest-only suite
# because it discovers no tests.
check_python_tests() {
  local runner=(-m unittest discover -s tests)
  require coverage || return 0
  have pytest && runner=(-m pytest)
  check "Python tests" coverage run "${runner[@]}" &&
    check "Python coverage" coverage report --fail-under="$COVERAGE_MIN"
}

gate_python() {
  log "Python: ruff + tests + coverage + module length"
  if require ruff; then
    check "Ruff check" ruff check .
    check "Ruff format" ruff format --check .
  fi
  check_python_tests
  check_module_length
}

gate_duplication() {
  log "Duplication: jscpd"
  require npx && check "Duplication" npx --yes jscpd@4.0.5 . --threshold 3 --gitignore \
    --ignore '**/.venv/**,**/venv/**,**/node_modules/**'
}

# True when Claude Code is re-running Stop after this gate already blocked once.
is_stop_retry() {
  [ -t 0 ] && return 1
  timeout 1 cat | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'
}

# Claude Code treats exit 2 as non-blocking when stdout is empty and stderr mentions
# a missing file, so a red gate always writes to both. Exit 2 rather than JSON
# because the same command must fail CI.
block_stop() {
  log "$1"
  printf '[quality] %s\n' "$1"
  exit 2
}

run_full_gate() {
  local retry=0
  is_stop_retry && retry=1
  cd "$ROOT" || block_stop "cannot enter $ROOT"

  check_claude_md_budget
  has_csharp && gate_csharp
  [ -f package.json ] && gate_js
  { [ -f ruff.toml ] || [ -f pyproject.toml ]; } && gate_python
  [ -f package.json ] || gate_duplication

  if [ "$GATE_FAILED" -eq 0 ]; then
    log "Full gate green."
    exit 0
  fi
  # Exit 2 on a retry would block Stop again, and a gate the agent cannot turn
  # green would then loop forever. Exit 1 ends the turn with the failure shown.
  [ "$retry" -eq 1 ] && { log "FULL GATE RED."; exit 1; }
  block_stop "FULL GATE RED - fix the above before proceeding."
}

case "$MODE" in
  stop) run_full_gate ;;
  # A repo whose gate is its own `npm run verify` wires THIS, not `stop`, when
  # that gate is too slow for every Stop. Warns only; never sets a failing exit.
  budget) check_claude_md_budget ;;
  post) shift || true; run_post "${1:-}" ;;
  *) log "unknown mode: $MODE"; exit 2 ;;
esac
