---
title: Camera access
description: Use browser-exposed cameras with CameraSource, render live video, capture frames, and manage the camera lifecycle safely
last_updated: 2026-09-05
outline: [2, 4]
---

IWSDK's camera system captures video from cameras exposed through the browser's `navigator.mediaDevices` API. It provides a Three.js `VideoTexture`, an `HTMLVideoElement`, and the underlying `MediaStream`.

`CameraSource` does not expose Meta Quest passthrough imagery or raw headset tracking-camera frames. Those are separate from browser `MediaDevices` inputs. If a browser does not expose a camera as a `videoinput`, IWSDK cannot access it through this API.

`CameraSystem` runs in browser-only and XR-enabled worlds. It attempts to start inactive camera sources only when neither document visibility nor world visibility is hidden.

## What you'll build

By the end of this chapter, you'll be able to:

- Request browser camera access from a user action
- Select any available camera or request a specific facing direction
- Display a live camera feed in a 3D scene
- Capture video frames as canvases
- Switch devices and retry failed requests
- Handle camera ownership and cleanup correctly

## Prerequisites

Camera access requires:

- A secure context, such as HTTPS or localhost
- Camera permission from the user
- A browser that supports `navigator.mediaDevices`
- At least one camera exposed by the browser as a `videoinput`
- When embedded in an iframe, both the containing page's Permissions Policy and the `allow` attribute on the iframe must permit `camera`

Available cameras vary by browser and device. A headset's passthrough view is not automatically available as a browser camera.

## Quick start

In an existing IWSDK project, add a camera button and status output alongside the existing scene container. Keep the project's normal CSS that gives the scene container a non-zero size.

```html
<div id="scene-container"></div>
<button id="enable-camera" type="button">Enable camera</button>
<button id="capture-photo" type="button">Capture photo</button>
<output id="camera-status">Camera disabled</output>
```

Use the following module code. Permission and `CameraSource` creation both happen after the user clicks the button. This browser-only preview is attached directly to `world.camera`.

```typescript
import {
  CameraFacing,
  CameraSource,
  CameraState,
  CameraUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  World,
  createSystem,
  type Entity,
  type VideoTexture,
} from '@iwsdk/core';

const container = document.getElementById('scene-container');
const enableButton =
  document.querySelector<HTMLButtonElement>('#enable-camera');
const status = document.querySelector<HTMLOutputElement>('#camera-status');

if (!container || !enableButton || !status) {
  throw new Error('Camera example elements are missing');
}

class CameraPreviewSystem extends createSystem({
  cameras: { required: [CameraSource] },
}) {
  private readonly material = new MeshBasicMaterial();
  private readonly preview = new Mesh(
    new PlaneGeometry(0.32, 0.18),
    this.material,
  );

  init() {
    this.preview.position.set(0, 0, -0.5);
    this.preview.visible = false;
    this.camera.add(this.preview);

    this.cleanupFuncs.push(() => {
      this.preview.removeFromParent();
      this.preview.geometry.dispose();
      this.material.dispose();
    });
  }

  update() {
    const cameraEntity = this.queries.cameras.entities.values().next().value;
    const state = cameraEntity?.getValue(CameraSource, 'state');
    const texture = cameraEntity
      ? (cameraEntity.getValue(CameraSource, 'texture') as VideoTexture | null)
      : null;

    if (this.material.map !== texture) {
      this.material.map = texture;
      this.material.needsUpdate = true;
    }

    this.preview.visible = texture !== null;

    if (state === CameraState.Active && texture) {
      status.value = 'Camera active: live preview visible';
      enableButton.textContent = 'Camera active';
    } else if (state === CameraState.Error) {
      status.value = 'Camera failed to start';
      enableButton.textContent = 'Try camera again';
      enableButton.disabled = false;
    }
  }
}

const world = await World.create(container, {
  xr: false,
  features: {
    camera: true,
  },
});

world.registerSystem(CameraPreviewSystem);

let cameraEntity: Entity | null = null;

enableButton.addEventListener('click', async () => {
  enableButton.disabled = true;
  status.value = 'Requesting camera permission';

  try {
    const devices = await CameraUtils.getDevices(true);
    if (devices.length === 0) {
      throw new Error('No browser camera input is available');
    }

    if (cameraEntity) {
      CameraUtils.restart(cameraEntity);
    } else {
      cameraEntity = world.createEntity();
      cameraEntity.addComponent(CameraSource, {
        facing: CameraFacing.Unknown,
      });
    }

    status.value = 'Starting camera';
  } catch (error) {
    console.error('Unable to enable the camera', error);
    status.value = 'Camera permission or startup failed';
    enableButton.textContent = 'Try camera again';
    enableButton.disabled = false;
  }
});
```

