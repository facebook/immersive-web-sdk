/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AssetManager,
  AssetManifest,
  AssetType,
  AudioSource,
  AudioUtils,
  BoxGeometry,
  Color,
  EnvironmentType,
  Grabbed,
  Hovered,
  LocomotionEnvironment,
  Mesh,
  MeshStandardMaterial,
  OneHandGrabbable,
  PanelDocument,
  PanelUI,
  PhysicsBody,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  Pressed,
  RayInteractable,
  SphereGeometry,
  World,
  createSystem,
  eq,
} from '@iwsdk/core';
import * as horizonKit from '@pmndrs/uikit-horizon';
import { CameraIcon, RotateCcwIcon } from '@pmndrs/uikit-lucide';
import { BrowserMouseLookSystem } from './mouselook.js';

const BALL_COLOR_IDLE = 0xa78bfa;
const BALL_COLOR_GRABBED = 0xfacc15;
const RAY_COLOR_IDLE = 0xffffff;
const RAY_COLOR_HOVERED = 0x38bdf8;
const RAY_COLOR_PRESSED = 0x2563eb;
const BALL_SPAWN: [number, number, number] = [0.55, 2.1, -2.25];
const BALL_RADIUS = 0.18;

const assets: AssetManifest = {
  environmentDesk: {
    url: '/iwsdk-assets/environment-desk/environmentDesk.gltf',
    type: AssetType.GLTF,
    priority: 'critical',
  },
};

function spawnPhysicsBall(world: World) {
  const ball = new Mesh(
    new SphereGeometry(BALL_RADIUS, 32, 16),
    new MeshStandardMaterial({ color: BALL_COLOR_IDLE, roughness: 0.35 }),
  );
  ball.position.set(...BALL_SPAWN);
  return world
    .createTransformEntity(ball)
    .addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Sphere,
      dimensions: [BALL_RADIUS, BALL_RADIUS, BALL_RADIUS],
    })
    .addComponent(PhysicsBody, { state: PhysicsState.Dynamic })
    .addComponent(OneHandGrabbable, { translate: true, rotate: true });
}

class BrowserFirstFeedbackSystem extends createSystem({
  rayTargets: { required: [RayInteractable] },
  oneHandGrabTargets: { required: [OneHandGrabbable] },
  pressedAudio: { required: [AudioSource, Pressed] },
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/welcome.json')],
  },
}) {
  init(): void {
    this.queries.pressedAudio.subscribe('qualify', (entity) => {
      AudioUtils.play(entity);
    });

    this.queries.welcomePanel.subscribe('qualify', (entity) => {
      const document = (PanelDocument as any).data.document[entity.index];
      if (!document) {
        return;
      }
      document.getElementById('reset-button')?.addEventListener('click', () => {
        this.queries.oneHandGrabTargets.entities.forEach((ball) => {
          ball.destroy();
        });
        spawnPhysicsBall(this.world);
      });
      document
        .getElementById('toggle-view-button')
        ?.addEventListener('click', () => {
          (
            this.world.getSystem(
              BrowserMouseLookSystem,
            ) as BrowserMouseLookSystem
          )?.toggleMode();
        });
    });
  }

  update(): void {
    this.queries.rayTargets.entities.forEach((entity) => {
      const material = (entity.object3D as Mesh | undefined)?.material as
        | MeshStandardMaterial
        | undefined;
      if (!material?.color) {
        return;
      }

      if (entity.hasComponent(Pressed)) {
        material.color.set(RAY_COLOR_PRESSED);
      } else if (entity.hasComponent(Hovered)) {
        material.color.set(RAY_COLOR_HOVERED);
      } else {
        material.color.set(RAY_COLOR_IDLE);
      }
    });

    this.queries.oneHandGrabTargets.entities.forEach((entity) => {
      const material = (entity.object3D as Mesh | undefined)?.material as
        | MeshStandardMaterial
        | undefined;
      if (!material?.color) {
        return;
      }

      material.color.set(
        entity.hasComponent(Grabbed) ? BALL_COLOR_GRABBED : BALL_COLOR_IDLE,
      );
    });
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, {
  assets,
  xr: false,
  render: {
    near: 0.001,
    far: 200,
    camera: {
      position: [0, 1.6, 0],
      lookAt: [0, 1.55, -1],
    },
  },
  input: {
    canvasPointerEvents: true,
  },
  features: {
    grabbing: true,
    locomotion: {
      browserControls: true,
    },
    physics: true,
    spatialUI: { kits: [horizonKit, { RotateCcwIcon, CameraIcon }] },
  },
}).then((world) => {
  world.scene.background = new Color(0x0b1020);

  const { scene: envMesh } = AssetManager.getGLTF('environmentDesk')!;
  envMesh.rotateY(Math.PI);
  envMesh.position.set(0, -0.107, 0);
  world
    .createTransformEntity(envMesh)
    .addComponent(LocomotionEnvironment, { type: EnvironmentType.STATIC })
    .addComponent(PhysicsShape, { shape: PhysicsShapeType.TriMesh })
    .addComponent(PhysicsBody, { state: PhysicsState.Static });

  const rayTarget = new Mesh(
    new BoxGeometry(0.36, 0.36, 0.36),
    new MeshStandardMaterial({ color: RAY_COLOR_IDLE, roughness: 0.5 }),
  );
  rayTarget.position.set(-0.55, 0.93, -2.25);
  world
    .createTransformEntity(rayTarget)
    .addComponent(RayInteractable)
    .addComponent(AudioSource, {
      src: createBeepUrl(),
      positional: false,
      volume: 0.35,
    });

  spawnPhysicsBall(world);

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/welcome.json',
      maxHeight: 0.4,
      maxWidth: 0.5,
    })
    .addComponent(RayInteractable);
  panelEntity.object3D!.position.set(0, 1.4, -2.25);

  world
    .registerSystem(BrowserFirstFeedbackSystem)
    .registerSystem(BrowserMouseLookSystem);
});

function createBeepUrl(): string {
  const sampleRate = 22050;
  const durationSeconds = 0.12;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const wavHeaderBytes = 44;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(wavHeaderBytes + sampleCount * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * bytesPerSample, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, sampleCount * bytesPerSample, true);

  for (let i = 0; i < sampleCount; i++) {
    const envelope = 1 - i / sampleCount;
    const sample = Math.sin((i / sampleRate) * Math.PI * 2 * 660) * envelope;
    view.setInt16(wavHeaderBytes + i * bytesPerSample, sample * 0x7fff, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
