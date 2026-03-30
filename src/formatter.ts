import chalk from 'chalk';
import { WatchEvent } from './watcher';
import {
  AppSummary,
  BuildConclusion,
  BuildSnapshot,
  BuildStepSummary,
  determineConclusion
} from './types';
import { formatDate, formatDuration } from './utils';

export interface JsonOutputOptions {
  json?: boolean;
  prettyJson?: boolean;
  includeRaw?: boolean;
}

export interface WatchOutputOptions extends JsonOutputOptions {
  quiet?: boolean;
}

export function printApps(apps: AppSummary[], options: JsonOutputOptions = {}): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        apps.map((app) => serializeApp(app, options.includeRaw ?? true)),
        null,
        options.prettyJson ? 2 : undefined
      )
    );
    return;
  }

  if (apps.length === 0) {
    console.log('No matching Codemagic apps found.');
    return;
  }

  for (const app of apps) {
    const lines = [
      `${label('App')}: ${app.appName ?? 'n/a'}`,
      `${label('ID')}: ${app.appId}`,
      `${label('Repository')}: ${app.repositoryUrl ?? 'n/a'}`,
      `${label('Workflows')}: ${app.workflowIds.length > 0 ? app.workflowIds.join(', ') : 'n/a'}`,
      `${label('Branches')}: ${app.branches.length > 0 ? app.branches.join(', ') : 'n/a'}`
    ];
    console.log(lines.join('\n'));
    console.log('');
  }
}

export function printBuildStarted(
  build: { buildId: string; appId: string; workflowId: string; branch?: string; tag?: string; raw?: Record<string, unknown> },
  options: JsonOutputOptions = {}
): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        options.includeRaw ? build : { ...build, raw: undefined },
        null,
        options.prettyJson ? 2 : undefined
      )
    );
    return;
  }

  console.log(
    [
      `${label('Build')}: ${build.buildId}`,
      `${label('App')}: ${build.appId}`,
      `${label('Workflow')}: ${build.workflowId}`,
      `${label('Branch')}: ${build.branch ?? 'n/a'}`,
      `${label('Tag')}: ${build.tag ?? 'n/a'}`
    ].join('\n')
  );
}

export function printBuildSteps(steps: BuildStepSummary[], options: JsonOutputOptions = {}): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        steps.map((step) => serializeStep(step, options.includeRaw ?? true)),
        null,
        options.prettyJson ? 2 : undefined
      )
    );
    return;
  }

  if (steps.length === 0) {
    console.log('No build steps found.');
    return;
  }

  for (const step of steps) {
    const lines = [
      `${label('Step')}: ${step.name ?? 'n/a'}`,
      `${label('ID')}: ${step.stepId}`,
      `${label('Status')}: ${step.status ?? 'pending'}`,
      `${label('Type')}: ${step.type ?? 'n/a'}`,
      `${label('Started')}: ${formatDate(step.startedAt)}`,
      `${label('Finished')}: ${formatDate(step.finishedAt)}`,
      `${label('Log')}: ${step.logUrl ?? 'n/a'}`
    ];
    console.log(lines.join('\n'));
    console.log('');
  }
}

export function printSnapshot(
  snapshot: BuildSnapshot,
  options: JsonOutputOptions = {}
): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        serializeSnapshot(snapshot, options.includeRaw ?? true),
        null,
        options.prettyJson ? 2 : undefined
      )
    );
    return;
  }

  const lines = [
    `${label('Build')}: ${snapshot.buildId}`,
    `${label('Status')}: ${colorizeConclusion(determineConclusion(snapshot))} (${snapshot.status ?? 'unknown'})`,
    `${label('Lifecycle')}: ${snapshot.lifecycleStatus ?? 'n/a'}`,
    `${label('Workflow')}: ${snapshot.workflowName ?? snapshot.workflowId ?? 'n/a'}`,
    `${label('Branch')}: ${snapshot.branch ?? 'n/a'}`,
    `${label('Commit')}: ${snapshot.commitSha ?? 'n/a'}`,
    `${label('Author')}: ${snapshot.commitAuthor ?? 'n/a'}`,
    `${label('Message')}: ${snapshot.commitMessage ?? snapshot.message ?? 'n/a'}`,
    `${label('Started')}: ${formatDate(snapshot.startedAt)}`,
    `${label('Finished')}: ${formatDate(snapshot.finishedAt)}`,
    `${label('Duration')}: ${formatDuration(snapshot.durationSeconds)}`
  ];

  console.log(lines.join('\n'));
}

