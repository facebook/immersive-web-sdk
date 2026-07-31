---
outline: [2, 4]
---

# Chapter 9: Native Scene Editor

IWSDK loads authored scene JSON directly. Scene files are the authoring source; the
managed editor is the live visual surface for selection, transforms, hierarchy,
components, screenshots, and human fine adjustment.

## Runtime Loading

Keep scene files under `public/scenes/` and load one through the normal World level
pipeline:

```ts
import { SessionMode, World } from '@iwsdk/core';

const world = await World.create(document.getElementById('scene')!, {
  xr: { sessionMode: SessionMode.ImmersiveVR },
  features: { enableGrabbing: true, enableLocomotion: true },
  level: '/scenes/main.iwsdk.scene.json',
});
```

Runtime code still owns systems, interaction, networking, and procedural behavior.
Use scene JSON for declarative resources, hierarchy, transforms, materials, lights,
environment, and typed components.

## Scene Format

Use `iwsdk.scene.v1` only:

```json
{
  "version": "iwsdk.scene.v1",
  "units": "meters",
  "resources": {
    "materials": [
      {
        "id": "paint",
        "model": "standard",
        "baseColor": "#5f7f62",
        "roughness": 0.72,
        "metalness": 0
      }
    ]
  },
  "nodes": [
    {
      "id": "table",
      "content": {
        "type": "primitive",
        "geometry": { "type": "box", "size": [1.2, 0.08, 0.7] },
        "material": "paint"
      },
      "transform": { "position": [0, 0.76, 0] }
    }
  ]
}
```

Resources are separate from nodes so models, materials, and prefabs can be reused.
Renderable infrastructure may set `framingRole: "support"`; it remains visible but
does not expand content-only automatic framing.

## Modular Composition

Roots can compose standalone module files:

```json
{
  "version": "iwsdk.scene.v1",
  "units": "meters",
  "imports": [
    {
      "id": "reading-nook",
      "src": "./modules/reading-nook.iwsdk.scene.json",
      "transform": { "position": [2, 0, -1] }
    }
  ],
  "resources": {},
  "nodes": []
}
```

Each module is a valid standalone v1 document. Resolution is recursive and ordered.
Imported nodes and resources receive `<import-id>/<local-id>` namespaces. The import
entry becomes a transform wrapper, and relative asset URIs resolve from the module
file. The root owns environment, metadata, and authoring globals.

This layout lets independent agents author distinct module files in parallel. Render
each module before importing it, then validate and render the root to catch scale,
contact, lighting, and camera issues across modules.

## Managed Editor

The managed Playwright browser opens at the clean origin root and defaults to Runtime.
Switch between Runtime and Editor with the two visible controls. External browsers
receive the application only; the managed browser owns the editor wrapper.

The editor watches the active root and every resolved module:

- valid file changes replace the preview atomically;
- invalid changes keep the previous valid render and show diagnostics;
- unsaved human changes produce a conflict instead of being overwritten;
- runtime reload is deferred while Editor is visible and applied when Runtime is
  selected.

Create and edit scene files with normal filesystem tools. `scene_open` never invents
or creates a missing document.

## Agent Tools

The complete public scene MCP surface is:

```text
scene_open
scene_render_file
scene_get_state
scene_get_capabilities
scene_screenshot
scene_select
scene_set_camera
scene_set_preview_visibility
scene_measure_image_regions
```

`scene_render_file` validates, resolves imports, materializes, and renders a file
without changing the active editor. Invalid input returns diagnostics and no PNG.
Valid input returns dependency information, source/composed/runtime hashes, render
statistics, camera metadata, and PNG bytes.

`scene_get_state` consolidates the active file, selection, hashes, validation,
dirty/conflict status, runtime readiness, runtime errors, and render statistics.
Hierarchy and resources are already present in the files and are not duplicated in a
separate observation API.

Document mutation tools are not exposed. Agents edit files directly; humans use the
editor controls.

Equivalent CLI examples:

```bash
npx iwsdk scene render-file \
  --input-json '{"path":"public/scenes/main.iwsdk.scene.json","view":"quarter"}' \
  --output-file artifacts/main.png
npx iwsdk scene open \
  --input-json '{"path":"public/scenes/main.iwsdk.scene.json"}' --raw
npx iwsdk scene state --raw
```

## Visual Review

Use exact saved or canonical camera views. `captureMode: "render"` removes editor
overlays; `captureMode: "editor"` is for UI diagnostics. Preview visibility can solo,
ghost, hide, show, or lock objects without changing document hashes.
Canonical review views include `top`, `front`, `back`, `left`, `right`, `quarter`,
and deterministic `orbit` steps.

Keep review orchestration and evidence in ordinary task files. The editor supplies
authoritative screenshots, hashes, camera state, diagnostics, region measurements,
and render statistics. Verify the live application runtime separately before
shipping; there is no editor review or publish gate.
