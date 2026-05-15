# Known Issues & Workarounds

## Live gradient color changes don't update visuals

Setting DomeGradient/IBLGradient color fields via `ecs_set_component` updates the ECS data but does NOT update the Three.js shader uniforms. Testing is limited to **data verification**.

## _needsUpdate consumed immediately

The `_needsUpdate` flag is consumed by the EnvironmentSystem and reset to `false`. The response may already show `newValue: false`.

## Default lighting auto-attach

`LevelSystem` attaches `DomeGradient` + `IBLGradient` to the LevelRoot ONLY if `defaultLighting: true` (default) AND the level root doesn't already have dome/IBL components.

## Entity indices change on reload

Never cache entity indices across page reloads. Always re-discover via `ecs_find_entities`.

## Boolean values must be JSON booleans

When setting boolean fields (like `_needsUpdate`) via `ecs_set_component`, the `value` must be a JSON boolean (`true`), not a string (`"true"`). Strings silently fail.
