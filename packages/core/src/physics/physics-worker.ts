/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { PhysicsRuntime } from './physics-runtime.js';
import type {
  PhysicsWorkerInputMessage,
  PhysicsWorkerOutputMessage,
} from './physics-worker-protocol.js';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<PhysicsWorkerInputMessage>) => void) | null;
  postMessage(
    message: PhysicsWorkerOutputMessage,
    transfer?: Transferable[],
  ): void;
};

const runtime = new PhysicsRuntime();

function postMessage(
  message: PhysicsWorkerOutputMessage,
  transfer: Transferable[] = [],
): void {
  workerScope.postMessage(message, transfer);
}

async function handleMessage(
  message: PhysicsWorkerInputMessage,
): Promise<void> {
  switch (message.type) {
    case 'init':
      await runtime.initialize(message.gravity);
      postMessage({ type: 'ready' });
      break;
    case 'set-gravity':
      runtime.setGravity(message.gravity);
      break;
    case 'add-body':
      try {
        const centerOfMass = runtime.addBody(message);
        postMessage({
          type: 'body-created',
          handle: message.handle,
          centerOfMass,
        });
      } catch (error) {
        postMessage({
          type: 'error',
          handle: message.handle,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    case 'remove-body':
      runtime.removeBody(message.handle);
      break;
    case 'step': {
      const result = runtime.step(message.buffer);
      if (result.error) {
        postMessage({ type: 'error', message: result.error });
      }
      postMessage({ type: 'step-result', buffer: result.buffer }, [
        result.buffer,
      ]);
      break;
    }
  }
}

let messageQueue = Promise.resolve();
workerScope.onmessage = (event) => {
  messageQueue = messageQueue
    .then(() => handleMessage(event.data))
    .catch((error) => {
      postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
};