After permission and startup succeed, the output reads **Camera active: live preview visible**, and a live video plane appears in front of the browser camera. `CameraFacing.Unknown` selects the first browser-exposed camera without requiring its label to identify a facing direction.

The same source can be used in an XR-enabled world, but it still accesses only browser `MediaDevices` inputs.

## Key components

- **`CameraSystem`** manages camera stream lifecycle.
- **`CameraSource`** stores camera configuration and exposes system-owned state and outputs.
- **`CameraUtils`** provides device enumeration, permission checks, restart control, facing lookup, and frame capture.
- **`CameraFacing`** selects any, front-facing, or back-facing cameras.
- **`CameraState`** reports the current lifecycle state.

Enable the camera feature when creating the world:

```typescript
const world = await World.create(container, {
  features: {
    camera: true,
  },
});
```

This registers `CameraSystem` and `CameraSource`.

## Understand `CameraSource`

`CameraSource` contains input configuration and system-owned lifecycle values.

### Input properties

| Property    | Default                | Description                                       |
| ----------- | ---------------------- | ------------------------------------------------- |
| `deviceId`  | `''`                   | Exact device ID, or empty for automatic selection |
| `facing`    | `CameraFacing.Unknown` | Facing direction used for automatic selection     |
| `width`     | `1920`                 | Ideal video width in pixels                       |
| `height`    | `1080`                 | Ideal video height in pixels                      |
| `frameRate` | `30`                   | Ideal frame rate                                  |

Width, height, and frame rate are ideal constraints. The browser chooses the actual stream settings.

### State and output properties

| Property       | Description                                  |
| -------------- | -------------------------------------------- |
| `state`        | `Inactive`, `Starting`, `Active`, or `Error` |
| `texture`      | System-owned `VideoTexture`                  |
| `videoElement` | System-owned `HTMLVideoElement`              |
| `stream`       | System-owned `MediaStream`                   |

The output objects use `Types.Object`, so cast them when reading them in TypeScript. Callers should use the stream, video element, and texture only while the source is `CameraState.Active`. After `CameraUtils.restart()` marks a source inactive, its previous outputs can remain until the next `CameraSystem` update, when the system releases them before attempting a new start.

```typescript
import { CameraSource, CameraState, type VideoTexture } from '@iwsdk/core';

const state = cameraEntity.getValue(CameraSource, 'state');
const texture = cameraEntity.getValue(
  CameraSource,
  'texture',
) as VideoTexture | null;
const video = cameraEntity.getValue(
  CameraSource,
  'videoElement',
) as HTMLVideoElement | null;

if (state === CameraState.Active && texture && video) {
  console.log({
    texture,
    width: video.videoWidth,
    height: video.videoHeight,
  });
}
```

Treat `state`, `texture`, `videoElement`, and `stream` as read-only. Do not stop the stream's tracks, replace `videoElement.srcObject`, or dispose the texture. `CameraSystem` owns those resources. Use `CameraUtils.restart()` to request a restart, and remove `CameraSource` or destroy the entity to stop it permanently.

## Use `CameraUtils`

### `getDevices(refresh?)`

```typescript
const devices = await CameraUtils.getDevices();
const refreshedDevices = await CameraUtils.getDevices(true);
```

The first call requests camera permission with a temporary video stream, stops that stream, enumerates video inputs, and caches the result. Later calls return the cached list unless `refresh` is `true`.

Each result contains a `deviceId`, `label`, and inferred `facing` value.

### `findByFacing(devices, facing)`

```typescript
const frontCamera = CameraUtils.findByFacing(devices, CameraFacing.Front);
```

Facing is inferred from the browser-provided device label:

- `back`, `environment`, or `rear` maps to `CameraFacing.Back`.
- `front`, `user`, or `face` maps to `CameraFacing.Front`.
- Other labels map to `CameraFacing.Unknown`.

Matching is strict. `findByFacing()` returns `null` instead of falling back to a camera with a different or unknown facing.

### `hasPermission()`

```typescript
const granted = await CameraUtils.hasPermission();
```

This checks permission without requesting it. It returns `false` when permission is not granted or when the browser does not support the required Permissions API query.

### `restart(entity)`

```typescript
CameraUtils.restart(cameraEntity);
```

