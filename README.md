# Codemagic Watch

Tiny CLI helper that polls the [Codemagic REST API](https://api.codemagic.io/) for build metadata, streams status changes, and exits with meaningful codes so other tooling (like the Codex CLI) can react automatically.

## Requirements

- Node.js 18 or newer for local development from source.
- A Codemagic API token from **Codemagic UI → User settings → Integrations → Codemagic API**.

## Install & configure

### Homebrew

Once the Homebrew formula is available in `rosseca/tap`, install it with:

```bash
brew tap rosseca/tap
brew install codemagic-watch
export CODEMAGIC_TOKEN=cmg_api_token_here
```

### Prebuilt binaries

Release archives contain a single `codemagic-watch` executable and do not require Node.js at runtime.

### From source

```bash
cd codemagic-watcher
npm install
npm run build
export CODEMAGIC_TOKEN=cmg_api_token_here
```

You can also point to self-hosted gateways via `CODEMAGIC_BASE_URL` if needed.

### Global install from this repo (no npm publish needed)

```bash
npm install -g git+https://github.com/akmarinov/codemagic-watch.git
# or from a local checkout
cd codemagic-watcher && npm install && npm run build && npm link
```

## Packaging releases

This repository can publish standalone Bun executables for:

- macOS arm64
- macOS x64
- Linux arm64
- Linux x64

Build release archives locally with:

```bash
bun install
./scripts/build-release.sh
```

This writes tarballs and `SHA256SUMS.txt` into `release/`, using the version from `package.json`.

## Commands

### `codemagic-watch get <build-id-or-url>`

Fetches the latest snapshot for a build. Accepts either the raw build ID (e.g. `6632d9fa8e3d2a0012f7f123`) or any Codemagic build URL. Example:

```bash
codemagic-watch get https://codemagic.io/app/<app-id>/build/<build-id>
codemagic-watch get <build-id> --json --pretty --raw
```

### `codemagic-watch watch <build-id-or-url>`

Polls `GET /builds/:id` at a configurable interval (default 10s), emits log-friendly lines on every change, and terminates when the build finishes or errors. Useful flags:

| Flag | Description |
| ---- | ----------- |
| `-i, --interval <seconds>` | Poll cadence (min 1s, default 10s). |
| `--timeout <seconds>` | Hard-stop after N seconds (0 disables). |
| `--max-errors <count>` | Consecutive request failures allowed before exiting (default 5). |
| `--json` | Emits newline-delimited JSON events for easy piping into Codex workflows. |
| `--quiet` | Suppress unchanged status logs (non-JSON mode only). |
| `--raw` | Include the original Codemagic payload in JSON events/snapshots. |

Example: stream events into Codex CLI and send alerts when something fails.

```bash
codemagic-watch watch https://codemagic.io/app/<app-id>/build/<build-id> \
  --json \
  | codex events --source codemagic --on 'event.type=="complete" && event.conclusion!="success"' \
    --run 'codex notify --channel mobile-builds --message "Codemagic build {event.snapshot.buildId} failed"'
```

## JSON event schema

When `--json` is used, each line is a JSON document in one of the following shapes:

```ts
type SnapshotEvent = {
  type: 'snapshot';
  timestamp: string;
  changed: boolean;
  snapshot: {
    buildId: string;
    status?: string;
    lifecycleStatus?: string;
    result?: string;
    workflowId?: string;
    workflowName?: string;
    branch?: string;
    commitSha?: string;
    commitMessage?: string;
    durationSeconds?: number;
    raw?: CodemagicBuildPayload; // present only with --raw
  };
};

type CompleteEvent = {
  type: 'complete';
  timestamp: string;
  conclusion: 'success' | 'failed' | 'canceled' | 'unknown';
  snapshot: SnapshotEvent['snapshot'];
};

type RetryEvent = { type: 'retry'; timestamp: string; attempt: number; error: string };
type TimeoutEvent = { type: 'timeout'; timestamp: string; elapsedSeconds: number };
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| 0 | Build finished successfully. |
| 1 | Unknown state or unrecoverable error. |
| 2 | Build finished/failed. |
| 3 | Build canceled. |
| 4 | Watch timed out before completion. |

These codes let you compose shell-level automations (e.g., `codemagic-watch watch ... && codex run ...`).

## Notes & roadmap

- Builds API is still in preview on Codemagic, so some fields may change without notice. The CLI normalizes the current payload but also exposes `raw` for forward compatibility.
- Future ideas: follow the *latest* build for a workflow, run shell hooks (`--on-complete`), and expose `list` support once Codemagic documents the necessary endpoints.
