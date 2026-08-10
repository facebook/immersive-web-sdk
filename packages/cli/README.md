# `@iwsdk/cli`

Runtime-first CLI for Immersive Web SDK starter apps.

This package is the public `iwsdk` executable used by starters and AI tooling.
It owns:

- dev server lifecycle commands
- adapter sync and status
- reference status and recovery warmup commands (fresh installed scaffolds warm
  the shared cache automatically)
- runtime-resolved MCP stdio access
- direct runtime control commands

## Running without a local install

Starter apps install this package and should run `npx iwsdk ...` from the app
directory. Elsewhere, use the scoped package explicitly so npm does not resolve
the unrelated `iwsdk` placeholder package:

```bash
npm exec --package @iwsdk/cli -- iwsdk --help
```

## Coding-agent adapters

`iwsdk adapter sync` preserves unrelated settings while configuring the native
repository surfaces for Claude Code, Cursor, GitHub Copilot, Codex, and
OpenCode. Use `--tools claude,codex` to limit the selection.

Generated starters give Claude Code its native `CLAUDE.md`, scoped rules, and
skill tree. Codex, Cursor, Copilot, and OpenCode share byte-identical Agent
Skills under `.agents/skills`; Cursor and Copilot receive native scoped rules,
while Codex and OpenCode receive nested `AGENTS.md` files. Where a harness
supports repository-scoped permissions, sync preapproves only IWSDK-managed MCP
namespaces and skill loading. Copilot tool approval remains an explicit VS Code
action because it has no supported repository config for that choice.

- `iwsdk adapter status` reports MCP, instruction, and permission state.
- `iwsdk adapter prune` removes managed MCP/permission entries and preserves
  editable instruction files.
- `iwsdk adapter prompt` prints exact setup instructions for another harness.
