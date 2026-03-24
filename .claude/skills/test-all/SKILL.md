---
name: test-all
description: "Parallel test orchestrator that runs all 9 IWSDK test suites concurrently via Task sub-agents and mcp-call.mjs. Handles build, example setup, dev servers, agent launch, polling, retries, and result aggregation. Use when running all tests, executing the full test suite, validating changes across all IWSDK packages, or performing CI-style parallel testing."
argument-hint: '[--skip <test-name>] [--only <test-name>]'
---

# Test All — Parallel Orchestrator

Runs all 9 IWSDK test suites simultaneously. The orchestrator handles the full lifecycle: build, example prep, dev servers, sub-agent launch, polling, retries, cleanup, and aggregate reporting.

Each test gets its own example directory and dev server. Sub-agents read the skill files and execute tests via `mcp-call.mjs` WebSocket CLI.

---

## Test Map

| Agent             | Example Dir               | Suites | Skill File                 |
| ----------------- | ------------------------- | ------ | -------------------------- |
| test-interactions | examples/poke             | 12     | test-interactions/SKILL.md |
| test-ecs-core     | examples/poke-ecs         | 8      | test-ecs-core/SKILL.md     |
| test-environment  | examples/poke-environment | 6      | test-environment/SKILL.md  |
| test-level        | examples/poke-level       | 5      | test-level/SKILL.md        |
| test-ui           | examples/poke-ui          | 5      | test-ui/SKILL.md           |
| test-audio        | examples/audio            | 6      | test-audio/SKILL.md        |
| test-grab         | examples/grab             | 5      | test-grab/SKILL.md         |
| test-locomotion   | examples/locomotion       | 6      | test-locomotion/SKILL.md   |
| test-physics      | examples/physics          | 5      | test-physics/SKILL.md      |

Ports are **not** pre-assigned. Each dev server picks its own port dynamically. The orchestrator discovers each port from the server's log output.

---

## Phase 1: Prerequisites & Build

```bash
node -v
```

```bash
pnpm -v
```

Verify node >= 20.19.0 and pnpm is available. Stop on failure.

```bash
pnpm install
```

```bash
cd packages/vite-plugin-dev && npx playwright install chromium && cd ../..
```

```bash
pnpm build:tgz
```

All must succeed. **Stop on failure.** Note: `npx playwright` must run from `packages/vite-plugin-dev` where playwright is a dependency.

---

## Phase 2: Prepare Examples

### Clone poke for tests that share it

5 tests use the poke example. Clone it into separate directories so each gets its own dev server:

```bash
node scripts/test-prep.mjs clone
```

### Fresh install all 9 examples in parallel

```bash
node scripts/test-prep.mjs install
```

---

## Phase 3: Start 9 Dev Servers

Start all dev servers, wait for them to be ready, and discover their ports. This single command handles everything — starting servers, polling for `.mcp.json` files, and outputting the port map:

```bash
node scripts/test-servers.mjs start
```

The output is JSON with the port map: `{"poke": 8084, "poke-ecs": 8082, ...}`. Parse this to get each example's port for Phase 4.

If any server fails to start within 60 seconds, the script reports which ones are missing and exits with code 1. Check `/tmp/iwsdk-dev-<name>.log` for errors.

To re-check ports later without restarting:

```bash
node scripts/test-servers.mjs ports
```

---

## Phase 4: Launch 9 Sub-Agents

For each test, launch a Task sub-agent with `subagent_type: "Bash"`, `mode: "bypassPermissions"`, and `run_in_background: true`.

### Sub-agent prompt template

Each sub-agent gets this prompt (with `<SKILL_FILE>`, `<PORT>`, and `<ROOT>` substituted using the ports discovered from `.mcp.json` in Phase 3):

```
Read the file at <ROOT>/.claude/skills/<SKILL_FILE> and execute the test instructions
starting from Step 3 (Verify Connectivity). Steps 1 and 2 have already been completed —
the dev server is running on port <PORT>.

Use port <PORT> wherever the instructions say <PORT>. The MCPCALL shorthand expands to:
node <ROOT>/scripts/mcp-call.mjs --port <PORT>

Execute all test suites (Steps 3-4), then do Step 5 (cleanup and results summary).
Do NOT kill the dev server in cleanup — the parent agent will handle that.
```

### Launch all 9 agents

Launch all 9 Task agents in a **single message** with multiple Task tool calls. This starts them concurrently.

Save each agent's `task_id` and `output_file` from the tool result. Track them:

