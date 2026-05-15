#!/usr/bin/env bash
# MCPCALL helper — resolves MCP-style tool names through `npx iwsdk mcp inspect`
# and executes the matching CLI command directly.
#
# Usage:
#   MCPCALL --tool <TOOL_NAME> [--args '<JSON_ARGS>'] [--timeout <MS>]
#
# Must be run from within an iwsdk example workspace (or child directory).

MCPCALL() {
  local tool=""
  local args=""
  local timeout=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --tool) tool="$2"; shift 2 ;;
      --args) args="$2"; shift 2 ;;
      --timeout) timeout="$2"; shift 2 ;;
      *) echo "Unknown argument: $1" >&2; return 1 ;;
    esac
  done

  node --input-type=module - "$tool" "${args:-}" "${timeout:-}" <<'EOF'
import { spawnSync } from 'node:child_process';

const [toolName, rawArgs, timeout] = process.argv.slice(2);
const inspect = spawnSync('npx', ['iwsdk', 'mcp', 'inspect'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (inspect.status !== 0) {
  if (inspect.stderr) process.stderr.write(inspect.stderr);
  process.exit(inspect.status ?? 1);
}

const parsed = JSON.parse(inspect.stdout);
const tool = parsed.data.tools.find((entry) => entry.mcpName === toolName);
if (!tool) {
  console.error(`Unknown tool: ${toolName}`);
  process.exit(1);
}

const cliArgs = ['iwsdk', ...tool.cliPath.split(' ')];
if (rawArgs) cliArgs.push('--input-json', rawArgs);
if (timeout) cliArgs.push('--timeout', timeout);

const result = spawnSync('npx', cliArgs, {
  cwd: process.cwd(),
  encoding: 'utf8',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
EOF
}