export function printWatchEvent(event: WatchEvent, options: WatchOutputOptions = {}): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        serializeWatchEvent(event, options.includeRaw ?? false),
        null,
        options.prettyJson ? 2 : undefined
      )
    );
    return;
  }

  switch (event.type) {
    case 'snapshot':
      if (options.quiet && !event.changed) {
        return;
      }
      console.log(renderSnapshotLine(event.snapshot, event.changed, event.timestamp));
      break;
    case 'complete':
      console.log(renderCompletionLine(event.snapshot, event.conclusion, event.timestamp));
      break;
    case 'retry':
      console.error(
        chalk.yellow(
          `${event.timestamp} retry #${event.attempt}: ${event.error.message}`
        )
      );
      break;
    case 'timeout':
      console.error(
        chalk.red(
          `${event.timestamp} timeout after ${formatDuration(event.elapsedSeconds)}`
        )
      );
      break;
    default:
      break;
  }
}

export function serializeSnapshot(snapshot: BuildSnapshot, includeRaw: boolean): Record<string, unknown> {
  const { raw, ...rest } = snapshot;
  return includeRaw ? { ...rest, raw } : rest;
}

export function serializeWatchEvent(
  event: WatchEvent,
  includeRaw: boolean
): Record<string, unknown> {
  switch (event.type) {
    case 'snapshot':
      return {
        type: event.type,
        timestamp: event.timestamp,
        changed: event.changed,
        snapshot: serializeSnapshot(event.snapshot, includeRaw)
      };
    case 'complete':
      return {
        type: event.type,
        timestamp: event.timestamp,
        conclusion: event.conclusion,
        snapshot: serializeSnapshot(event.snapshot, includeRaw)
      };
    case 'retry':
      return {
        type: event.type,
        timestamp: event.timestamp,
        attempt: event.attempt,
        error: event.error.message
      };
    case 'timeout':
      return {
        type: event.type,
        timestamp: event.timestamp,
        elapsedSeconds: event.elapsedSeconds
      };
    default:
      return { type: 'unknown' };
  }
}

function serializeApp(app: AppSummary, includeRaw: boolean): Record<string, unknown> {
  const { raw, ...rest } = app;
  return includeRaw ? { ...rest, raw } : rest;
}

function serializeStep(step: BuildStepSummary, includeRaw: boolean): Record<string, unknown> {
  const { raw, ...rest } = step;
  return includeRaw ? { ...rest, raw } : rest;
}

function renderSnapshotLine(
  snapshot: BuildSnapshot,
  changed: boolean,
  timestamp: string
): string {
  const statusLabel = snapshot.status ?? snapshot.lifecycleStatus ?? 'unknown';
  const pieces = [
    chalk.gray(timestamp),
    changed ? chalk.bold(colorStatus(statusLabel)) : colorStatus(statusLabel),
    `build=${snapshot.buildId}`
  ];

  if (snapshot.workflowName || snapshot.workflowId) {
    pieces.push(`workflow=${snapshot.workflowName ?? snapshot.workflowId}`);
  }
  if (snapshot.branch) {
    pieces.push(`branch=${snapshot.branch}`);
  }
  if (snapshot.commitSha) {
    pieces.push(`sha=${snapshot.commitSha.slice(0, 8)}`);
  }
  if (snapshot.durationSeconds) {
    pieces.push(`duration=${formatDuration(snapshot.durationSeconds)}`);
  }
  if (snapshot.message ?? snapshot.commitMessage) {
    pieces.push(`msg="${(snapshot.message ?? snapshot.commitMessage ?? '').slice(0, 80)}"`);
  }

  return pieces.join(' ');
}

function renderCompletionLine(
  snapshot: BuildSnapshot,
  conclusion: BuildConclusion,
  timestamp: string
): string {
  return `${chalk.gray(timestamp)} ${chalk.bold(
    colorizeConclusion(conclusion)
  )} build=${snapshot.buildId} workflow=${snapshot.workflowName ?? snapshot.workflowId ?? 'n/a'} duration=${formatDuration(
    snapshot.durationSeconds
  )}`;
}

function label(value: string): string {
  return chalk.cyan(value);
}

function colorStatus(value: string): string {
  const normalized = value.toLowerCase();
  if (['finished', 'success', 'passed'].includes(normalized)) {
    return chalk.green(value);
  }
  if (['failed', 'failure', 'errored', 'error'].includes(normalized)) {
    return chalk.red(value);
  }
  if (['canceled', 'cancelled', 'stopped'].includes(normalized)) {
    return chalk.yellow(value);
  }
  return chalk.blue(value);
}

function colorizeConclusion(conclusion: BuildConclusion): string {
  switch (conclusion) {
    case 'success':
      return chalk.green(conclusion);
    case 'failed':
      return chalk.red(conclusion);
    case 'canceled':
      return chalk.yellow(conclusion);
    default:
      return chalk.gray(conclusion);
  }
}
