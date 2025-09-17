/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Types, createComponent } from '../ecs/index.js';

/**
 * Playback behavior when a new play is requested.
 *
 * @category Audio
 */
export const PlaybackMode = {
  Restart: 'restart',
  Overlap: 'overlap',
  Ignore: 'ignore',
  FadeRestart: 'fade-restart',
} as const;

/**
 * Policy used when the instance pool is full and a new play is requested.
 *
 * @category Audio
 */
export const InstanceStealPolicy = {
  Oldest: 'oldest',
  Quietest: 'quietest',
  Furthest: 'furthest',
} as const;

/**
 * Distance attenuation model for positional audio.
 *
 * @category Audio
 */
export const DistanceModel = {
  Linear: 'linear',
  Inverse: 'inverse',
  Exponential: 'exponential',
} as const;

/**
 * Configurable audio playback component for positional and ambient sounds.
 *
 * @remarks
 * - The {@link AudioSystem} loads sources via {@link AssetManager} and manages
 *   instance pooling, crossfades, and XR session lifecycle.
 * - For positional audio, attach the component to an entity with a valid
 *   Object3D; non-positional audio plays from the listener.
 * - Use `_playRequested/_pauseRequested/_stopRequested` to trigger actions
 *   without directly reaching into Three.js audio objects.
 *
 * @category Audio
 */
export const AudioSource = createComponent(
  'AudioSource',
  {
    // Core properties
    src: { type: Types.String, default: '' }, // URL or cache key for an audio buffer
    volume: { type: Types.Float32, default: 1.0 }, // Linear gain [0..1]
    loop: { type: Types.Boolean, default: false }, // When true, newly created instances loop
    autoplay: { type: Types.Boolean, default: false }, // Trigger a single play on first update after load

    // Spatial properties
    positional: { type: Types.Boolean, default: true }, // true: PositionalAudio; false: ambient Audio
    refDistance: { type: Types.Float32, default: 1 }, // Distance at which volume is 1.0
    rolloffFactor: { type: Types.Float32, default: 1 }, // Rolloff curve steepness
    maxDistance: { type: Types.Float32, default: 10000 }, // Distance after which volume is 0
    distanceModel: {
      type: Types.Enum,
      enum: DistanceModel,
      default: DistanceModel.Inverse,
    },
    coneInnerAngle: { type: Types.Float32, default: 360 }, // Degrees of full-volume cone
    coneOuterAngle: { type: Types.Float32, default: 360 }, // Degrees until falloff reaches outer gain
    coneOuterGain: { type: Types.Float32, default: 0 }, // Gain at the edge/outside of the cone

    // Playback behavior control
    playbackMode: {
      type: Types.Enum,
      enum: PlaybackMode,
      default: PlaybackMode.Restart,
    }, // Behavior when play is triggered while another instance is active
    maxInstances: { type: Types.Int8, default: 1 }, // Max simultaneous instances in pool
    crossfadeDuration: { type: Types.Float32, default: 0.1 }, // Seconds used for FadeRestart
    instanceStealPolicy: {
      type: Types.Enum,
      enum: InstanceStealPolicy,
      default: InstanceStealPolicy.Oldest,
    }, // Which instance to replace when pool is full

    // Playback control flags (internal)
    _playRequested: { type: Types.Boolean, default: false }, // Set true to request play on next update
    _pauseRequested: { type: Types.Boolean, default: false }, // Set true to request pause (optional fade)
    _stopRequested: { type: Types.Boolean, default: false }, // Set true to stop and clear instances
    _fadeIn: { type: Types.Float32, default: 0 }, // Seconds to fade in on next play
    _fadeOut: { type: Types.Float32, default: 0 }, // Seconds to fade out on pause

    // Runtime state (managed by AudioSystem)
    _pool: { type: Types.Object, default: undefined }, // Assigned AudioPool for this entity
    _instances: { type: Types.Object, default: undefined }, // Active instance list (internal)
    _isPlaying: { type: Types.Boolean, default: false }, // True if any instance is currently playing
    _buffer: { type: Types.Object, default: undefined }, // Loaded AudioBuffer
    _loaded: { type: Types.Boolean, default: false }, // True once buffer is loaded
    _loading: { type: Types.Boolean, default: false }, // True while buffer is loading
  },
  'AudioSource playback component for positional and non-positional sounds',
);
