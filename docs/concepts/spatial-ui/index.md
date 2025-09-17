---
title: Spatial UI Overview
---

# Spatial UI in WebXR

Building usable, high‑performance UI inside a 3D/WebXR app is deceptively hard. In practice, teams gravitate to two camps:

- Camp 1 — HTML → canvas → texture
  - Author UI in HTML/CSS, render it into a 2D canvas, then map that canvas as a texture on a 3D mesh.
  - Pros: familiar authoring, existing web tooling, great accessibility pipelines.
  - Cons: rendering to a texture is expensive (especially at XR refresh rates), tricky to animate every frame, and you must forward input from 3D rays/hands back into DOM hit‑testing.

- Camp 2 — Native 3D UI (meshes, SDF text, custom layout)
  - Build UI from real 3D geometry, instanced quads, SDF/MSDF text, and your own layout engine.
  - Pros: excellent runtime performance, flexible 3D animations and effects, precise control in XR.
  - Cons: higher learning curve (layout, text, styling), custom authoring model, more boilerplate.

## Our Approach: Best of Both Worlds

IWSDK combines the strengths of both camps:

- UIKit (Camp 2 execution, web‑standard layout)
  - A native 3D UI runtime with MSDF text and batched/instanced panels for performance.
  - Uses Yoga (Flexbox) for predictable, web‑aligned layout semantics.

- UIKitML (Familiar authoring)
  - An HTML/CSS‑like DSL. You write markup and classes you already know.
  - A parser turns `.uikitml` into a compact JSON format ideal for web transport.
  - An interpreter builds UIKit component trees from that JSON at runtime.

- Vite Plugin (Zero‑friction compilation)
  - Watches your `ui/*.uikitml` files in dev and compiles them to `public/ui/*.json`.
  - Runs once in production builds. No manual steps.

- SDK Runtime (Seamless consumption)
  - The core UI systems fetch JSON, interpret into live UIKit components, and attach them to your scene.
  - Pointer events are connected for ray/grab/hand input.
  - The resulting components are surfaced through `UIKitDocument`, which exposes familiar DOM‑like APIs such as `getElementById()` and `querySelector()`.

## Why Spatial UI Is Tricky (Details)

- Performance budgets: XR requires sustained frame rates (72–120 Hz) and often renders twice (stereo). Rendering HTML to canvas every frame is costly and competes with the 3D scene budget.
- Readability and scale: UI must remain crisp at various distances and angles. Texture‑based UI needs larger atlases for legibility; MSDF text keeps glyphs sharp under transform.
- Input parity: Controllers and hands interact via rays and near‑touch. DOM hit‑testing is 2D; bridging rays into DOM is fiddly and error‑prone.
- Sorting and transparency: UI is often translucent and stacked. Correct, stable painter order is critical to avoid flicker and popping in stereo.
- Authoring vs runtime: Web developers want HTML/CSS ergonomics; 3D engines want batched meshes and GPU‑friendly data. Bridging these worlds cleanly is non‑trivial.

Our stack is designed to mitigate each of these with Yoga‑based layout (predictable), MSDF text (crisp), batching/instancing (fast), and a DSL + plugin that preserves a familiar authoring workflow.

## When to Use Spatial UI in IWSDK

- Spatial panels you can place in world space with XR pointers and grabs.
- Heads‑up or HUD‑style overlays using screen‑space placement when XR is not presenting.
- UI that needs to animate smoothly at XR frame rates and remain crisp.

## What’s Inside

- [UIKit](/concepts/spatial-ui/uikit) — the 3D UI runtime (layout, text, performance model).
- [UIKitML](/concepts/spatial-ui/uikitml) — the authoring language, parser, and interpreter.
- [UIKitDocument](/concepts/spatial-ui/uikit-document) — DOM‑like access to interpreted UI.
- [Flow](/concepts/spatial-ui/flow) — end‑to‑end: author → compile → ship JSON → interpret → interact.

## Choosing an Approach (Quick Guidance)

- Prefer Spatial UI (this stack) when:
  - Panels need to exist in world space, be grabbed, or be part of 3D interactions.
  - You need fine‑grained animation, shader effects, or deep integration with scene state.
  - You want deterministic sizing in meters and crisp text at any distance.

- Prefer DOM overlays when:
  - You only need 2D menus outside XR, or development velocity matters more than in‑XR fidelity.
  - Accessibility/SEO or copy‑paste web widgets are primary concerns.

- Hybrid: Use DOM overlays for non‑XR flows and Spatial UI once “Enter VR/AR” starts. IWSDK’s `ScreenSpaceUISystem` eases transition between the two.

## Common Pitfalls & Anti‑Patterns

- Avoid updating canvas textures every frame for large UIs — performance will tank in XR.
- Don’t put gameplay logic inside visual `update()` calls of UI components; use pointer events and ECS systems to react to interactions.
- Don’t hard‑code pixel sizes for world‑space panels; use meters via `UIKitDocument.setTargetDimensions()`.
