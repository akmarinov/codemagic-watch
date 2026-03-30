export interface CodemagicBuild {
  _id?: string;
  id?: string;
  buildId?: string;
  build_id?: string;
  appId?: string;
  app_id?: string;
  workflowId?: string;
  workflow_id?: string;
  workflowName?: string;
  workflow_name?: string;
  workflow?: string;
  branch?: string;
  git_branch?: string;
  message?: string;
  status?: string;
  status_text?: string;
  lifecycle_status?: string;
  result?: string;
  outcome?: string;
  phase?: string;
  state?: string;
  started_at?: string;
  startedAt?: string;
  finished_at?: string;
  finishedAt?: string;
  queued_at?: string;
  queuedAt?: string;
  created_at?: string;
  createdAt?: string;
  commit?: Record<string, unknown>;
  buildActions?: CodemagicBuildAction[];
  [key: string]: unknown;
}

export interface CodemagicBuildAction {
  _id?: string;
  id?: string;
  name?: string;
  type?: string | null;
  status?: string | null;
  startedAt?: string;
  started_at?: string;
  finishedAt?: string;
  finished_at?: string;
  logUrl?: string | null;
  log_url?: string | null;
  subactions?: CodemagicBuildAction[];
  [key: string]: unknown;
}

export interface CodemagicApp {
  _id?: string;
  id?: string;
  appName?: string;
  app_name?: string;
  repositoryUrl?: string;
  repository_url?: string;
  repository?: {
    url?: string;
    [key: string]: unknown;
  };
  workflowIds?: string[];
  workflow_ids?: string[];
  branches?: string[];
  [key: string]: unknown;
}

export interface AppSummary {
  appId: string;
  appName?: string;
  repositoryUrl?: string;
  workflowIds: string[];
  branches: string[];
  raw: CodemagicApp;
}

export interface BuildStepSummary {
  stepId: string;
  name?: string;
  type?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string;
  logUrl?: string;
  raw: CodemagicBuildAction;
}

export interface BuildSnapshot {
  buildId: string;
  status?: string;
  lifecycleStatus?: string;
  result?: string;
  workflowId?: string;
  workflowName?: string;
  appId?: string;
  branch?: string;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
  queuedAt?: string;
  durationSeconds?: number;
  commitSha?: string;
  commitMessage?: string;
  commitAuthor?: string;
  raw: CodemagicBuild;
}

export type BuildConclusion = 'success' | 'failed' | 'canceled' | 'unknown';

const TERMINAL_KEYWORDS = new Set([
  'finished',
  'failed',
  'failure',
  'success',
  'passed',
  'canceled',
  'cancelled',
  'stopped',
  'stopping',
  'errored',
  'error',
  'aborted'
]);

const FAILURE_KEYWORDS = new Set(['failed', 'failure', 'errored', 'error', 'blocked']);
const SUCCESS_KEYWORDS = new Set(['finished', 'success', 'passed', 'succeeded']);
const CANCELED_KEYWORDS = new Set(['canceled', 'cancelled', 'stopped', 'aborted']);

export function normalizeBuild(build: CodemagicBuild): BuildSnapshot {
  const buildId =
    pickString(build, '_id', 'id', 'buildId', 'build_id') ?? pickString(build, 'build') ?? '';
  if (!buildId) {
    throw new Error('Build payload is missing an identifier (_id).');
  }

  const workflowId = pickString(build, 'workflowId', 'workflow_id');
  const workflowName = pickString(build, 'workflowName', 'workflow_name', 'workflow');
  const appId = pickString(build, 'appId', 'app_id');
  const status = pickString(build, 'status');
  const lifecycleStatus = pickString(
    build,
    'lifecycle_status',
    'status_text',
    'phase',
    'state'
  );
  const result = pickString(build, 'result', 'outcome');
  const branch = pickString(build, 'branch', 'git_branch') ?? pickString(build.commit ?? {}, 'branch');
  const message = pickString(build, 'message');
  const startedAt = coerceIsoString(pickString(build, 'startedAt', 'started_at'));
  const finishedAt = coerceIsoString(pickString(build, 'finishedAt', 'finished_at'));
  const queuedAt = coerceIsoString(pickString(build, 'queuedAt', 'queued_at', 'created_at', 'createdAt'));
  const commitSha = pickString(
    build,
    'commit_sha',
    'commitSha',
    'commit_id',
    'commitId',
    'commit_hash'
  ) ?? pickString(build.commit ?? {}, 'sha', 'hash', 'id');
  const commitMessage =
    pickString(build.commit ?? {}, 'message') ?? pickString(build, 'commit_message');
  const commitAuthor =
    pickString(build.commit ?? {}, 'author', 'committer') ??
    pickString(build, 'commit_author', 'author');

  const durationSeconds =
    startedAt && finishedAt
      ? computeDurationSeconds(startedAt, finishedAt)
      : undefined;

  return {
    buildId,
    status,
    lifecycleStatus,
    result,
    workflowId,
    workflowName,
    appId,
    branch,
    message: message ?? commitMessage,
    startedAt,
    finishedAt,
    queuedAt,
    durationSeconds,
    commitSha,
    commitMessage,
    commitAuthor,
    raw: build
  };
}

