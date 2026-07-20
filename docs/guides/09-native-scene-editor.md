---
outline: [2, 4]
---

# Chapter 9: Native Scene Editor

IWSDK projects can load authored scene JSON directly. The native scene editor is
the visual workflow for placing assets, setting transforms, assigning components,
and saving those changes back to `public/scenes/*.iwsdk.scene.json`.

## What You'll Build

By the end of this chapter, you'll be able to:

- Use the managed workspace for runtime, editor, and split views
- Inspect the runtime scene hierarchy
- Place assets from the project asset catalog
- Edit transforms and component properties
- Save a scene JSON file and reload it in the app
- Use the same workflow from agent tools when MCP is available

## Scene JSON In The Runtime

Scene JSON is a declarative layer for authored content. Runtime code still owns
systems, procedural behavior, networking, and any interaction that is easier to
express imperatively.

```ts
import { SessionMode, World } from '@iwsdk/core';

const world = await World.create(document.getElementById('scene')!, {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  features: { enableGrabbing: true, enableLocomotion: true },
  level: '/scenes/main.iwsdk.scene.json',
});
```

Keep scene files under `public/scenes/` so the dev server can serve them with a
stable URL.

If your app already has a validated scene document in memory, load it through
the same level pipeline:

```ts
await world.loadSceneDocument(sceneDocument);
```

For existing projects, use the
[Native Scene Migration](./09-native-scene-migration.md) checklist to replace
old generated level output with scene JSON and shared catalog assets.

## Opening The Editor

Start the development server from your project:

```bash
npm run dev
```

When AI tooling is enabled, IWSDK opens a Playwright-managed workspace at
`/__iwsdk/workspace`. That workspace owns the runtime, editor, and split views.
Normal browser tabs stay on the runtime app; opening the workspace or legacy
editor URL in a normal browser redirects back to the app.

For manual editor work today, use a headed managed mode such as
`ai: { mode: 'collaborate' }`. Use the workspace view switcher to move between
Runtime, Editor, and Split. Agents use `workspace_get_state`,
`workspace_set_view`, `scene_list_files`, `scene_open`, and `scene_create`
instead of constructing long editor URLs.

## Editing Workflow

1. Open or create a scene file under `public/scenes/`.
2. Pick an object from the viewport or outliner.
3. Adjust position, rotation, and scale with the transform controls.
4. Add or edit IWSDK component data in the inspector.
5. Save the scene JSON.
6. Reload the app page and verify the scene appears as expected.

Use descriptive node ids. Stable ids make it much easier for runtime code,
tests, and agent tools to find the intended entity.

## Agentic Scene Composition

When MCP tools are connected, agents should use the editor-targeted scene tools
instead of editing scene files blindly. A typical loop is:

1. Call `workspace_get_state`.
2. Use `scene_list_files`, `scene_open`, or `scene_create` to choose the scene.
3. Capture screenshots from front, side, top, and quarter views.
4. Inspect the hierarchy and asset catalog.
5. Apply scene patches through the scene composition tools.
6. Save the scene.
7. Switch to runtime or split view and compare screenshots before finishing.

Multiple camera angles matter because one oblique view can hide floating,
alignment, and symmetry errors.

The native scene composition tool surface includes `workspace_get_state`,
`workspace_set_view`, `scene_list_files`, `scene_open`, `scene_create`,
`scene_list_assets`, `scene_get_document`, `scene_get_hierarchy`,
`scene_add_node`, `scene_set_transform`, `scene_apply_patch`, `scene_place_on`,
`scene_look_at`, `scene_validate`, `scene_save`, `scene_set_camera`, and
`scene_screenshot`. Use `scene_set_camera` or `scene_screenshot` with current,
top, front, back, left, right, quarter, and orbit views, or with an explicit
camera position and look-at target, before saving.

## Choosing Scene JSON Or Code

Use scene JSON for authored placement:

- furniture, props, lights, anchors, and static layout
- component defaults that designers or agents should tune visually
- stable authored scenes that need two-way editing

Use code for runtime behavior:

- procedural generation
- animation and game logic
- API-driven content
- custom systems and performance-sensitive loops

This split keeps the authored scene editable while preserving the full
expressiveness of IWSDK code.
