---
outline: [2, 4]
---

# Modes

IWSDK's AI integration supports two modes. Both use the same managed Playwright
workspace, runtime preview, native scene editor, and MCP connection. The mode
only changes whether that workspace is visible and how screenshots are sized.

## Collaborate Mode

**Config:** `ai: {}` or `ai: { mode: 'collaborate' }` (default)

You and the AI share one visible Playwright-managed workspace. It opens at the
clean application URL in runtime view; use the Runtime and Editor controls to
switch views without opening another browser.

| Setting        | Value                              |
| -------------- | ---------------------------------- |
| Headless       | No                                 |
| Viewport       | Freely resizable                   |
| DevUI          | On                                 |
| Normal browser | Does not open                      |
| Screenshots    | Downscaled to fit `screenshotSize` |

```typescript
import { defineConfig } from 'vite';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';

export default defineConfig({
  plugins: [
    iwsdkDev({
      emulator: { device: 'metaQuest3' },
      ai: {},
    }),
  ],
});
```

This is the normal development mode. Manual edits and agent actions operate on
the same page and scene document.

## Agent Mode

**Config:** `ai: { mode: 'agent' }`

The AI works autonomously in the same managed workspace architecture, but the
Playwright browser is headless and has a fixed viewport. No second browser is
opened automatically. Open the reported runtime URL yourself when you need a
separate manual runtime view.

| Setting        | Value                                       |
| -------------- | ------------------------------------------- |
| Headless       | Yes                                         |
| Viewport       | Fixed to `screenshotSize` (default 800x800) |
| DevUI          | Off                                         |
| Normal browser | Does not open                               |
| Screenshots    | Exact viewport size                         |

```typescript
iwsdkDev({
  emulator: { device: 'metaQuest3' },
  ai: {
    mode: 'agent',
    screenshotSize: { width: 500, height: 500 },
  },
});
```

Use this mode for unattended automation or deterministic screenshot dimensions.

## Workspace-Only Mode

You can launch the managed runtime/editor without declaring an AI mode:

```typescript
iwsdkDev({
  workspace: { enabled: true },
});
```

This is useful for manual native scene editing, including browser-only projects
that disable IWER. Set `workspace.open: false` to register the workspace without
opening Playwright at startup; browser commands can launch it lazily.

## Settings Matrix

|               | Collaborate              | Agent                    |
| ------------- | ------------------------ | ------------------------ |
| `headless`    | `false`                  | `true`                   |
| `viewport`    | `null` (resizable)       | Fixed (`screenshotSize`) |
| `devUI`       | `true`                   | `false`                  |
| `server.open` | `false`                  | `false`                  |
| Screenshot    | Downscaled to fit bounds | Exact size               |

## Configuration Reference

```typescript
interface AiOptions {
  mode?: 'agent' | 'collaborate'; // default: 'collaborate'
  screenshotSize?: { width?: number; height?: number }; // default: 800x800
}

interface WorkspaceOptions {
  enabled?: boolean; // default: false unless ai is configured
  open?: boolean; // default: true
  headless?: boolean; // default: false for workspace-only
  screenshotSize?: { width?: number; height?: number }; // default: 800x800
}
```

Omit both `ai` and `workspace` to disable managed Playwright and MCP features.
