---
outline: [2, 4]
---

# Getting Started with AI

This guide gets you from zero to a working AI-assisted dev session in about 5 minutes.

## Prerequisites

- An IWSDK project (see [Chapter 1: Project Setup](/guides/01-project-setup) if you don't have one)
- An AI tool that supports MCP: [Claude Code](https://claude.ai), [Cursor](https://cursor.sh), [GitHub Copilot](https://github.com/features/copilot), or [Codex](https://openai.com/codex)

## Enable AI

Add `ai: {}` to your `iwsdkDev()` plugin config in `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: {
        device: 'metaQuest3',
      },
      ai: {}, // enables the visible collaborate workspace by default
      verbose: true, // shows startup details (optional, helpful for first run)
    }),
  ],
});
```

That's it. No extra packages, no separate server — everything is handled by the plugin/runtime stack, and starter projects already ship the `iwsdk` CLI through `@iwsdk/cli`.

## Start the Dev Server

```bash
npm run dev
```

::: tip
Starter `npm run dev` routes through `iwsdk dev up --open --foreground`, which lets the CLI manage the dev-server lifecycle, MCP adapter sync, and browser opening. Vite still chooses the real port, so treat the reported runtime URL as the source of truth. The internal runtime script is `dev:runtime`; use the CLI path as the supported entrypoint.
:::

When the server starts, several things happen automatically:

1. A visible Playwright workspace opens at the clean application URL
2. Runtime and editor views share that one managed browser session
3. Canonical project-local MCP configs are synchronized
4. The MCP WebSocket endpoint is registered at `/__iwer_mcp`

If you need the resolved runtime URL, want to inspect adapter state explicitly, or need to confirm that the managed browser bridge is actually ready to accept commands, run `npx iwsdk dev status`. The `state.browserCommandReady` field and `state.session.browser.commandReady` value are the source of truth for browser readiness.

::: tip MCP config files are refreshed, not deleted
The managed config files (`.mcp.json`, `.cursor/mcp.json`, etc.) are intentionally left on disk and refreshed on the next run. `npm run dev` and `iwsdk adapter sync` both write the same canonical workspace-based entries.
:::

::: tip Optional reference warmup
If your project installs `@iwsdk/reference`, run `npx iwsdk reference warmup` once after install. That step prepares the pinned reference corpus under your project's `.iwsdk/reference` state, populates the shared corpus store, and eagerly downloads the pinned model into the shared model cache. Set `IWSDK_REFERENCE_ASSETS_BASE_URL` too when you are hosting the corpus payload yourself instead of relying on the published `@iwsdk/reference-assets` package. SDK bundles intentionally exclude the corpus payload, so bundle/internal deployments must host it separately before warmup. The pinned model file URLs themselves are baked into the SDK, so warmup still requires access to those public URLs unless the shared cache has already been pre-warmed.
:::

## Connect Your AI Tool

### Claude Code

Claude Code automatically discovers the `.mcp.json` file in your project root. Just open Claude Code in your project directory and it will discover the MCP server entry.

In environments that lazily load MCP tool schemas, discovery is not the same as runtime readiness:

1. Load the `mcp__iwsdk-runtime__*` tool schemas with your editor's tool-search/discovery step if needed.
2. Call `xr_get_session_status` as the first runtime check once the tool is available.
3. If MCP tools are still deferred, fall back to the CLI (`npx iwsdk xr status`, `npx iwsdk browser screenshot`, etc.) until the schemas are hydrated.

### Cursor

Cursor reads from `.cursor/mcp.json`.

```bash
npx iwsdk adapter sync --tools cursor
```

### GitHub Copilot

Copilot reads from `.vscode/mcp.json`:

```bash
npx iwsdk adapter sync --tools copilot
```

### Codex

Codex reads from `.codex/config.toml`:

```bash
npx iwsdk adapter sync --tools codex
```

You can select multiple adapters if you use more than one tool:

```bash
npx iwsdk adapter sync --tools claude,cursor
```

::: tip Adapter default
`npx iwsdk adapter sync` writes every supported adapter. Use `--tools` only when you want to limit the generated configs.
:::

## First Interaction

Once your AI tool is connected, try these prompts:

**Take a screenshot:**

> "Take a screenshot of the current scene."

The agent will call `browser_screenshot` and show you what the managed browser sees.

**Accept the XR session:**

> "Accept the XR session so we can see the immersive experience."

The agent will call `xr_accept_session`, which is equivalent to clicking the "Enter XR" button.

**Move a controller:**

> "Position the right controller at (0.3, 1.2, -0.5) and take a screenshot."

The agent will call `xr_set_transform` to move the controller, then `browser_screenshot` to verify.

## Customize the Screenshot Size

By default, screenshots are 800x800 pixels. You can adjust this to control token usage:

```typescript
ai: {
  mode: 'agent',
  screenshotSize: { width: 500, height: 500 },  // smaller = fewer tokens
},
```

## What's Next

- [Modes](./modes) — Learn about collaborate and agent modes
- [MCP Tools Reference](./mcp-tools) — See all 39 tools available to the agent
- [Workflows](./workflows) — Common agent workflow patterns
