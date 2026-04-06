---
name: iwsdk-ui
description: "Develop and iterate on IWSDK PanelUI components with UIKITML editing, full-screen ScreenSpace preview, and visual verification. Use when creating, modifying, debugging, or improving UI panels, dashboard interfaces, or widget layouts in IWSDK applications."
argument-hint: [panel-name or description of changes]
---

# UI Panel Development

Efficiently develop and iterate on IWSDK PanelUI panels using ScreenSpace for full-screen 2D preview. The workflow has a **required core** (setup for iteration) and **optional extensions** (the actual UI work, driven by user intent).

User request is in `$ARGUMENTS`.

## Required Core

### Step 1: Identify the panel

Find the panel entity and its UIKITML source file.

- Panel entities have the `PanelUI` component. Use `ecs_find_entities` with `withComponents: ["PanelUI"]` to find them.
- Read the `PanelUI` component's `config` field with `ecs_query_entity` to find the JSON path (e.g., `./ui/welcome.json`).
- The UIKITML source lives in `ui/` with the same name but `.uikitml` extension (e.g., `ui/welcome.uikitml`).

### Step 2: Set up full-screen preview

The ScreenSpace component positions a panel in front of the camera so it appears as a 2D UI — ideal for fast iteration.

**If the entity already has ScreenSpace:** Note the current settings so they can be restored later.

```
ecs_query_entity(entityIndex, components: ["ScreenSpace"]) → save the values
```

**If the entity does not have ScreenSpace:** You will need to add it in code.

Either way, set ScreenSpace to fill the entire viewport in code:

```typescript
.addComponent(ScreenSpace, {
  top: "0px",
  left: "0px",
  width: "100vw",
  height: "100vh",
});
```

Setting this in code (not via `ecs_set_component`) ensures it persists across hot reloads.

### Step 3: Verify setup

Take a `browser_screenshot` to confirm the panel fills the screen and is ready for iteration.

## UI Editing

This is where the user's request drives the work. Edit the `.uikitml` file in `ui/`.

### Key facts about UIKITML

- UIKITML is a **subset of HTML**, not all syntax is supported.
- **Before writing markup**, use `mcp__iwsdk-rag-local__search_code` to query for supported UIKITML element types and CSS properties. Search for things like "uikitml interpret container text" or specific element types you need.
- Supported selectors: `#id` and `.class` (via PanelDocument's `querySelector`).
- Units are in **centimeters** (e.g., `width: 50` = 50cm). World space uses meters. `100cm = 1m`.
- The source of truth is the `.uikitml` file. Changes are auto-compiled by the vite plugin and hot-reloaded.
- The compiled `.json` file in `public/ui/` should **never be modified directly**, but can be read for quick debugging to inspect the compiled element tree, class definitions, and properties.

### Verify changes

After each edit to the `.uikitml` file:

1. Wait a moment for the vite plugin to compile and hot-reload.
2. Take a `browser_screenshot` to visually verify the change.
3. If needed, read the compiled JSON (`public/ui/<name>.json`) to debug layout issues or inspect computed properties.

Repeat the edit-screenshot cycle as needed.

## Cleanup (Required)

When done with UI work, **always** restore the ScreenSpace component to its original state.

**If it had ScreenSpace before:** Restore the original values that were noted in Step 2.

```typescript
// Restore original settings
.addComponent(ScreenSpace, {
  top: "20px",
  left: "20px",
  height: "40%",
  // ... whatever was noted
});
```

**If it did not have ScreenSpace before:** Remove the ScreenSpace component addition from code.

Take a final `browser_screenshot` to confirm the panel is back to its normal state.

## Notes

- **Always edit `.uikitml`, never the compiled `.json`** — the JSON is auto-generated and will be overwritten.
- **ScreenSpace behavior in VR:** When entering VR, ScreenSpace automatically detaches the panel from the camera and it returns to world-space positioning. This is handled by the ScreenSpaceUISystem.
- **PanelDocument for element access:** Use `getElementById(id)` or `querySelector(selector)` on the PanelDocument to access UI elements programmatically in systems. Elements can be named with `.name = "id"` to make them discoverable in the scene hierarchy.
- **ScreenSpace uses CSS strings, not numbers** — always pass string values like `"400px"`, `"100vw"`, `"20px"`.
