# @iwsdk/scene-composition

IWSDK-native scene document primitives for declarative scene authoring.

This package owns the browser-independent scene JSON contract used by the native
scene editor and agentic scene composition tools. It intentionally does not
import `three`, Vite, Playwright, or IWSDK runtime packages.

Exports include:

- `SCENE_DOCUMENT_JSON_SCHEMA` and `SCENE_DOCUMENT_SCHEMA_ID`
- scene document TypeScript types
- parser, serializer, and runtime validator
- reversible scene patch operations and command history
- deterministic `lookAt`, `placeOn`, snap-to-grid, and bounds-aware alignment
  helpers
