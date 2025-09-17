---
title: Concepts
---

# Concepts

This section gathers the big ideas behind IWSDK — how the engine is structured and how to build XR apps that feel great and run smoothly. Jump into a topic below.

## ECS (Entity–Component–System)

- Start here for the core programming model.
- How entities, components, and systems fit together; config signals; queries; lifecycle; patterns.
- Begin: [/concepts/ecs](/concepts/ecs)

## Three.js Basics for IWSDK

- Practical Three.js concepts in the context of IWSDK: transforms, scene graph, cameras, lights, geometry/materials, raycasting, and rendering performance.
- Begin: [/concepts/three-basics](/concepts/three-basics)

## XR Input

- Controllers and hands with a unified model: visuals, pointers (ray/grab), XR origin spaces, and the `StatefulGamepad` helper.
- Begin: [/concepts/xr-input](/concepts/xr-input)
  - Highlights: [Input Visuals](/concepts/xr-input/input-visuals), [Pointers](/concepts/xr-input/pointers), [Stateful Gamepad](/concepts/xr-input/stateful-gamepad), [XR Origin](/concepts/xr-input/xr-origin)

## Spatial UI

- High‑performance 3D UI using UIKit (Yoga‑based layout, MSDF text) with familiar authoring via UIKitML, compiled by a Vite plugin.
- Begin: [/concepts/spatial-ui](/concepts/spatial-ui)
  - Highlights: [UIKit](/concepts/spatial-ui/uikit), [UIKitML](/concepts/spatial-ui/uikitml), [UIKitDocument](/concepts/spatial-ui/uikit-document), [Flow](/concepts/spatial-ui/flow)

## Locomotion

- Comfort‑first movement: slide with vignette, arc‑based teleport, snap/smooth turn — all powered by a lightweight physics engine that can run in a Worker.
- Begin: [/concepts/locomotion](/concepts/locomotion)
  - Highlights: [Slide](/concepts/locomotion/slide), [Teleport](/concepts/locomotion/teleport), [Turn](/concepts/locomotion/turn), [Performance](/concepts/locomotion/performance)

---

### Suggested Path

1. ECS → 2) Three Basics → 3) XR Input → 4) Spatial UI → 5) Locomotion

You can dip into any section as needed, but this order builds intuition steadily: data model → rendering basics → input → UI → movement.
