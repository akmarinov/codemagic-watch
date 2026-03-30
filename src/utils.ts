export function parseBuildIdentifier(input: string): string {
  if (!input || !input.trim()) {
    throw new Error('A build identifier or share URL is required.');
  }
  const trimmed = input.trim();

  if (isProbablyUrl(trimmed)) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/build\/([^/]+)/i);
      if (match) {
        return match[1];
      }
    } catch {
      // Ignore and fall back to returning trimmed input.
    }
  }

  const queryIndex = trimmed.indexOf('?');
  const normalized = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed;
  return normalized.replace(/\/+$/, '');
}

export function parseStepIdentifier(input: string): string {
  if (!input || !input.trim()) {
    throw new Error('A step identifier or step URL is required.');
  }
  const trimmed = input.trim();

  if (isProbablyUrl(trimmed)) {
    try {
      const url = new URL(trimmed);
      const match = url.pathname.match(/step\/([^/]+)/i);
      if (match) {
        return match[1];
      }
    } catch {
      // Ignore and fall back to returning the trimmed input.
    }
  }

  const queryIndex = trimmed.indexOf('?');
  const normalized = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed;
  return normalized.replace(/\/+$/, '');
}

export function ensureToken(token?: string): string {
  if (!token || !token.trim()) {
    throw new Error(
      'Codemagic API token is missing. Set CODEMAGIC_TOKEN or pass --token explicitly.'
    );
  }
  return token.trim();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function toNumber(value: string | undefined, defaultValue: number): number {
  if (typeof value !== 'string') {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function formatDuration(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return 'n/a';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining === 0 ? `${minutes}m` : `${minutes}m ${remaining}s`;
}

export function formatDate(value?: string): string {
  if (!value) {
    return 'n/a';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toISOString();
  } catch {
    return value;
  }
}

function isProbablyUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}
