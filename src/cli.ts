#!/usr/bin/env node
import { Command } from 'commander';
import packageJson from '../package.json';
import { CodemagicClient } from './client';
import {
  printApps,
  printBuildStarted,
  printBuildSteps,
  printSnapshot,
  printWatchEvent
} from './formatter';
import { listBuildSteps } from './types';
import { watchBuild } from './watcher';
import { ensureToken, parseBuildIdentifier, parseStepIdentifier, toNumber } from './utils';

const program = new Command();

program
  .name('codemagic-watch')
  .description('Poll Codemagic builds, stream status changes, and react to failures.')
  .version(packageJson.version);

addGetCommand();
addWatchCommand();
addAppsCommand();
addStartCommand();
addStepsCommand();
addLogCommand();

program
  .parseAsync(process.argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });

function addGetCommand(): void {
  program
    .command('get')
    .argument('<build-id-or-url>', 'Codemagic build ID (or full https://codemagic.io/app/... URL).')
    .option('-t, --token <token>', 'Codemagic API token (or set CODEMAGIC_TOKEN).')
    .option('--base-url <url>', 'Override API base URL (default https://api.codemagic.io).')
    .option('--json', 'Emit JSON output.', false)
    .option('--pretty', 'Pretty-print JSON.', false)
    .option('--raw', 'Include raw Codemagic payload when using --json.', false)
    .description('Fetch a single build snapshot.')
    .action(async (input: string, options: Record<string, string | boolean | undefined>) => {
      const client = createClient(options);
      const buildId = parseBuildIdentifier(input);
      const snapshot = await client.getBuild(buildId);
      printSnapshot(snapshot, {
        json: Boolean(options.json),
        prettyJson: Boolean(options.pretty),
        includeRaw: Boolean(options.raw)
      });
    });
}

