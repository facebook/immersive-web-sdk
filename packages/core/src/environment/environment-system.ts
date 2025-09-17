/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AssetManager, CacheManager } from '../asset/index.js';
import { Entity, createSystem } from '../ecs/index.js';
import { LevelRoot } from '../level/index.js';
import {
  BackSide,
  Color,
  Mesh,
  PMREMGenerator,
  WebGLRenderTarget,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  CubeTexture,
  EquirectangularReflectionMapping,
} from '../runtime/index.js';
import { DomeGradient } from './dome-gradient.js';
import { DomeTexture } from './dome-texture.js';
import {
  GradientEnvironment,
  createGradientMaterial,
} from './gradient-environment.js';
import { IBLGradient } from './ibl-gradient.js';
import { IBLTexture } from './ibl-texture.js';

interface EnvState {
  backgroundTexture?: Texture;
  environmentTarget?: WebGLRenderTarget;
  backgroundSource?: string;
  environmentSource?: string;
  gradientDome?: Mesh;
  gradientEnvironmentScene?: GradientEnvironment;
  gradientEnvironmentMesh?: Mesh;
  savedBackground?: Texture | CubeTexture | Color | null;
  isAR?: boolean;
}

/**
 * Unified background and image‑based lighting system.
 *
 * @remarks
 * - Background is driven by {@link DomeTexture} (HDR/LDR equirect) or {@link DomeGradient} (procedural sphere) and writes to `scene.background`.
 * - IBL is driven by {@link IBLTexture} ("room" or HDR/LDR equirect via PMREM) or {@link IBLGradient} (PMREM of a gradient scene) and writes to `scene.environment`.
 * - Rotation and intensity hooks forward to `scene.backgroundRotation`, `scene.backgroundIntensity`, and `scene.environmentRotation`, `scene.environmentIntensity`.
 * - In immersive AR, background visuals are hidden while environment lighting remains active.
 * - PMREM targets are regenerated only when sources change; the dome mesh and geometry are reused.
 *
 * @category Environment & Lighting
 * @example
 * ```ts
 * // Background: HDR skybox; IBL: Room environment
 * const root = world.activeLevel!.value;
 * root.addComponent(DomeTexture, { src: '/envs/sky.hdr', intensity: 0.9 });
 * root.addComponent(IBLTexture, { src: 'room', intensity: 1.2 });
 *
 * // Rotate background 45° around Y; rotate IBL 90°
 * root.setValue(DomeTexture, 'rotation', [0, Math.PI / 4, 0]);
 * root.setValue(IBLTexture, 'rotation', [0, Math.PI / 2, 0]);
 * root.setValue(DomeTexture, '_needsUpdate', true);
 * root.setValue(IBLTexture, '_needsUpdate', true);
 * ```
 */
