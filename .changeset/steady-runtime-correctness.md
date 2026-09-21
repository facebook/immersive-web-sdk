---
'@iwsdk/core': patch
'@iwsdk/locomotor': patch
---

Clamp distance-grab interpolation after stalled frames so position and rotation
cannot extrapolate into invalid transforms.

Wake locomotion after environment changes, teleports, and successful jumps,
allow the first jump immediately, and restart the idle timeout on static-ground
landings so the float spring settles before sleep.

Keep native XR composition layers aligned with player space, preserve their
configured full dimensions and scale, synchronize visibility and geometry, fall
back safely for unsupported transforms, and release resources during teardown.

Clear session-owned depth uniforms during XR exit, component removal, and system
teardown, and require fresh per-session depth data before re-enabling occlusion.

Refresh retained plane and mesh geometry when WebXR reports updates, compute
correct axis-aligned mesh bounds, and skip BVH acceleration for compatible
foreign Three.js geometries that do not expose the extension.
