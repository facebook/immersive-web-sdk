---
'@iwsdk/cli': minor
'@iwsdk/create': minor
'@iwsdk/scene-composition': minor
'@iwsdk/vite-plugin-dev': minor
---

Add isolated multi-view model previews with authored-material and clay modes,
named-part focus, and deterministic geometry diagnostics. Split generated scene
guidance into `iwsdk-build-model` for object-local asset authoring and
`iwsdk-compose-scene` for world-relative composition and review, with a bundled
hard-surface starter library for efficient procedural authoring. Agent-facing
model previews default to a context-efficient 640 by 480 contact sheet while still
allowing explicit higher-resolution focused inspection. Scene-composition guidance
uses a smaller correction-verification render so delivery-quality captures do not
inflate the agent loop. Screenshot-producing MCP tools now persist PNGs locally and
return `screenshotPath` instead of embedding base64 image data in tool responses.
