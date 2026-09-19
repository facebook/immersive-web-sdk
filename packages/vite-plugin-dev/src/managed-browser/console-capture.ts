/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { Page } from 'playwright';
import { errorMessage } from './internals.js';

/**
 * Log types for the server-side console capture.
 */
export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace';

export type BrowserEventKind =
  | 'console'
  | 'dialog'
  | 'download'
  | 'navigation'
  | 'pageerror'
  | 'popup'
  | 'requestfailed';

export interface CapturedLog {
  timestamp: number;
  level: LogLevel;
  message: string;
  args: string[];
  kind: BrowserEventKind;
  url?: string;
  frameUrl?: string;
  lineNumber?: number;
  columnNumber?: number;
  method?: string;
  resourceType?: string;
  failure?: string;
  repeatCount?: number;
}

export interface LogQuery {
  count?: number;
  level?: LogLevel | LogLevel[];
  pattern?: string;
  since?: number;
  until?: number;
}

const MAX_LOGS = 1000;

const DEFAULT_LOG_QUERY_COUNT = 100;

const MAX_LOG_QUERY_COUNT = 200;

const MAX_LOG_RESPONSE_BYTES = 256 * 1024;

const MAX_LOG_ARGUMENT_LENGTH = 4_000;

export const MAX_LOG_MESSAGE_LENGTH = 16_000;

export const MAX_CONSOLE_SERIALIZATION_JOBS = 100;

