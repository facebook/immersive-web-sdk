/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { VERSION as EliCSVersion } from 'elics';
import { REVISION } from 'three';
import { VERSION } from './version.js';

export * from './runtime/index.js';
export * from './ecs/index.js';
export * from './transform/index.js';
export * from './asset/index.js';
export * from './locomotion/index.js';
export * from './visibility/index.js';
export * from './ui/index.js';
export * from './init/index.js';
export * from './grab/index.js';
export * from './input/index.js';
export * from './environment/index.js';
export * from './level/index.js';
export * from './scene-understanding/index.js';
export * from './audio/index.js';
export * from './physics/index.js';

// re-exports
export * from '@iwsdk/xr-input';
export * from '@iwsdk/locomotor';
export * as UIKit from '@pmndrs/uikit';

export { VERSION };

console.log(`                                                 
▄▄▄▄▄▄  ▄▄      ▄▄   ▄▄▄▄    ▄▄▄▄▄     ▄▄   ▄▄▄ 
▀▀██▀▀  ██      ██ ▄█▀▀▀▀█   ██▀▀▀██   ██  ██▀  
  ██    ▀█▄ ██ ▄█▀ ██▄       ██    ██  ██▄██    
  ██     ██ ██ ██   ▀████▄   ██    ██  █████    
  ██     ███▀▀███       ▀██  ██    ██  ██  ██▄  
▄▄██▄▄   ███  ███  █▄▄▄▄▄█▀  ██▄▄▄██   ██   ██▄ 
▀▀▀▀▀▀   ▀▀▀  ▀▀▀   ▀▀▀▀▀    ▀▀▀▀▀     ▀▀    ▀▀                                                
===============================================
Immersive Web SDK v${VERSION}
Three.js r${REVISION}
EliCS v${EliCSVersion}`);