Call `restart()` after changing camera configuration or correcting an error. It schedules a restart; when neither document visibility nor world visibility is hidden, `CameraSystem` releases the previous resources and attempts to start the source on a subsequent update.

### `captureFrame(entity)`

```typescript
const canvas = CameraUtils.captureFrame(cameraEntity);

if (canvas) {
  document.body.append(canvas);
}
```

This returns a canvas at the video's current resolution. It returns `null` when the video element is unavailable, its dimensions are zero, or a 2D canvas context cannot be created.

## Select a camera at creation time

The following snippets are alternatives. Add `CameraSource` only once to a given entity.

### Use any available camera

```typescript
const cameraEntity = world.createEntity();
cameraEntity.addComponent(CameraSource, {
  facing: CameraFacing.Unknown,
});
```

With an empty `deviceId`, `CameraFacing.Unknown` selects the first enumerated video input.

### Request a front- or back-facing camera

```typescript
const cameraEntity = world.createEntity();
cameraEntity.addComponent(CameraSource, {
  facing: CameraFacing.Back,
});
```

`CameraFacing.Front` and `CameraFacing.Back` require a matching inferred device label. If no matching device is exposed, the source enters `CameraState.Error`; it does not fall back to another camera.

### Select a specific device

```typescript
const devices = await CameraUtils.getDevices(true);
const selectedDevice = devices[0];

if (!selectedDevice) {
  throw new Error('No browser camera input is available');
}

const cameraEntity = world.createEntity();
cameraEntity.addComponent(CameraSource, {
  deviceId: selectedDevice.deviceId,
});
```

A non-empty `deviceId` takes precedence over `facing` and is passed to `getUserMedia()` as an exact constraint.

## Manage lifecycle and retries

`CameraSystem` attempts to start an inactive source only when neither document visibility nor world visibility is hidden. This applies in non-immersive browser mode and in XR-enabled worlds.

The system releases camera resources when:

- The document becomes hidden
- The world's visibility state becomes hidden
- The entity loses its `CameraSource` component
- The system or world is destroyed
- A source is restarted

Cleanup stops media tracks, pauses the video, clears its `srcObject`, disposes the video texture, and clears the component outputs. Superseded requests cannot overwrite newer camera state, and any resources they acquire are released when those requests resolve.

After a visibility-related stop, the source is inactive. The system attempts to start it again once neither document visibility nor world visibility is hidden.

A failed start enters `CameraState.Error`. The system does not retry errors every frame. Correct the cause, then schedule an explicit retry:

```typescript
CameraUtils.restart(cameraEntity);
```

`CameraUtils.restart()` is a restart request, not a way to keep an enabled source stopped. Remove `CameraSource` or destroy the entity when the camera is no longer needed.

## Change the selected camera

For an existing source, update its configuration and then call `CameraUtils.restart()`.

To switch by facing, clear the current device ID first:

```typescript
await CameraUtils.getDevices(true);

cameraEntity.setValue(CameraSource, 'deviceId', '');
cameraEntity.setValue(CameraSource, 'facing', CameraFacing.Front);
CameraUtils.restart(cameraEntity);
```

Choose an exact device from a fresh enumeration before updating the source:

```typescript
const devices = await CameraUtils.getDevices(true);
const selectedDevice = devices[0];

if (!selectedDevice) {
  throw new Error('No browser camera input is available');
}

cameraEntity.setValue(CameraSource, 'deviceId', selectedDevice.deviceId);
CameraUtils.restart(cameraEntity);
```

## Common patterns

### Capture a photo intentionally

Call frame capture from an explicit user action:

```typescript
import { CameraUtils, type Entity } from '@iwsdk/core';

function savePhoto(cameraEntity: Entity) {
  const canvas = CameraUtils.captureFrame(cameraEntity);
  if (!canvas) return;

  canvas.toBlob(
    (blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `photo-${Date.now()}.jpg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    },
    'image/jpeg',
    0.95,
  );
}

document
  .querySelector<HTMLButtonElement>('#capture-photo')
  ?.addEventListener('click', () => {
    if (cameraEntity) savePhoto(cameraEntity);
  });
```

### Switch with a controller button

Use the successfully enumerated device list from the Quick start click handler. This factory does not request permission itself and switches the first queried camera source:

```typescript
import {
  CameraSource,
  CameraUtils,
  createSystem,
  type CameraDeviceInfo,
} from '@iwsdk/core';

