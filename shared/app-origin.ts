export const LOCAL_APP_ORIGIN = 'http://localhost:5173';

export function parseAppOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.href !== `${url.origin}/` && value !== url.origin) return undefined;
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function configuredAppOrigin(
  value: string,
  environment: { nodeEnv: string; vercel?: string },
): string | undefined {
  const origin = parseAppOrigin(value);
  if (!origin) return undefined;
  if (environment.nodeEnv === 'production' || environment.vercel === '1') {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1'
      ? origin : undefined;
  }
  return origin === LOCAL_APP_ORIGIN ? origin : undefined;
}

export function configuredMethodOrigin(value: string, environment: { nodeEnv: string; vercel?: string }): string | undefined {
  return environment.nodeEnv === 'test' && environment.vercel !== '1'
    ? parseAppOrigin(value)
    : configuredAppOrigin(value, environment);
}
