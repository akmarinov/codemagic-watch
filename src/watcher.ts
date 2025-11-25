import { CodemagicClient } from './client';
import {
  BuildSnapshot,
  determineConclusion,
  isTerminalSnapshot
} from './types';
import { delay } from './utils';

export interface WatchBuildOptions {
  client: CodemagicClient;
  buildId: string;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  maxErrorCount?: number;
}

export type WatchEvent =
  | {
      type: 'snapshot';
      snapshot: BuildSnapshot;
      changed: boolean;
      timestamp: string;
    }
  | {
      type: 'complete';
      snapshot: BuildSnapshot;
      conclusion: ReturnType<typeof determineConclusion>;
      timestamp: string;
    }
  | {
      type: 'retry';
      error: Error;
      attempt: number;
      timestamp: string;
    }
  | {
      type: 'timeout';
      elapsedSeconds: number;
      timestamp: string;
    };

export async function* watchBuild(
  options: WatchBuildOptions
): AsyncGenerator<WatchEvent, void, unknown> {
  const intervalMs = Math.max(1, Math.round(options.intervalSeconds ?? 10)) * 1000;
  const timeoutMs =
    typeof options.timeoutSeconds === 'number' && options.timeoutSeconds > 0
      ? options.timeoutSeconds * 1000
      : undefined;
  const maxErrors = Math.max(1, options.maxErrorCount ?? 5);
  const start = Date.now();
  let consecutiveErrors = 0;
  let previousSignature: string | undefined;

  while (true) {
    if (timeoutMs && Date.now() - start >= timeoutMs) {
      yield {
        type: 'timeout',
        elapsedSeconds: Math.round((Date.now() - start) / 1000),
        timestamp: new Date().toISOString()
      };
      return;
    }

    try {
      const snapshot = await options.client.getBuild(options.buildId);
      consecutiveErrors = 0;
      const signature = signatureForSnapshot(snapshot);
      const changed = signature !== previousSignature;
      previousSignature = signature;

      yield {
        type: 'snapshot',
        snapshot,
        changed,
        timestamp: new Date().toISOString()
      };

      if (isTerminalSnapshot(snapshot)) {
        yield {
          type: 'complete',
          snapshot,
          conclusion: determineConclusion(snapshot),
          timestamp: new Date().toISOString()
        };
        return;
      }
    } catch (error) {
      consecutiveErrors += 1;
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      yield {
        type: 'retry',
        error: normalizedError,
        attempt: consecutiveErrors,
        timestamp: new Date().toISOString()
      };
      if (consecutiveErrors > maxErrors) {
        throw normalizedError;
      }
    }

    await delay(intervalMs);
  }
}

function signatureForSnapshot(snapshot: BuildSnapshot): string {
  return [
    snapshot.status?.toLowerCase() ?? '',
    snapshot.lifecycleStatus?.toLowerCase() ?? '',
    snapshot.result?.toLowerCase() ?? ''
  ].join(':');
}
