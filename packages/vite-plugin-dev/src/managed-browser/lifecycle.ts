/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { randomUUID } from 'crypto';
import type {
  RuntimeBrowserLifecycle,
  RuntimeIssueCause,
} from '@iwsdk/cli/contract';

type State = RuntimeBrowserLifecycle;
export type LifecycleEvent =
  | {
      type: 'launch';
      attemptId: string;
      timeoutMs: number;
      phase?: 'installing' | 'starting';
    }
  | { type: 'prepared'; attemptId: string; timeoutMs: number }
  | { type: 'running'; attemptId: string }
  | { type: 'closing'; reason: string; timeoutMs: number }
  | {
      type: 'cleanup_unconfirmed';
      reason: string;
      cause?: RuntimeIssueCause;
    }
  | { type: 'failed'; reason: string; cause?: RuntimeIssueCause }
  | { type: 'stable' }
  | { type: 'retry' }
  | { type: 'observe' }
  | { type: 'stop' };

/** Pure transition function. All async completions are fenced by attempt ID. */
export function reduceBrowserLifecycle(
  state: State,
  event: LifecycleEvent,
  now: number,
): State {
  if (state.state === 'stopped') {
    return state;
  }
  const next = { ...state };
  switch (event.type) {
    case 'launch':
      if (
        state.policy === 'disabled' ||
        state.cleanupConfirmed === false ||
        !['idle', 'failed'].includes(state.state) ||
        state.failures >= 3
      ) {
        return state;
      }
      next.state = 'launching';
      next.browserEpoch++;
      next.attemptId = event.attemptId;
      next.phase = event.phase ?? 'starting';
      next.deadline = new Date(now + event.timeoutMs).toISOString();
      delete next.issue;
      delete next.issueAt;
      delete next.issueCause;
      break;
    case 'prepared':
      if (state.state !== 'launching' || state.attemptId !== event.attemptId) {
        return state;
      }
      next.phase = 'starting';
      next.deadline = new Date(now + event.timeoutMs).toISOString();
      break;
    case 'running':
      if (state.state !== 'launching' || state.attemptId !== event.attemptId) {
        return state;
      }
      next.state = 'running';
      delete next.deadline;
      delete next.phase;
      break;
    case 'closing':
      next.state = 'closing';
      next.issue = event.reason;
      next.issueAt = new Date(now).toISOString();
      next.issueCause = 'connection_lost';
      next.cleanupConfirmed = false;
      next.deadline = new Date(now + event.timeoutMs).toISOString();
      delete next.phase;
      break;
    case 'cleanup_unconfirmed':
      next.state = 'failed';
      next.cleanupConfirmed = false;
      next.issue = event.reason;
      next.issueAt = new Date(now).toISOString();
      next.issueCause = event.cause ?? 'connection_lost';
      delete next.deadline;
      delete next.phase;
      break;
    case 'failed':
      if (
        !['launching', 'closing', 'running', 'failed'].includes(state.state)
      ) {
        return state;
      }
      next.state = 'failed';
      next.failures++;
      next.issue = event.reason;
      next.issueAt = new Date(now).toISOString();
      next.issueCause =
        /permission|not permitted|denied|eacces|eperm|sandbox/iu.test(
          event.reason,
        )
          ? 'permission_denied'
          : (event.cause ??
            (state.state === 'launching'
              ? 'browser_launch_failed'
              : 'connection_lost'));
      next.cleanupConfirmed = true;
      delete next.deadline;
      delete next.phase;
      break;
    case 'stable':
      if (state.state !== 'running' || state.failures === 0) {
        return state;
      }
      next.failures = 0;
      break;
    case 'retry':
      if (state.state !== 'failed') {
        return state;
      }
      next.failures = 0;
      break;
    case 'observe':
      break;
    case 'stop':
      next.state = 'stopped';
      next.cleanupConfirmed = true;
      delete next.deadline;
      delete next.phase;
      break;
  }
  next.revision++;
  next.lastObservedAt = new Date(now).toISOString();
  if (next.state !== state.state) {
    next.stateEnteredAt = next.lastObservedAt;
  }
  next.retryEligible =
    next.policy !== 'disabled' &&
    next.cleanupConfirmed !== false &&
    (next.state === 'idle' || next.state === 'failed') &&
    next.failures < 3;
  next.nextAction =
    next.state === 'failed' && next.cleanupConfirmed === false
      ? 'Browser cleanup is unconfirmed. Inspect the owned browser process; replacement is blocked until cleanup completes.'
      : next.policy === 'disabled'
        ? 'Restart with --open to enable the managed browser.'
        : next.state === 'closing'
          ? 'Wait for owned browser cleanup; no replacement can launch yet.'
          : next.state === 'failed' && next.failures >= 3
            ? 'Inspect the issue, then call runtime_recover for an explicit retry.'
            : next.state === 'failed' || next.state === 'idle'
              ? 'A managed-target command or runtime_recover can launch the browser.'
              : next.state === 'launching'
                ? next.phase === 'installing'
                  ? 'Preparing Chromium. Use runtime_wait; if installation fails, run playwright install chromium.'
                  : 'Use runtime_wait to observe launch progress.'
                : next.state === 'stopped'
                  ? 'Start the dev runtime.'
                  : 'Use runtime_list_targets to inspect endpoint readiness.';
  if (event.type !== 'observe') {
    next.historyTruncated =
      state.historyTruncated || state.history.length >= 64;
    next.history = [
      ...state.history,
      {
        revision: next.revision,
        state: next.state,
        at: next.lastObservedAt,
        reason: 'reason' in event ? event.reason : event.type,
      },
    ].slice(-64);
  }
  return next;
}

