import {
  AppSummary,
  BuildSnapshot,
  CodemagicApp,
  CodemagicBuild,
  normalizeApp,
  normalizeBuild
} from './types';

export interface CodemagicClientOptions {
  token: string;
  baseUrl?: string;
  userAgent?: string;
}

const DEFAULT_BASE_URL = 'https://api.codemagic.io';
const DEFAULT_USER_AGENT = 'codemagic-watch';

export class CodemagicClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(options: CodemagicClientOptions) {
    this.token = options.token;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async getBuild(buildId: string): Promise<BuildSnapshot> {
    const response = await this.request<{ build?: CodemagicBuild } | CodemagicBuild>(
      `/builds/${buildId}`
    );
    const build = (response as { build?: CodemagicBuild }).build ?? (response as CodemagicBuild);
    return normalizeBuild(build);
  }

  async listApps(): Promise<AppSummary[]> {
    const response = await this.request<{ applications?: CodemagicApp[] } | CodemagicApp[]>('/apps');
    const apps = Array.isArray(response)
      ? response
      : Array.isArray(response.applications)
        ? response.applications
        : [];
    return apps.map((app) => normalizeApp(app));
  }

  async startBuild(input: {
    appId: string;
    workflowId: string;
    branch?: string;
    tag?: string;
    labels?: string[];
    environment?: {
      variables?: Record<string, string>;
      groups?: string[];
      softwareVersions?: Record<string, string>;
    };
    instanceType?: string;
  }): Promise<{ buildId: string; raw: Record<string, unknown> }> {
    const response = await this.request<{ buildId?: string; build_id?: string } & Record<string, unknown>>(
      '/builds',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      }
    );

    const buildId = response.buildId ?? response.build_id;
    if (typeof buildId !== 'string' || !buildId.trim()) {
      throw new Error('Build start response did not include a buildId.');
    }

    return { buildId, raw: response };
  }

  async getStepLog(buildId: string, stepId: string): Promise<string> {
    return this.requestText(`/builds/${buildId}/step/${stepId}`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const target = `${this.baseUrl}${path}`;
    const headers: HeadersInit = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
      'User-Agent': this.userAgent,
      ...init.headers
    };

    const response = await fetch(target, {
      ...init,
      headers
    });

    if (!response.ok) {
      const payload = await safeReadJson(response);
      const detail =
        payload && typeof payload === 'object'
          ? JSON.stringify(payload)
          : await response.text();
      throw new Error(
        `Codemagic API ${response.status} ${response.statusText} for ${path}: ${detail}`
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  private async requestText(path: string, init: RequestInit = {}): Promise<string> {
    const response = await this.fetch(path, init);
    return response.text();
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const target = `${this.baseUrl}${path}`;
    const headers: HeadersInit = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
      'User-Agent': this.userAgent,
      ...init.headers
    };

    const response = await fetch(target, {
      ...init,
      headers
    });

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(`Codemagic API ${response.status} ${response.statusText} for ${path}: ${detail}`);
    }

    return response;
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  const clone = response.clone();
  const payload = await safeReadJson(clone);
  if (payload && typeof payload === 'object') {
    return JSON.stringify(payload);
  }
  try {
    return await response.text();
  } catch {
    return 'Unable to read error response body';
  }
}

async function safeReadJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return undefined;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
