/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { PhysicsRuntime } from './physics-runtime.js';
import type {
  PhysicsWorkerInputMessage,
  PhysicsWorkerOutputMessage,
} from './physics-worker-protocol.js';

export interface PhysicsTransportErrorEvent {
  message: string;
}

/** Message transport shared by worker and inline physics execution. */
export interface PhysicsTransport {
  onmessage: ((event: MessageEvent<PhysicsWorkerOutputMessage>) => void) | null;
  onerror: ((event: PhysicsTransportErrorEvent) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(
    message: PhysicsWorkerInputMessage,
    transfer?: Transferable[],
  ): void;
  terminate(): void;
}

class MainThreadPhysicsTransport implements PhysicsTransport {
  onmessage:
    | ((event: MessageEvent<PhysicsWorkerOutputMessage>) => void)
    | null = null;
  onerror: ((event: PhysicsTransportErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;

  private runtime?: PhysicsRuntime;
  private messageQueue = Promise.resolve();
  private terminated = false;

  postMessage(message: PhysicsWorkerInputMessage): void {
    if (this.terminated) {
      return;
    }
    this.messageQueue = this.messageQueue
      .then(() => this.handleMessage(message))
      .catch((error) => {
        if (!this.terminated) {
          this.onerror?.({
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
  }

  terminate(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.runtime?.destroy();
    this.runtime = undefined;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
  }

  private async getRuntime(): Promise<PhysicsRuntime> {
    if (!this.runtime) {
      const { PhysicsRuntime } = await import('./physics-runtime.js');
      if (this.terminated) {
        throw new Error('Physics transport was terminated during startup');
      }
      this.runtime = new PhysicsRuntime();
    }
    return this.runtime;
  }

  private emit(message: PhysicsWorkerOutputMessage): void {
    if (!this.terminated) {
      this.onmessage?.({
        data: message,
      } as MessageEvent<PhysicsWorkerOutputMessage>);
    }
  }

  private async handleMessage(
    message: PhysicsWorkerInputMessage,
  ): Promise<void> {
    const runtime = await this.getRuntime();
    switch (message.type) {
      case 'init':
        await runtime.initialize(message.gravity);
        this.emit({ type: 'ready' });
        break;
      case 'set-gravity':
        runtime.setGravity(message.gravity);
        break;
      case 'add-body':
        try {
          const centerOfMass = runtime.addBody(message);
          this.emit({
            type: 'body-created',
            handle: message.handle,
            centerOfMass,
          });
        } catch (error) {
          this.emit({
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
          this.emit({ type: 'error', message: result.error });
        }
        this.emit({ type: 'step-result', buffer: result.buffer });
        break;
      }
    }
  }
}

export function createPhysicsTransport(useWorker: boolean): PhysicsTransport {
  if (!useWorker) {
    return new MainThreadPhysicsTransport();
  }
  return new Worker(new URL('./physics-worker.js', import.meta.url), {
    type: 'module',
  }) as PhysicsTransport;
}