```
agents = {
  "test-interactions": { task_id: "...", output_file: "...", port: <from .mcp.json>, status: "running" },
  "test-ecs-core":     { task_id: "...", output_file: "...", port: <from .mcp.json>, status: "running" },
  ...
}
```

---

## Phase 5: Wait for Agents to Complete

After launching all 9 agents, simply wait. The system automatically delivers a completion notification when each agent finishes. **Do NOT poll, do NOT run bash commands to check output files.** Just wait for the notifications.

As each agent completes, note its result (PASS/FAIL and suite counts) from the notification. When all 9 have reported, proceed to Phase 7.

**Hard timeout: 20 minutes total** from Phase 4 start. If any agent hasn't completed by then, use `Read` on its `output_file` to check what happened, then mark it as TIMEOUT and proceed to Phase 7.

---

## Phase 6: Retry Failed Agents

If any agent fails due to a transient error (not a test assertion failure):

1. Use `Task(resume: <task_id>)` to continue the agent with its full context
2. Wait for its completion notification
3. If it fails again, mark it FAIL and move on

### Retry limits

- Max 1 retry per agent
- Only retry transient failures (connection refused, timeout) — not test assertion failures

**IMPORTANT**: Do NOT use improvised bash commands (kill, lsof, etc.) for retries. Use `node scripts/test-servers.mjs stop` and `node scripts/test-servers.mjs start` if a server needs restarting. All bash commands in this skill must be one of the pre-approved `node scripts/...` commands or the Phase 1 build commands.

---

## Phase 7: Results & Cleanup

### Kill all dev servers

```bash
node scripts/test-servers.mjs stop
```

### Delete poke clones

```bash
node scripts/test-prep.mjs cleanup
```

### Aggregate Results

Collect each agent's summary table from its output file. Print a grand summary:

```
========================================
  IWSDK Test Suite — Full Results
========================================

| Test              | Suites | Result  |
|-------------------|--------|---------|
| test-interactions | 12/12  | PASS    |
| test-ecs-core     |  8/8   | PASS    |
| test-environment  |  6/6   | PASS    |
| test-level        |  5/5   | PASS    |
| test-ui           |  5/6   | PASS    |
| test-audio        |  6/6   | PASS    |
| test-grab         |  5/5   | PASS    |
| test-locomotion   |  6/6   | PASS    |
| test-physics      |  5/5   | PASS    |
|-------------------|--------|---------|
| TOTAL             | 58/59  | 9/9 PASS|

========================================
```

If any test failed, include the failure details from that agent's output.

---

## Key Design Decisions

### Orchestrator manages dev servers, sub-agents run tests

Sub-agents (Task tool) cannot run background processes. The orchestrator starts all 9 dev servers, discovers their dynamically-assigned ports from the log output, then launches sub-agents that only execute the test steps. Each sub-agent reads its skill file and starts from Step 3 (Verify Connectivity).

### Dynamic port discovery via `.mcp.json`

Ports are NOT pre-assigned. Each dev server is started with `npm run dev` and Vite picks an available port automatically. The `iwsdkDev` vite plugin writes the actual port into each example's `.mcp.json` file. The orchestrator reads these files to discover ports — this is machine-generated JSON, more robust than parsing log output.

### Sub-agents read skill files directly

Each sub-agent reads its SKILL.md at runtime. No extraction or text munging needed — the sub-agent is told to skip Steps 1-2 (already done) and start from Step 3. The port is passed explicitly in the prompt.

### TaskOutput vs file-based polling

Background Task agents write output to a file. Use `Read` tool on the output_file to check progress. This is more reliable than parsing process stdout.

### Boolean values must be JSON booleans

When setting boolean fields via `ecs_set_component`, the `value` must be a JSON boolean (`true`), not a string (`"true"`). Strings silently fail to coerce.

---

## Troubleshooting

### Agent finishes but no summary table

The sub-agent may have hit its turn limit. Check the end of its output for truncation. Relaunch with the same prompt.

### Port already in use

Run `lsof -i :<PORT>` to find the process. Kill it before relaunching.

### fresh:install fails

Check that `pnpm build:tgz` succeeded and the tarballs exist in the package directories.

### All agents stuck at "Verify Connectivity"

The dev servers may not have started. Check `/tmp/iwsdk-dev-*.log` for errors.

### Clone directory already exists

The rsync command will overwrite existing files. If you need a clean slate, delete the clone directories first.

### Sub-agent can't start dev server

This is expected — sub-agents cannot run background processes. The orchestrator must start all dev servers before launching sub-agents.
