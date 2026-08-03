---
outline: [2, 4]
---

# Modes

IWSDK's AI integration supports two modes. Both use the same managed Playwright
workspace, runtime preview, native scene editor, and MCP connection. The mode
only changes whether that workspace is visible and how screenshots are sized.

## Collaborate Mode

**Command:** `npx iwsdk dev up --ai-mode collaborate`

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

```bash
npx iwsdk dev up --ai-mode collaborate
```

This is the normal development mode. Manual edits and agent actions operate on
the same page and scene document.

## Agent Mode

**Command:** `npx iwsdk dev up --ai-mode agent`

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

```bash
npx iwsdk dev up --ai-mode agent \
  --screenshot-width 500 --screenshot-height 500
```

Use this mode for unattended automation or deterministic screenshot dimensions.

## Workspace-Only Mode

Launch the managed runtime/editor without declaring an AI mode:

```bash
npx iwsdk dev up
```

This is useful for manual native scene editing, including browser-only projects
that disable IWER. Add `--no-open` to register the workspace without opening
Playwright at startup; browser commands can launch it lazily.

## Settings Matrix

|               | Collaborate              | Agent                    |
| ------------- | ------------------------ | ------------------------ |
| `headless`    | `false`                  | `true`                   |
| `viewport`    | `null` (resizable)       | Fixed (`screenshotSize`) |
| `devUI`       | `true`                   | `false`                  |
| `server.open` | `false`                  | `false`                  |
| Screenshot    | Downscaled to fit bounds | Exact size               |

## Session Flag Reference

- `--ai-mode agent|collaborate`
- `--headed` / `--headless`
- `--open` / `--no-open`
- `--screenshot-width <pixels>` / `--screenshot-height <pixels>`

The managed workspace and MCP endpoint remain available for every
manifest-first development server even when no AI mode is selected.
