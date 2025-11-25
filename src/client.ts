import { BuildSnapshot, CodemagicBuild, normalizeBuild } from './types';

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