const TRACE_PREFIX = '[IWSDK-MCP-TRACE]';

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 14))}…[truncated]`;
}

/** Map Playwright console message types to our LogLevel. */
export const PLAYWRIGHT_TYPE_MAP: Record<string, LogLevel | undefined> = {
  log: 'log',
  info: 'info',
  warning: 'warn',
  error: 'error',
  debug: 'debug',
  trace: 'trace',
  assert: 'error',
};

/**
 * Server-side console capture that accumulates Playwright console events.
 */
class ServerSideConsoleCapture {
  private logs: CapturedLog[] = [];

  add(
    level: LogLevel,
    message: string,
    details: Partial<Omit<CapturedLog, 'timestamp' | 'level' | 'message'>> = {},
    timestamp = Date.now(),
  ): CapturedLog {
    message = truncateText(message, MAX_LOG_MESSAGE_LENGTH);
    const args = (details.args ?? [message])
      .slice(0, 10)
      .map((argument) => truncateText(argument, MAX_LOG_ARGUMENT_LENGTH));
    // Log compaction: if the last entry has the same level + message,
    // increment repeatCount instead of adding a new entry.
    const last = this.logs[this.logs.length - 1];
    const kind = details.kind ?? 'console';
    if (
      last &&
      last.level === level &&
      last.message === message &&
      last.kind === kind &&
      last.url === details.url &&
      last.frameUrl === details.frameUrl
    ) {
      last.repeatCount = (last.repeatCount ?? 1) + 1;
      last.timestamp = timestamp;
      return last;
    }

    const entry: CapturedLog = {
      timestamp,
      level,
      message,
      args,
      ...details,
      kind,
    };
    this.logs.push(entry);

    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }
    return entry;
  }

  updateArgs(entry: CapturedLog, args: string[]): void {
    if (!this.logs.includes(entry)) {
      return;
    }
    entry.args = args
      .slice(0, 10)
      .map((argument) => truncateText(argument, MAX_LOG_ARGUMENT_LENGTH));
  }

  query(options: LogQuery = {}): CapturedLog[] {
    let result = [...this.logs];

    if (options.level) {
      const levels = Array.isArray(options.level)
        ? options.level
        : [options.level];
      if (levels.length > 0) {
        result = result.filter((log) => levels.includes(log.level));
      }
    }

    if (options.since) {
      result = result.filter((log) => log.timestamp >= options.since!);
    }
    if (options.until) {
      result = result.filter((log) => log.timestamp <= options.until!);
    }

    if (options.pattern) {
      const regex = new RegExp(options.pattern, 'i');
      result = result.filter((log) => regex.test(log.message));
    }

    const count = Math.min(
      MAX_LOG_QUERY_COUNT,
      Math.max(1, options.count ?? DEFAULT_LOG_QUERY_COUNT),
    );
    result = result.slice(-count);

    const bounded: CapturedLog[] = [];
    let responseBytes = 2;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      const entry = result[index]!;
      const entryBytes = Buffer.byteLength(JSON.stringify(entry), 'utf8') + 1;
      if (responseBytes + entryBytes > MAX_LOG_RESPONSE_BYTES) {
        break;
      }
      bounded.unshift(entry);
      responseBytes += entryBytes;
    }

    return bounded;
  }
}

function createBoundedAsyncEnqueue(maxPending: number) {
  let pending = 0;
  let tail = Promise.resolve();
  return (operation: () => Promise<void>): boolean => {
    if (pending >= maxPending) {
      return false;
    }
    pending += 1;
    tail = tail
      .then(operation)
      .catch(() => {}) // Best-effort enrichment; keep synchronous fallback.
      .finally(() => {
        pending -= 1;
      });
    return true;
  };
}

interface BrowserEventProfiler {
  note(interruption: { at: number; kind: string; value?: string }): void;
}

/** Owns managed-page event listeners, redaction, storage, and log queries. */
export class ManagedBrowserConsole {
  private readonly capture = new ServerSideConsoleCapture();
  private readonly enqueueSerialization = createBoundedAsyncEnqueue(
    MAX_CONSOLE_SERIALIZATION_JOBS,
  );
  private readonly sensitiveValues: string[];

  constructor(
    private readonly page: Page,
    private readonly verbose: boolean,
    sensitiveValues: Array<string | null | undefined>,
  ) {
    this.sensitiveValues = sensitiveValues.filter((value): value is string =>
      Boolean(value),
    );
  }

  sanitize(value: string): string {
    let result = value;
    for (const sensitive of this.sensitiveValues) {
      result = result.split(sensitive).join('[redacted]');
    }
    return result;
  }

  attach(profiler: BrowserEventProfiler): void {
    const { page } = this;
    page.on('console', (msg) => {
      const type = msg.type() as string;
      const text = msg.text() as string;
      const level = PLAYWRIGHT_TYPE_MAP[type];

      if (level) {
        const timestamp = Date.now();
        const sanitizedText = this.sanitize(text);
        const location = msg.location();
        if (/\[vite\].*(hot updated|full reload)/i.test(text)) {
          profiler.note({ at: timestamp, kind: 'hmr', value: sanitizedText });
        }
        const handles = msg.args().slice(0, 10);
        const fallbackArgs = handles.map((argument) =>
          this.sanitize(argument.toString()),
        );
        const entry = this.capture.add(
          level,
          sanitizedText,
          {
            args: fallbackArgs.length > 0 ? fallbackArgs : [sanitizedText],
            columnNumber: location.columnNumber,
            frameUrl: location.url ? this.sanitize(location.url) : undefined,
            kind: 'console',
            lineNumber: location.lineNumber,
            url: location.url ? this.sanitize(location.url) : undefined,
          },
          timestamp,
        );
        this.enqueueSerialization(async () => {
          const args = await Promise.all(
            handles.map(async (argument) => {
              try {
                const value = await argument.jsonValue();
                const serialized = JSON.stringify(value);
                return this.sanitize(
                  serialized == null ? String(value) : serialized,
                );
              } catch {
                return this.sanitize(argument.toString());
              }
            }),
          );
          this.capture.updateArgs(
            entry,
            args.length > 0 ? args : [sanitizedText],
          );
        });
      }

      const sanitizedText = this.sanitize(text);
      if (type === 'error') {
        console.error('[browser]', sanitizedText);
      } else if (this.verbose || text.startsWith(TRACE_PREFIX)) {
        console.log(`[browser:${type}]`, sanitizedText);
      }
    });

    page.on('pageerror', (err) => {
      const text =
        err.stack || (err.name ? `${err.name}: ${err.message}` : err.message);
      const sanitizedText = this.sanitize(text);
      this.capture.add('error', `[uncaught] ${sanitizedText}`, {
        kind: 'pageerror',
        url: this.sanitize(page.url()),
      });
      console.error('[browser:pageerror]', sanitizedText);
    });

    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText ?? 'Request failed';
      const frameUrl = (() => {
        try {
          return request.frame().url();
        } catch {
          return undefined;
        }
      })();
      this.capture.add(
        'error',
        this.sanitize(`${request.method()} ${request.url()}: ${failure}`),
        {
          failure: this.sanitize(failure),
          frameUrl: frameUrl == null ? undefined : this.sanitize(frameUrl),
          kind: 'requestfailed',
          method: request.method(),
          resourceType: request.resourceType(),
          url: this.sanitize(request.url()),
        },
      );
    });

    page.on('dialog', (dialog) => {
      this.capture.add(
        'warn',
        this.sanitize(`${dialog.type()}: ${dialog.message()}`),
        {
          kind: 'dialog',
          url: this.sanitize(page.url()),
        },
      );
      void dialog.dismiss().catch(() => {});
    });

    page.on('download', (download) => {
      this.capture.add(
        'info',
        `Download started: ${download.suggestedFilename()}`,
        {
          kind: 'download',
          url: this.sanitize(download.url()),
        },
      );
    });

    page.on('popup', (popup) => {
      this.capture.add('info', this.sanitize(`Popup opened: ${popup.url()}`), {
        kind: 'popup',
        url: this.sanitize(popup.url()),
      });
    });

    page.on('framenavigated', (frame) => {
      profiler.note({
        at: Date.now(),
        kind: 'navigation',
        value: frame.url(),
      });
      this.capture.add(
        'info',
        this.sanitize(`Frame navigated: ${frame.url()}`),
        {
          frameUrl: this.sanitize(frame.url()),
          kind: 'navigation',
          url: this.sanitize(frame.url()),
        },
      );
    });
  }

  query(options?: LogQuery): CapturedLog[] {
    return this.capture.query(options);
  }

  warnRestoreFailure(operation: string, error: unknown): void {
    this.addInternalWarning(
      `${operation} succeeded, but the previous workspace view could not be restored: ${errorMessage(
        error,
      )}`,
    );
  }

  private addInternalWarning(message: string): void {
    const sanitized = truncateText(
      this.sanitize(message),
      MAX_LOG_MESSAGE_LENGTH,
    );
    this.capture.add('warn', sanitized, {
      args: [sanitized],
      kind: 'console',
    });
    console.warn('[browser]', sanitized);
  }
}
