---
'@iwsdk/cli': minor
'@iwsdk/core': minor
'@iwsdk/create': minor
'@iwsdk/vite-plugin-dev': minor
---

Harden the CLI-managed development runtime with one fail-closed workspace
owner, an explicit managed-browser lifecycle, exact managed and physical target
routing, bounded command execution, and runtime status/recovery tools. Dev
startup uses Vite's resolved application port and may return before the browser
command path is ready; inspect `browserCommandReady` or use `runtime wait` before
issuing browser-backed commands. A configured `server.port` is the runtime's
address, so an occupied port now fails startup instead of moving to the next
free port; an explicit `server.strictPort` still wins. Recovery reports `browser_relaunched` without
replaying the command, while failures after dispatch report `outcome_unknown`.

Managed Chromium uses a private profile in OS temporary storage that survives
automatic browser recovery while retained. Stop active dev processes before
upgrading the CLI and Vite plugin together. Native pose overrides are enabled
only for explicitly configured Quest sessions; other browsers continue using
IWER emulation.
