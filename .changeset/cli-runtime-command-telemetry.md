---
'@iwsdk/cli': patch
---

Report CLI runtime commands such as `iwsdk xr status` and `iwsdk browser screenshot` through the same MetaVR usage telemetry as the equivalent MCP tools. Each invocation is recorded once, under the installed CLI version rather than a fixed `1.0.0`. MCP tools now check their parameters before looking for a running dev server, as the CLI does, so invalid parameters report the parameter error instead of a missing runtime. Failed operations now report a fixed reason, such as `invalid_input`, `no_runtime`, or `connection_lost`, instead of the start of the error message, so telemetry no longer carries text from your project.
