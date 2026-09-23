/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AsyncLocalStorage } from 'async_hooks';

const MAX_MANAGED_BROWSER_COMMAND_QUEUE = 32;

// Queue expiry is retryable and never tears down the browser; a command that
// acquires the lock receives a fresh active budget. Browser host operations
// use a 60s transport ceiling, leaving ample response-settlement headroom.
const DEFAULT_MANAGED_BROWSER_QUEUE_TIMEOUT_MS = 15_000;

const DEFAULT_MANAGED_BROWSER_COMMAND_TIMEOUT_MS = 27_000;

export const EVIDENCE_COMMAND_TIMEOUT_MS = 120_000;

function managedBrowserCommandError(code: string, message: string): Error {
  const outcome =
    code === 'browser_command_timeout' ? 'outcome_unknown' : 'not_executed';
  return Object.assign(new Error(message), {
    code,
    outcome,
    retryable: outcome === 'not_executed',
  });
}

export class ManagedBrowserCommandCoordinator {
  private active = false;
  private closing = false;
  private shutdownPromise: Promise<void> | null = null;
  private activeOwner: { deadline: number; token: symbol } | null = null;
  private readonly ownerStorage = new AsyncLocalStorage<{
    deadline: number;
    token: symbol;
  }>();
  private readonly queue: Array<{
    deadline: number;
    reject: (error: Error) => void;
    resolve: (release: () => void) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(
    private readonly abortActiveOperation: () => Promise<void>,
    private readonly onInvalidated?: () => void,
  ) {}

  async runExclusive<T>(
    operation: () => Promise<T>,
    timeoutMs = DEFAULT_MANAGED_BROWSER_COMMAND_TIMEOUT_MS,
    queueTimeoutMs = DEFAULT_MANAGED_BROWSER_QUEUE_TIMEOUT_MS,
  ): Promise<T> {
    if (this.closing) {
      throw managedBrowserCommandError(
        'browser_command_aborted',
        'Managed browser is closing; retry after it relaunches.',
      );
    }
    const currentOwner = this.ownerStorage.getStore();
    if (
      currentOwner != null &&
      currentOwner.token === this.activeOwner?.token
    ) {
      return operation();
    }

    const boundedTimeoutMs = Math.min(120_000, Math.max(100, timeoutMs));
    const boundedQueueTimeoutMs = Math.min(
      120_000,
      Math.max(100, queueTimeoutMs),
    );
    const release = await this.acquire(Date.now() + boundedQueueTimeoutMs);
    const owner = {
      deadline: Date.now() + boundedTimeoutMs,
      token: Symbol('managed-browser-command'),
    };
    this.activeOwner = owner;
    const operationPromise = this.ownerStorage.run(owner, operation);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    try {
      return await Promise.race([
        operationPromise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(
              managedBrowserCommandError(
                'browser_command_timeout',
                `Managed browser command timed out after ${boundedTimeoutMs}ms`,
              ),
            );
          }, boundedTimeoutMs);
        }),
      ]);
    } finally {
      if (timer != null) {
        clearTimeout(timer);
      }
      if (timedOut) {
        this.closing = true;
        this.onInvalidated?.();
        // Playwright operations do not consistently accept AbortSignals. Tear
        // down the owned context so a timed-out operation cannot continue to
        // mutate the application after the transport has given up. The plugin
        // will lazily relaunch the managed browser on the next command.
        await Promise.race([
          this.abortActiveOperation().catch(() => {}),
          new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
        ]);
        this.rejectQueued(
          managedBrowserCommandError(
            'browser_command_aborted',
            'Managed browser restarted after another command exceeded its active timeout; retry this command.',
          ),
        );
      }
      void operationPromise.catch(() => {});
      if (this.activeOwner === owner) {
        this.activeOwner = null;
      }
      release();
    }
  }

  getRemainingActiveTimeMs(): number {
    const owner = this.ownerStorage.getStore();
    return owner == null
      ? DEFAULT_MANAGED_BROWSER_COMMAND_TIMEOUT_MS
      : Math.max(0, owner.deadline - Date.now());
  }

  shutdown(): Promise<void> {
    if (this.shutdownPromise != null) {
      return this.shutdownPromise;
    }
    this.closing = true;
    this.rejectQueued(
      managedBrowserCommandError(
        'browser_command_aborted',
        'Managed browser is closing; retry after it relaunches.',
      ),
    );
    // The lifecycle controller bounds waiting, but retains ownership until
    // this disposal promise confirms the process is gone.
    this.shutdownPromise = this.abortActiveOperation();
    return this.shutdownPromise;
  }

  private acquire(deadline: number): Promise<() => void> {
    if (!this.active) {
      this.active = true;
      return Promise.resolve(() => this.release());
    }
    if (this.queue.length >= MAX_MANAGED_BROWSER_COMMAND_QUEUE) {
      return Promise.reject(
        managedBrowserCommandError(
          'browser_command_busy',
          'Managed browser command queue is full; retry this command.',
        ),
      );
    }
    return new Promise<() => void>((resolve, reject) => {
      const remainingMs = Math.max(1, deadline - Date.now());
      const queued = {
        deadline,
        reject,
        resolve,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(queued);
          if (index >= 0) {
            this.queue.splice(index, 1);
          }
          reject(
            managedBrowserCommandError(
              'browser_command_queue_timeout',
              'Managed browser command timed out in the queue; retry this command.',
            ),
          );
        }, remainingMs),
      };
      this.queue.push(queued);
    });
  }

  private release(): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      clearTimeout(next.timer);
      if (Date.now() >= next.deadline) {
        next.reject(
          managedBrowserCommandError(
            'browser_command_queue_timeout',
            'Managed browser command timed out in the queue; retry this command.',
          ),
        );
        continue;
      }
      next.resolve(() => this.release());
      return;
    }
    this.active = false;
  }

  private rejectQueued(error: Error): void {
    for (const queued of this.queue.splice(0)) {
      clearTimeout(queued.timer);
      queued.reject(error);
    }
  }
}
