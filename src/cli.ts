#!/usr/bin/env node
import { Command } from 'commander';
import packageJson from '../package.json';
import { CodemagicClient } from './client';
import { printSnapshot, printWatchEvent } from './formatter';
import { watchBuild } from './watcher';
import { ensureToken, parseBuildIdentifier, toNumber } from './utils';

const program = new Command();

program
  .name('codemagic-watch')
  .description('Poll Codemagic builds, stream status changes, and react to failures.')
  .version(packageJson.version);

addGetCommand();
addWatchCommand();

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

function createClient(options: Record<string, string | boolean | undefined>): CodemagicClient {
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

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