function createCameraSwitcherSystem(availableCameras: CameraDeviceInfo[]) {
  return class CameraSwitcherSystem extends createSystem({
    cameras: { required: [CameraSource] },
  }) {
    update() {
      if (this.input.xr.gamepads.right?.getButtonDownByIdx(0)) {
        this.switchCamera();
      }
    }

    private switchCamera() {
      const cameraEntity = this.queries.cameras.entities.values().next().value;
      if (!cameraEntity || availableCameras.length === 0) return;

      const currentDeviceId = cameraEntity.getValue(
        CameraSource,
        'deviceId',
      ) as string;
      const currentIndex = currentDeviceId
        ? availableCameras.findIndex(
            ({ deviceId }) => deviceId === currentDeviceId,
          )
        : -1;
      const nextIndex =
        currentIndex < 0 ? 0 : (currentIndex + 1) % availableCameras.length;
      const next = availableCameras[nextIndex];
      if (!next) return;

      cameraEntity.setValue(CameraSource, 'deviceId', next.deviceId);
      CameraUtils.restart(cameraEntity);
    }
  };
}
```

Inside the successful branch of the Quick start click handler, register the system once after `getDevices(true)` returns and after the empty-list guard:

```typescript
world.registerSystem(createCameraSwitcherSystem(devices));
```

`getButtonDownByIdx(0)` checks button index `0`; use the index appropriate for the target controller.

## Troubleshooting

### Permission is denied or blocked

- Serve the app over HTTPS or localhost.
- Request access from an intentional user action.
- Check the browser's site permission and the operating system's camera privacy setting.
- After granting access, call `CameraUtils.getDevices(true)` and then `CameraUtils.restart(cameraEntity)` for an existing source.

An active XR session is not required.

### The app is embedded in an iframe

- Configure the containing page's Permissions Policy to permit camera access for the embedded origin.
- Add camera permission to the iframe, for example `<iframe src="..." allow="camera"></iframe>`.
- Reload the embedded app before requesting permission again.

### The camera is already in use

If `getUserMedia()` reports that the camera cannot be read, close other applications or tabs using the camera. Then refresh device enumeration and retry the source.

### The device ID is stale or invalid

Re-enumerate devices and use an ID from the new result. To return to automatic selection, clear `deviceId`, select `CameraFacing.Unknown`, and restart:

```typescript
await CameraUtils.getDevices(true);
cameraEntity.setValue(CameraSource, 'deviceId', '');
cameraEntity.setValue(CameraSource, 'facing', CameraFacing.Unknown);
CameraUtils.restart(cameraEntity);
```

### Stream constraints fail

Inspect the browser's `getUserMedia()` error. Keep width, height, and frame rate as ideal preferences, try the component defaults, and verify that an exact `deviceId` still exists before retrying.

### Requested facing is unavailable

Front/back selection depends on browser-provided labels. A physically present camera with an unrecognized label is classified as `CameraFacing.Unknown` and does not satisfy a strict front/back request.

Use `CameraFacing.Unknown` when any camera is acceptable, or enumerate devices and set an exact `deviceId`.

### Preview is blank

Check `CameraState.Active`, then cast and inspect the system-owned outputs:

```typescript
const state = cameraEntity.getValue(CameraSource, 'state');
const texture = cameraEntity.getValue(
  CameraSource,
  'texture',
) as VideoTexture | null;
const video = cameraEntity.getValue(
  CameraSource,
  'videoElement',
) as HTMLVideoElement | null;

console.log({ state, hasTexture: texture !== null });

if (video) {
  console.log({
    width: video.videoWidth,
    height: video.videoHeight,
    readyState: video.readyState,
  });
}
```

Wait for a non-null texture and video element with non-zero video dimensions.

### Quest passthrough is unavailable

`CameraSource` cannot retrieve Quest passthrough imagery or raw headset tracking-camera frames. It can use only video inputs exposed by the browser through `MediaDevices`.

## Privacy and captured media

- Request camera access and capture frames only after an intentional user action.
- Show clear feedback while the camera is active and when a frame is captured.
- Tell users whether captured media is stored, uploaded, or retained, and for how long.
- Do not upload or retain a captured frame unless the user-facing experience discloses that behavior.

## Best practices

1. Start with `CameraFacing.Unknown` unless a specific facing direction is required.
2. Treat front/back selection as strict and handle `CameraState.Error`.
3. Check `CameraState.Active` and cast and null-check camera outputs before using them.
4. Use `CameraUtils.restart()` instead of mutating system-owned state or resources.
5. Remove `CameraSource` or destroy its entity when the camera is no longer needed.
6. Test device enumeration and labels on every target browser and device.
