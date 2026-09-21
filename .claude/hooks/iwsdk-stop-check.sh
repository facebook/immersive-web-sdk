#!/bin/bash
# Stop hook for IWSDK development
# - Per-turn detection: only inspects tool uses since the last real user message.
# - Code-relevant filter: ignores edits to docs, shell scripts, .claude/ configs, etc.
# - On first stop with relevant edits: nudge the agent through the checklist.
# - On second stop (after agent responds): let it through.

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')

# If we already intervened once, let it stop
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Default: silent unless we positively detect a code-relevant edit in this turn
SHOULD_FIRE=false

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Per-turn boundary: line number of the last real user message.
  # Tool results are also "type":"user" but always carry a "toolUseResult" field;
  # real user prompts do not. Single-pass awk.
  LAST_USER_LINE=$(awk '/"type":"user"/ && !/"toolUseResult"/{n=NR} END{print n+0}' "$TRANSCRIPT_PATH")

  if [ "$LAST_USER_LINE" -gt 0 ]; then
    EDITED_FILES=$(tail -n +"$LAST_USER_LINE" "$TRANSCRIPT_PATH" \
      | jq -r 'select(.type == "assistant")
               | (.message.content // [])[]?
               | select(.type == "tool_use"
                        and (.name == "Edit" or .name == "Write"
                             or .name == "MultiEdit" or .name == "NotebookEdit"))
               | .input.file_path // .input.notebook_path // empty' 2>/dev/null)

    # Drop .claude/ paths, then keep only code-relevant extensions
    RELEVANT=$(printf '%s\n' "$EDITED_FILES" \
      | grep -v '^$' \
      | grep -v '/\.claude/' \
      | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|css|scss|sass|html|htm|json)$' \
      || true)

    if [ -n "$RELEVANT" ]; then
      SHOULD_FIRE=true
    fi
  fi
fi

if [ "$SHOULD_FIRE" != "true" ]; then
  exit 0
fi

# First stop attempt — send it back with checklist
cat >&2 <<'CHECKLIST'
Before finishing, please go through this checklist:

## 1. Runtime Verification
Did you verify your changes work at runtime? If you modified any packages or examples,
use the direct `iwsdk` CLI against a running dev server:

  npx @iwsdk/cli browser screenshot
  npx @iwsdk/cli browser logs
  npx @iwsdk/cli ecs systems
  npx @iwsdk/cli ecs components

If a dev server is running, take a screenshot and check console logs at minimum.
If no dev server is running and your changes are code-only (not runtime), that's OK — just confirm.

## 2. Code Quality
Run these and fix any issues:
  - `pnpm format` (Prettier formatting)
  - `pnpm lint` (ESLint)
  - `pnpm build` (TypeScript compilation / type checking)

## 3. MCP Tool Feedback
If during this session you used the direct `iwsdk` CLI / MCP tools (or wished you could) and have
any feedback about the MCP tools — missing tools, confusing APIs, tools that didn't work
as expected, or tools you wish existed — please append your feedback to:

  .claude/mcp-feedback.jsonl

Use this format (one JSON object per line):
  {"timestamp": "<ISO 8601>", "session": "<brief task description>", "tool": "<tool_name or 'general'>", "type": "<missing|bug|improvement|wish>", "feedback": "<your feedback>"}

If you have no MCP feedback, skip this step.

## 4. Confirm
After completing the above (or confirming they're not applicable), you may finish.
CHECKLIST

exit 2