export function normalizeApp(app: CodemagicApp): AppSummary {
  const appId = pickString(app, '_id', 'id') ?? '';
  if (!appId) {
    throw new Error('App payload is missing an identifier (_id).');
  }

  return {
    appId,
    appName: pickString(app, 'appName', 'app_name'),
    repositoryUrl:
      pickString(app, 'repositoryUrl', 'repository_url') ?? pickString(app.repository ?? {}, 'url'),
    workflowIds: pickStringArray(app, 'workflowIds', 'workflow_ids'),
    branches: pickStringArray(app, 'branches'),
    raw: app
  };
}

export function listBuildSteps(build: BuildSnapshot | CodemagicBuild): BuildStepSummary[] {
  const rawBuild = isBuildSnapshot(build) ? build.raw : build;
  const actions = Array.isArray(rawBuild.buildActions) ? rawBuild.buildActions : [];
  return actions
    .map((action) => normalizeBuildStep(action))
    .filter((step): step is BuildStepSummary => step !== undefined);
}

export function normalizeBuildStep(action: CodemagicBuildAction): BuildStepSummary | undefined {
  const stepId = pickString(action, '_id', 'id');
  if (!stepId) {
    return undefined;
  }

  return {
    stepId,
    name: pickString(action, 'name'),
    type: pickString(action, 'type'),
    status: pickString(action, 'status'),
    startedAt: coerceIsoString(pickString(action, 'startedAt', 'started_at')),
    finishedAt: coerceIsoString(pickString(action, 'finishedAt', 'finished_at')),
    logUrl: pickString(action, 'logUrl', 'log_url'),
    raw: action
  };
}

export function determineConclusion(snapshot: BuildSnapshot): BuildConclusion {
  const tokens = collectTokens(snapshot);
  if (tokens.some((token) => FAILURE_KEYWORDS.has(token))) {
    return 'failed';
  }
  if (tokens.some((token) => CANCELED_KEYWORDS.has(token))) {
    return 'canceled';
  }
  if (tokens.some((token) => SUCCESS_KEYWORDS.has(token))) {
    return 'success';
  }
  return 'unknown';
}

export function isTerminalSnapshot(snapshot: BuildSnapshot): boolean {
  return collectTokens(snapshot).some((token) => TERMINAL_KEYWORDS.has(token));
}

function pickString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = source[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function pickStringArray(source: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const candidate = source[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    }
  }
  return [];
}

function coerceIsoString(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function computeDurationSeconds(startedAtIso: string, finishedAtIso: string): number | undefined {
  const started = Date.parse(startedAtIso);
  const finished = Date.parse(finishedAtIso);
  if (Number.isNaN(started) || Number.isNaN(finished)) {
    return undefined;
  }
  const delta = Math.max(finished - started, 0);
  return Math.round(delta / 1000);
}

function isBuildSnapshot(value: BuildSnapshot | CodemagicBuild): value is BuildSnapshot {
  return 'raw' in value;
}

function collectTokens(snapshot: BuildSnapshot): string[] {
  const raw = snapshot.raw ?? {};
  return [
    snapshot.result,
    snapshot.status,
    snapshot.lifecycleStatus,
    typeof raw.status_text === 'string' ? raw.status_text : undefined,
    typeof raw.state === 'string' ? raw.state : undefined
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
}