export class EnvironmentSystem extends createSystem({
  domeTextures: { required: [DomeTexture, LevelRoot] },
  domeGradients: { required: [DomeGradient, LevelRoot] },
  iblTextures: { required: [IBLTexture, LevelRoot] },
  iblGradients: { required: [IBLGradient, LevelRoot] },
}) {
  private state: EnvState = {};
  private pmrem!: PMREMGenerator;
  private gradientGeometry?: SphereGeometry;
  private tmpColor: Color = new Color();

  init(): void {
    this.pmrem = new PMREMGenerator(this.renderer);
    this.cleanupFuncs.push(() => {
      this.pmrem.dispose();
      this.state.environmentTarget?.dispose();
      this.state.environmentTarget = undefined;
      this.clearGradientDome();
      this.gradientGeometry?.dispose();
      this.gradientGeometry = undefined;
    });

    // XR background toggle
    this.cleanupFuncs.push(
      this.visibilityState.subscribe(() => this.updateBackgroundForXRMode()),
    );
  }

  update(): void {
    // Choose background source: DomeTexture > DomeGradient
    let backgroundEntity: Entity | undefined;
    for (const e of this.queries.domeTextures.entities) {
      backgroundEntity = e;
      break;
    }
    if (!backgroundEntity) {
      for (const e of this.queries.domeGradients.entities) {
        backgroundEntity = e;
        break;
      }
    }

    if (backgroundEntity) {
      this.processBackground(backgroundEntity);
    }

    // Choose IBL source: IBLTexture > IBLGradient
    let iblEntity: Entity | undefined;
    for (const e of this.queries.iblTextures.entities) {
      iblEntity = e;
      break;
    }
    if (!iblEntity) {
      for (const e of this.queries.iblGradients.entities) {
        iblEntity = e;
        break;
      }
    }

    if (iblEntity) {
      this.processIBL(iblEntity);
    }

    // Keep gradient dome centered and sized
    if (this.state.gradientDome) {
      this.state.gradientDome.position.copy(this.camera.position);
      const r = Math.max(1e-3, (this.camera?.far || 1000) * 0.95);
      this.state.gradientDome.scale.setScalar(r);
    }
  }

  // Background handling
  private async processBackground(entity: Entity): Promise<void> {
    try {
      if (entity.hasComponent(DomeTexture)) {
        const needs = entity.getValue(DomeTexture, '_needsUpdate');
        if (needs) {
          const changed = this.hasDomeTextureBackgroundChanged(entity);
          if (changed) {
            await this.updateDomeTextureBackground(entity);
          }
          this.updateBackgroundProps(entity);
          entity.setValue(DomeTexture, '_needsUpdate', false);
        }
      } else if (entity.hasComponent(DomeGradient)) {
        const needs = entity.getValue(DomeGradient, '_needsUpdate');
        if (needs) {
          await this.updateDomeGradient(entity, /*forIBL*/ false);
          entity.setValue(DomeGradient, '_needsUpdate', false);
        }
      }
    } catch (e) {
      console.error('[EnvironmentSystem] Failed background update:', e);
    }
  }

  private hasDomeTextureBackgroundChanged(entity: Entity): boolean {
    const src = entity.getValue(DomeTexture, 'src') || '';
    const changed = src !== this.state.backgroundSource;
    if (changed) {
      this.state.backgroundSource = src;
    }
    return changed;
  }

  private async updateDomeTextureBackground(entity: Entity): Promise<void> {
    const src = entity.getValue(DomeTexture, 'src') || '';
    if (!src) {
      this.scene.background = null;
      return;
    }
    const lower = src.toLowerCase();
    const isHDR = lower.endsWith('.hdr') || lower.endsWith('.exr');
    const url = CacheManager.resolveUrl(src);
    const texture = isHDR
      ? await AssetManager.loadHDRTexture(url)
      : await AssetManager.loadTexture(url);
    this.state.backgroundTexture = texture;
    // For LDR equirect backgrounds, ensure world-locked mapping; HDR/EXR already mapped by loader
    if (!isHDR) {
      texture.mapping = EquirectangularReflectionMapping;
    }
    this.scene.background = texture;
  }

  private updateBackgroundProps(entity: Entity): void {
    const blurriness = entity.getValue(DomeTexture, 'blurriness') ?? 0;
    const intensity = entity.getValue(DomeTexture, 'intensity') ?? 1;
    const rot = entity.getVectorView(DomeTexture, 'rotation');
    this.scene.backgroundBlurriness = blurriness;
    this.scene.backgroundIntensity = intensity;
    if (rot) {
      this.scene.backgroundRotation?.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    }
  }

  private async updateDomeGradient(
    entity: Entity,
    forIBL: boolean,
  ): Promise<void> {
    const skyV = entity.getVectorView(DomeGradient, 'sky');
    const equatorV = entity.getVectorView(DomeGradient, 'equator');
    const groundV = entity.getVectorView(DomeGradient, 'ground');
    const intensity = entity.getValue(DomeGradient, 'intensity') || 1.0;

    const skyHex = this.tmpColor.setRGB(skyV[0], skyV[1], skyV[2]).getHex();
    const equatorHex = this.tmpColor
      .setRGB(equatorV[0], equatorV[1], equatorV[2])
      .getHex();
    const groundHex = this.tmpColor
      .setRGB(groundV[0], groundV[1], groundV[2])
      .getHex();

    if (!forIBL) {
      // Background gradient dome mesh
      this.ensureGradientDome(skyHex, equatorHex, groundHex, intensity);
      // Ensure correct visibility for AR sessions (hide in AR)
      if (this.state.gradientDome) {
        this.state.gradientDome.visible = !this.state.isAR;
      }
    }
  }

  // IBL handling
  private async processIBL(entity: Entity): Promise<void> {
    try {
      if (entity.hasComponent(IBLTexture)) {
        const needs = entity.getValue(IBLTexture, '_needsUpdate');
        if (needs) {
          const changed = this.hasIBLTextureChanged(entity);
          if (changed) {
            await this.updateIBLTexture(entity);
          }
          this.updateIBLProps(entity);
          entity.setValue(IBLTexture, '_needsUpdate', false);
        }
      } else if (entity.hasComponent(IBLGradient)) {
        const needs = entity.getValue(IBLGradient, '_needsUpdate');
        if (needs) {
          await this.updateIBLGradient(entity);
          entity.setValue(IBLGradient, '_needsUpdate', false);
        }
      }
    } catch (e) {
      console.error('[EnvironmentSystem] Failed IBL update:', e);
    }
  }

  private hasIBLTextureChanged(entity: Entity): boolean {
    const src = entity.getValue(IBLTexture, 'src') || '';
    const changed = src !== this.state.environmentSource;
    if (changed) {
      this.state.environmentSource = src;
    }
    return changed;
  }

  private async updateIBLTexture(entity: Entity): Promise<void> {
    const src = (entity.getValue(IBLTexture, 'src') || '').trim();
    if (!src) {
      this.setEnvironment(null);
      return;
    }
    if (src === 'room') {
      // Build RoomEnvironment scene and PMREM it
      const room = new RoomEnvironment();
      const target = this.pmrem.fromScene(room);
      room.dispose?.();
      this.setEnvironment(target);
      return;
    }
    const lower2 = src.toLowerCase();
    const isHDR = lower2.endsWith('.hdr') || lower2.endsWith('.exr');
    const url = CacheManager.resolveUrl(src);
    const tex = isHDR
      ? await AssetManager.loadHDRTexture(url)
      : await AssetManager.loadTexture(url);
    const target = this.pmrem.fromEquirectangular(tex);
    this.setEnvironment(target);
  }

  private updateIBLProps(entity: Entity): void {
    const intensity = entity.getValue(IBLTexture, 'intensity') ?? 1;
    const rot = entity.getVectorView(IBLTexture, 'rotation');
    this.scene.environmentIntensity = intensity;
    if (rot) {
      this.scene.environmentRotation?.set(
        rot[0] || 0,
        rot[1] || 0,
        rot[2] || 0,
      );
    }
  }

  private async updateIBLGradient(entity: Entity): Promise<void> {
    const skyV = entity.getVectorView(IBLGradient, 'sky');
    const equatorV = entity.getVectorView(IBLGradient, 'equator');
    const groundV = entity.getVectorView(IBLGradient, 'ground');
    const intensity = entity.getValue(IBLGradient, 'intensity') || 1.0;
    const skyHex = new Color().setRGB(skyV[0], skyV[1], skyV[2]).getHex();
    const equatorHex = new Color(
      equatorV[0],
      equatorV[1],
      equatorV[2],
    ).getHex();
    const groundHex = new Color(groundV[0], groundV[1], groundV[2]).getHex();

    let gradientScene = this.state.gradientEnvironmentScene;
    if (!gradientScene) {
      gradientScene = new GradientEnvironment(
        skyHex,
        equatorHex,
        groundHex,
        intensity,
      );
      this.state.gradientEnvironmentScene = gradientScene;
      // Cache mesh for uniform updates
      this.state.gradientEnvironmentMesh = gradientScene.children.find(
        (o): o is Mesh => o instanceof Mesh,
      );
    } else {
      const mat = this.state.gradientEnvironmentMesh?.material as
        | ShaderMaterial
        | undefined;
      if (mat) {
        mat.uniforms.skyColor.value.setHex(skyHex).multiplyScalar(intensity);
        mat.uniforms.equatorColor.value
          .setHex(equatorHex)
          .multiplyScalar(intensity);
        mat.uniforms.groundColor.value
          .setHex(groundHex)
          .multiplyScalar(intensity);
      }
    }

    const target = this.pmrem.fromScene(gradientScene);
    this.setEnvironment(target);
    // Apply IBL intensity for gradient as well
    this.scene.environmentIntensity = intensity;
  }

  private setEnvironment(target: WebGLRenderTarget | null): void {
    this.state.environmentTarget?.dispose();
    this.state.environmentTarget = undefined;
    if (target) {
      this.state.environmentTarget = target;
      this.scene.environment = target.texture;
    } else {
      this.scene.environment = null;
    }
  }

  // XR background handling
  private updateBackgroundForXRMode(): void {
    const session = this.xrManager.getSession?.() ?? this.world.session;
    const blend: string | undefined = session?.environmentBlendMode;
    const isAR =
      blend === 'alpha-blend' ||
      blend === 'additive' ||
      blend === 'subtractive';

    if (isAR === this.state.isAR) {
      return;
    }
    this.state.isAR = isAR;

    if (isAR) {
      if (
        this.scene.background !== null &&
        this.state.savedBackground === undefined
      ) {
        this.state.savedBackground = this.scene.background;
        this.scene.background = null;
      }
      // Hide procedural gradient dome in AR as well
      if (this.state.gradientDome) {
        this.state.gradientDome.visible = false;
      }
    } else if (this.state.savedBackground !== undefined) {
      this.scene.background = this.state.savedBackground;
      this.state.savedBackground = undefined;
      // Restore gradient dome visibility when exiting AR
      if (this.state.gradientDome) {
        this.state.gradientDome.visible = true;
      }
    }
  }

  // Gradient dome mesh utilities (background)
  private ensureGradientDome(
    skyHex: number,
    equatorHex: number,
    groundHex: number,
    intensity: number,
  ): void {
    if (!this.gradientGeometry) {
      this.gradientGeometry = new SphereGeometry(1, 32, 15);
    }
    if (!this.state.gradientDome) {
      const material = createGradientMaterial(
        skyHex,
        equatorHex,
        groundHex,
        intensity,
        BackSide,
      );
      const dome = new Mesh(this.gradientGeometry, material);
      dome.scale.setScalar(Math.max(1e-3, (this.camera?.far || 1000) * 0.95));
      dome.renderOrder = -1e9;
      dome.frustumCulled = false;
      this.scene.add(dome);
      this.state.gradientDome = dome;
    } else {
      const mat = this.state.gradientDome.material as ShaderMaterial;
      mat.uniforms.skyColor.value.setHex(skyHex).multiplyScalar(intensity);
      mat.uniforms.equatorColor.value
        .setHex(equatorHex)
        .multiplyScalar(intensity);
      mat.uniforms.groundColor.value
        .setHex(groundHex)
        .multiplyScalar(intensity);
    }
  }

  private clearGradientDome(): void {
    if (this.state.gradientDome) {
      this.state.gradientDome.removeFromParent();
      (this.state.gradientDome.material as ShaderMaterial).dispose();
      this.state.gradientDome = undefined;
    }
    if (this.state.gradientEnvironmentScene) {
      this.state.gradientEnvironmentScene.dispose();
      this.state.gradientEnvironmentScene = undefined;
    }
  }
}