export interface LifecycleBrowser {
  isClosed(): boolean;
  close(): Promise<void>;
  onClose(callback: () => void): void;
}

/** One writer, one in-flight launch/cleanup, and bounded observers. */
export class ManagedBrowserLifecycle<B extends LifecycleBrowser> {
  private state: State;
  private browser: B | null = null;
  private flight: Promise<void> | null = null;
  private abort: AbortController | null = null;
  private stopping = false;
  private cleanupUnconfirmed = false;
  private cleanupTimer?: ReturnType<typeof setTimeout>;
  private cleanupDeadline?: Promise<never>;
  private stopped?: Promise<void>;
  private stopRequest?: Promise<void>;
  private stableTimer?: ReturnType<typeof setTimeout>;
  private waiters = new Set<() => void>();
  constructor(
    private readonly options: {
      sessionId: string;
      enabled: boolean;
      launch: (signal: AbortSignal, browserEpoch: number) => Promise<B>;
      prepare?: (signal: AbortSignal) => Promise<void>;
      onChange: (state: State, browser: B | null) => void;
      launchTimeoutMs?: number;
      installTimeoutMs?: number;
      cleanupTimeoutMs?: number;
      stableMs?: number;
      now?: () => number;
    },
  ) {
    const at = new Date(this.now()).toISOString();
    this.state = {
      state: 'idle',
      policy: options.enabled ? 'eager' : 'disabled',
      sessionId: options.sessionId,
      browserEpoch: 0,
      revision: 0,
      stateEnteredAt: at,
      lastObservedAt: at,
      failures: 0,
      cleanupConfirmed: true,
      attemptLimit: 3,
      historyTruncated: false,
      retryEligible: options.enabled,
      nextAction: options.enabled
        ? 'Waiting for the dev listener.'
        : 'Restart with --open to enable the managed browser.',
      history: [],
    };
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  snapshot(): State {
    return structuredClone(this.state);
  }
  current(): B | null {
    return this.state.state === 'running' ? this.browser : null;
  }
  private dispatch(event: LifecycleEvent) {
    const next = reduceBrowserLifecycle(this.state, event, this.now());
    if (next === this.state) {
      return;
    }
    this.state = next;
    try {
      this.options.onChange(this.snapshot(), this.current());
    } catch (error) {
      console.error('[IWSDK Dev] Lifecycle observer failed:', error);
    }
    for (const resolve of this.waiters) {
      resolve();
    }
  }
  observe() {
    this.dispatch({ type: 'observe' });
  }
  async wait(
    afterRevision: number,
    timeoutMs = 25000,
    signal?: AbortSignal,
  ): Promise<State> {
    if (this.state.revision !== afterRevision || signal?.aborted) {
      return this.snapshot();
    }
    if (this.waiters.size >= 64) {
      throw Object.assign(
        new Error('Too many runtime status waiters (maximum 64).'),
        {
          code: 'runtime_wait_capacity',
          outcome: 'not_executed',
          retryable: true,
        },
      );
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, Math.min(Math.max(timeoutMs, 0), 25000));
      this.waiters.add(done);
      signal?.addEventListener('abort', done, { once: true });
    });
    return this.snapshot();
  }
  async ensure(
    explicit = false,
  ): Promise<{ browser: B | null; relaunched: boolean }> {
    if (this.stopping || this.state.policy === 'disabled') {
      return { browser: null, relaunched: false };
    }
    if (this.current() && !this.browser!.isClosed()) {
      return { browser: this.browser, relaunched: false };
    }
    if (this.current()) {
      this.retire('Managed browser closed unexpectedly.');
    }
    // Capture this before joining or starting the launch. Concurrent callers
    // on the first launch must not mistake the browser they just created for a
    // replacement, while callers recovering after a prior running generation
    // must all receive the fail-closed browser_relaunched result.
    const replacingPriorBrowser = this.state.history.some(
      (entry) => entry.state === 'running',
    );
    if (this.state.cleanupConfirmed === false) {
      return { browser: null, relaunched: false };
    }
    if (explicit) {
      this.dispatch({ type: 'retry' });
    }
    if (this.flight == null && this.state.retryEligible) {
      this.start();
    }
    if (this.flight) {
      // The caller has a deadline, but an unresolved effect retains ownership
      // and blocks a replacement until its eventual cleanup is confirmed.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.flight,
          new Promise<void>((resolve) => {
            timer = setTimeout(
              resolve,
              Math.min(this.options.launchTimeoutMs ?? 60000, 1000),
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    return {
      browser: this.current(),
      relaunched: replacingPriorBrowser && this.current() != null,
    };
  }
  private start() {
    const attemptId = randomUUID();
    const timeoutMs = this.options.launchTimeoutMs ?? 60000;
    const installTimeoutMs = this.options.installTimeoutMs ?? 600000;
    this.dispatch({
      type: 'launch',
      attemptId,
      timeoutMs: this.options.prepare ? installTimeoutMs : timeoutMs,
      phase: this.options.prepare ? 'installing' : 'starting',
    });
    if (this.state.attemptId !== attemptId) {
      return;
    }
    const controller = (this.abort = new AbortController());
    const epoch = this.state.browserEpoch;
    const expired = () => {
      this.beginCleanup(
        'Browser preparation or launch deadline exceeded; waiting for cleanup.',
      );
      controller.abort();
    };
    let timer = setTimeout(
      expired,
      this.options.prepare ? installTimeoutMs : timeoutMs,
    );
    const effect = Promise.resolve().then(async () => {
      try {
        if (this.options.prepare) {
          await this.options.prepare(controller.signal);
          clearTimeout(timer);
          if (this.stopping || controller.signal.aborted) {
            this.finishCleanup();
            this.dispatch(
              this.stopping
                ? { type: 'stop' }
                : {
                    type: 'failed',
                    reason: 'Browser installation was cancelled.',
                    cause: 'browser_launch_failed',
                  },
            );
            return;
          }
          this.dispatch({ type: 'prepared', attemptId, timeoutMs });
          timer = setTimeout(expired, timeoutMs);
        }
        const browser = await this.options.launch(controller.signal, epoch);
        this.browser = browser;
        if (this.stopping || controller.signal.aborted) {
          await browser.close();
          this.browser = null;
          this.finishCleanup();
          this.dispatch({
            type: this.stopping ? 'stop' : 'failed',
            reason: 'Browser launch timed out.',
            ...(!this.stopping
              ? ({ cause: 'browser_launch_failed' } as const)
              : {}),
          });
          return;
        }
        this.dispatch({ type: 'running', attemptId });
        browser.onClose(() => {
          if (this.browser === browser && !this.stopping) {
            this.retire('Managed browser closed unexpectedly.');
          }
        });
        this.stableTimer = setTimeout(() => {
          if (this.browser === browser) {
            this.dispatch({ type: 'stable' });
          }
        }, this.options.stableMs ?? 30000);
        this.stableTimer.unref?.();
      } catch (error) {
        if (
          this.browser != null ||
          (typeof error === 'object' &&
            error != null &&
            'cleanupConfirmed' in error &&
            error.cleanupConfirmed === false)
        ) {
          this.cleanupUnconfirmed = true;
          this.finishCleanup();
          this.dispatch({
            type: 'cleanup_unconfirmed',
            reason: `Browser cleanup is unconfirmed: ${String(error)}`,
            cause: 'browser_launch_failed',
          });
          return;
        }
        this.finishCleanup();
        this.dispatch(
          this.stopping
            ? { type: 'stop' }
            : {
                type: 'failed',
                reason: error instanceof Error ? error.message : String(error),
                cause: 'browser_launch_failed',
              },
        );
      } finally {
        clearTimeout(timer);
      }
    });
    this.flight = effect;
    void effect.finally(() => {
      if (this.flight === effect && this.state.cleanupConfirmed !== false) {
        this.flight = null;
      }
      if (this.abort === controller) {
        this.abort = null;
      }
    });
  }
  invalidate(reason: string) {
    this.retire(reason);
  }
  invalidateIfCurrent(browser: B, browserEpoch: number, reason: string) {
    if (
      this.current() !== browser ||
      this.state.browserEpoch !== browserEpoch
    ) {
      return false;
    }
    this.retire(reason);
    return true;
  }
  private retire(reason: string) {
    const browser = this.browser;
    if (!browser || this.state.cleanupConfirmed === false) {
      return;
    }
    clearTimeout(this.stableTimer);
    this.beginCleanup(reason);
    const effect = Promise.resolve()
      .then(() => browser.close())
      .then(
        () => {
          if (this.browser === browser) {
            this.browser = null;
          }
          this.finishCleanup();
          this.dispatch(
            this.stopping ? { type: 'stop' } : { type: 'failed', reason },
          );
        },
        (error) => {
          this.cleanupUnconfirmed = true;
          this.finishCleanup();
          this.dispatch({
            type: 'cleanup_unconfirmed',
            reason: `Browser cleanup failed: ${String(error)}. Restart the runtime after checking the owned browser.`,
          });
          // Keep the failed cleanup effect as a gate: never open a second browser.
        },
      );
    this.flight = effect;
    void effect.finally(() => {
      if (this.flight === effect && this.state.cleanupConfirmed !== false) {
        this.flight = null;
      }
    });
  }
  private beginCleanup(reason: string) {
    if (this.cleanupDeadline) {
      return;
    }
    const timeoutMs = this.options.cleanupTimeoutMs ?? 30000;
    this.dispatch({ type: 'closing', reason, timeoutMs });
    this.cleanupDeadline = new Promise<never>((_resolve, reject) => {
      this.cleanupTimer = setTimeout(() => {
        this.dispatch({
          type: 'cleanup_unconfirmed',
          reason:
            'Browser cleanup deadline exceeded; ownership is retained until cleanup is confirmed.',
        });
        reject(
          Object.assign(
            new Error(
              'Browser cleanup is unconfirmed; workspace ownership is retained.',
            ),
            { code: 'cleanup_unconfirmed' },
          ),
        );
      }, timeoutMs);
    });
    void this.cleanupDeadline.catch(() => {});
  }
  private finishCleanup() {
    clearTimeout(this.cleanupTimer);
    this.cleanupTimer = undefined;
    this.cleanupDeadline = undefined;
  }
  whenStopped(): Promise<void> {
    return (
      this.stopped ??
      Promise.reject(new Error('Runtime shutdown has not started.'))
    );
  }
  stop(): Promise<void> {
    if (this.stopRequest) {
      return this.stopRequest;
    }
    this.stopping = true;
    clearTimeout(this.stableTimer);
    this.abort?.abort();
    if (this.browser && this.state.cleanupConfirmed !== false) {
      this.retire('Runtime is shutting down.');
    } else if (this.flight && !this.cleanupUnconfirmed) {
      this.beginCleanup('Cancelling browser launch.');
    }
    this.stopped = (async () => {
      if (this.flight) {
        await this.flight;
      }
      if (this.browser || this.cleanupUnconfirmed) {
        throw Object.assign(
          new Error(
            'Browser cleanup is unconfirmed; retaining workspace ownership.',
          ),
          { code: 'cleanup_unconfirmed' },
        );
      }
      this.finishCleanup();
      this.dispatch({ type: 'stop' });
    })();
    this.stopRequest = this.cleanupDeadline
      ? Promise.race([this.stopped, this.cleanupDeadline])
      : this.stopped;
    return this.stopRequest;
  }
}