function addWatchCommand(): void {
  program
    .command('watch')
    .argument('<build-id-or-url>', 'Codemagic build ID (or build URL).')
    .description('Watch a Codemagic build until it completes and emit status changes.')
    .option('-i, --interval <seconds>', 'Polling interval in seconds (default: 10).')
    .option('--timeout <seconds>', 'Abort after N seconds (0 disables timeout).')
    .option('--max-errors <count>', 'Allowed consecutive API failures before exiting (default: 5).')
    .option('-t, --token <token>', 'Codemagic API token (or set CODEMAGIC_TOKEN).')
    .option('--base-url <url>', 'Override API base URL (default https://api.codemagic.io).')
    .option('--json', 'Emit newline-delimited JSON events.', false)
    .option('--pretty', 'Pretty-print JSON.', false)
    .option('--raw', 'Include raw payloads inside JSON events.', false)
    .option('--quiet', 'Only show status changes (non-JSON mode).', false)
    .action(async (input: string, options: Record<string, string | boolean | undefined>) => {
      const buildId = parseBuildIdentifier(input);
      const client = createClient(options);
      const intervalSeconds = clampPositive(toNumber(options.interval as string | undefined, 10), 1);
      const timeoutSeconds = toNumber(options.timeout as string | undefined, 0);
      const maxErrors = clampPositive(toNumber(options.maxErrors as string | undefined, 5), 1);
      const json = Boolean(options.json);
      const quiet = Boolean(options.quiet);
      const pretty = Boolean(options.pretty);
      const includeRaw = Boolean(options.raw);

      try {
        for await (const event of watchBuild({
          client,
          buildId,
          intervalSeconds,
          timeoutSeconds: timeoutSeconds > 0 ? timeoutSeconds : undefined,
          maxErrorCount: maxErrors
        })) {
          if (event.type === 'snapshot') {
            printWatchEvent(event, { json, prettyJson: pretty, includeRaw, quiet });
          } else {
            printWatchEvent(event, { json, prettyJson: pretty, includeRaw, quiet: false });
            if (event.type === 'complete') {
              setExitCode(event.conclusion);
              return;
            }
            if (event.type === 'timeout') {
              process.exitCode = 4;
              return;
            }
          }
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}

function addAppsCommand(): void {
  program
    .command('apps')
    .argument('[query]', 'Optional case-insensitive filter by app name, app id, or repository URL.')
    .description('List Codemagic apps available to the authenticated user.')
    .option('-t, --token <token>', 'Codemagic API token (or set CODEMAGIC_TOKEN).')
    .option('--base-url <url>', 'Override API base URL (default https://api.codemagic.io).')
    .option('--json', 'Emit JSON output.', false)
    .option('--pretty', 'Pretty-print JSON.', false)
    .option('--raw', 'Include raw Codemagic payload when using --json.', false)
    .action(async (query: string | undefined, options: Record<string, string | boolean | undefined>) => {
      const client = createClient(options);
      const apps = await client.listApps();
      const filtered = filterApps(apps, query);
      printApps(filtered, {
        json: Boolean(options.json),
        prettyJson: Boolean(options.pretty),
        includeRaw: Boolean(options.raw)
      });
    });
}

function addStartCommand(): void {
  program
    .command('start')
    .description('Start a new Codemagic build.')
    .requiredOption('--app <app-id>', 'Codemagic app id.')
    .requiredOption('--workflow <workflow-id>', 'Workflow id as defined in codemagic.yaml.')
    .option('--branch <branch>', 'Branch to build.')
    .option('--tag <tag>', 'Tag to build.')
    .option('--label <label>', 'Attach a label to the build. Repeat to add more.', collectStringValues, [])
    .option('--group <name>', 'Add an environment variable group override. Repeat to add more.', collectStringValues, [])
    .option('--var <KEY=VALUE>', 'Set an environment variable override. Repeat to add more.', collectStringValues, [])
    .option('--xcode <version>', 'Override Xcode version for this build.')
    .option('--instance-type <type>', 'Override instance type, e.g. mac_mini_m2.')
    .option('--watch', 'Watch the build after starting it.', false)
    .option('-i, --interval <seconds>', 'Polling interval in seconds when using --watch (default: 10).')
    .option('--timeout <seconds>', 'Abort after N seconds when using --watch (0 disables timeout).')
    .option('--max-errors <count>', 'Allowed consecutive API failures when using --watch (default: 5).')
    .option('--quiet', 'Only show status changes while watching (non-JSON mode only).', false)
    .option('-t, --token <token>', 'Codemagic API token (or set CODEMAGIC_TOKEN).')
    .option('--base-url <url>', 'Override API base URL (default https://api.codemagic.io).')
    .option('--json', 'Emit JSON output.', false)
    .option('--pretty', 'Pretty-print JSON.', false)
    .option('--raw', 'Include raw Codemagic payload when using --json.', false)
    .action(async (options: Record<string, unknown>) => {
      const appId = typeof options.app === 'string' ? options.app.trim() : '';
      const workflowId = typeof options.workflow === 'string' ? options.workflow.trim() : '';
      const branch = typeof options.branch === 'string' ? options.branch.trim() : undefined;
      const tag = typeof options.tag === 'string' ? options.tag.trim() : undefined;

      if (!branch && !tag) {
        throw new Error('Either --branch or --tag is required.');
      }
      if (branch && tag) {
        throw new Error('Pass only one of --branch or --tag.');
      }

      const client = createClient(options);
      const labels = normalizeStringArray(options.label as string | boolean | string[] | undefined);
      const groups = normalizeStringArray(options.group as string | boolean | string[] | undefined);
      const variables = parseKeyValuePairs(
        normalizeStringArray(options.var as string | boolean | string[] | undefined)
      );
      const xcode = typeof options.xcode === 'string' ? options.xcode.trim() : undefined;
      const instanceType =
        typeof options.instanceType === 'string' ? options.instanceType.trim() : undefined;

      const started = await client.startBuild({
        appId,
        workflowId,
        branch,
        tag,
        labels: labels.length > 0 ? labels : undefined,
        environment:
          groups.length > 0 || Object.keys(variables).length > 0 || xcode
            ? {
                groups: groups.length > 0 ? groups : undefined,
                variables: Object.keys(variables).length > 0 ? variables : undefined,
                softwareVersions: xcode ? { xcode } : undefined
              }
            : undefined,
        instanceType
      });

      printBuildStarted(
        {
          buildId: started.buildId,
          appId,
          workflowId,
          branch,
          tag,
          raw: started.raw
        },
        {
          json: Boolean(options.json),
          prettyJson: Boolean(options.pretty),
          includeRaw: Boolean(options.raw)
        }
      );

      if (Boolean(options.watch)) {
        await runWatch(started.buildId, client, options);
      }
    });
}

function addStepsCommand(): void {
  program
    .command('steps')
    .argument('<build-id-or-url>', 'Codemagic build ID (or build URL).')
    .description('List normalized build steps/actions for a build.')
    .option('-t, --token <token>', 'Codemagic API token (or set CODEMAGIC_TOKEN).')
    .option('--base-url <url>', 'Override API base URL (default https://api.codemagic.io).')
    .option('--json', 'Emit JSON output.', false)
    .option('--pretty', 'Pretty-print JSON.', false)
    .option('--raw', 'Include raw Codemagic payload when using --json.', false)
    .action(async (input: string, options: Record<string, string | boolean | undefined>) => {
      const client = createClient(options);
      const buildId = parseBuildIdentifier(input);
      const snapshot = await client.getBuild(buildId);
      printBuildSteps(listBuildSteps(snapshot), {
        json: Boolean(options.json),
        prettyJson: Boolean(options.pretty),
        includeRaw: Boolean(options.raw)
      });
    });
}

function addLogCommand(): void {
  program
    .command('log')
    .argument('<build-id-or-url>', 'Codemagic build ID (or build URL).')
    .argument('<step-id-or-name-or-url>', 'Step id, step API URL, or exact step name.')
    .description('Fetch the raw log output for a specific build step.')
    .option('-t, --token <token>', 'Codemagic API token (or set CODEMAGIC_TOKEN).')
    .option('--base-url <url>', 'Override API base URL (default https://api.codemagic.io).')
    .action(async (buildInput: string, stepInput: string, options: Record<string, string | boolean | undefined>) => {
      const client = createClient(options);
      const buildId = parseBuildIdentifier(buildInput);
      const snapshot = await client.getBuild(buildId);
      const steps = listBuildSteps(snapshot);
      const resolvedStepId = resolveStepId(steps, stepInput);
      const log = await client.getStepLog(buildId, resolvedStepId);
      process.stdout.write(log.endsWith('\n') ? log : `${log}\n`);
    });
}

function createClient(options: Record<string, unknown>): CodemagicClient {
  const tokenFromOptions = typeof options.token === 'string' ? options.token : undefined;
  const baseUrlOption = typeof options.baseUrl === 'string' ? options.baseUrl : undefined;
  const token = ensureToken(tokenFromOptions ?? process.env.CODEMAGIC_TOKEN);
  const baseUrl = baseUrlOption ?? process.env.CODEMAGIC_BASE_URL;
  return new CodemagicClient({
    token,
    baseUrl,
    userAgent: `codemagic-watch/${packageJson.version}`
  });
}

async function runWatch(
  buildId: string,
  client: CodemagicClient,
  options: Record<string, unknown>
): Promise<void> {
  const intervalSeconds = clampPositive(toNumber(options.interval as string | undefined, 10), 1);
  const timeoutSeconds = toNumber(options.timeout as string | undefined, 0);
  const maxErrors = clampPositive(toNumber(options.maxErrors as string | undefined, 5), 1);
  const json = Boolean(options.json);
  const quiet = Boolean(options.quiet);
  const pretty = Boolean(options.pretty);
  const includeRaw = Boolean(options.raw);

  for await (const event of watchBuild({
    client,
    buildId,
    intervalSeconds,
    timeoutSeconds: timeoutSeconds > 0 ? timeoutSeconds : undefined,
    maxErrorCount: maxErrors
  })) {
    if (event.type === 'snapshot') {
      printWatchEvent(event, { json, prettyJson: pretty, includeRaw, quiet });
      continue;
    }

    printWatchEvent(event, { json, prettyJson: pretty, includeRaw, quiet: false });
    if (event.type === 'complete') {
      setExitCode(event.conclusion);
      return;
    }
    if (event.type === 'timeout') {
      process.exitCode = 4;
      return;
    }
  }
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function collectStringValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function normalizeStringArray(value: string | boolean | string[] | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function parseKeyValuePairs(entries: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const delimiterIndex = entry.indexOf('=');
    if (delimiterIndex <= 0) {
      throw new Error(`Invalid --var value "${entry}". Expected KEY=VALUE.`);
    }
    const key = entry.slice(0, delimiterIndex).trim();
    const value = entry.slice(delimiterIndex + 1);
    if (!key) {
      throw new Error(`Invalid --var value "${entry}". Key must not be empty.`);
    }
    result[key] = value;
  }
  return result;
}

function filterApps(
  apps: Awaited<ReturnType<CodemagicClient['listApps']>>,
  query?: string
): Awaited<ReturnType<CodemagicClient['listApps']>> {
  if (!query || !query.trim()) {
    return apps;
  }
  const needle = query.trim().toLowerCase();
  return apps.filter((app) =>
    [app.appId, app.appName, app.repositoryUrl].some(
      (value) => typeof value === 'string' && value.toLowerCase().includes(needle)
    )
  );
}

function resolveStepId(steps: ReturnType<typeof listBuildSteps>, input: string): string {
  const directId = parseStepIdentifier(input);
  const byId = steps.find((step) => step.stepId === directId);
  if (byId) {
    return byId.stepId;
  }

  const needle = input.trim().toLowerCase();
  const byName = steps.find((step) => (step.name ?? '').trim().toLowerCase() === needle);
  if (byName) {
    return byName.stepId;
  }

  const available = steps.map((step) => `${step.name ?? 'n/a'} (${step.stepId})`).join(', ');
  throw new Error(`Could not resolve step "${input}". Available steps: ${available || 'none'}`);
}

function setExitCode(conclusion: string): void {
  switch (conclusion) {
    case 'success':
      process.exitCode = 0;
      return;
    case 'failed':
      process.exitCode = 2;
      return;
    case 'canceled':
      process.exitCode = 3;
      return;
    default:
      process.exitCode = 1;
  }
}
