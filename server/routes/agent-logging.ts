export type MethodRouteLabel =
  | 'agent-turn'
  | 'history-read'
  | 'workspace-read'
  | 'workspace-operation'
  | 'audio-transcription'
  | 'method-unmatched';

/**
 * Match Express's default case-insensitive, non-strict Method routing without
 * changing route behavior. One optional trailing slash is canonicalized;
 * lookalike prefixes and interior/doubled slashes remain outside or unmatched.
 */
export function normalizeMethodRequestPath(requestPath: string): string | undefined {
  const lowerPath = requestPath.toLowerCase();
  if (lowerPath === '/api/agent' || lowerPath === '/api/agent/') return '/';
  if (!lowerPath.startsWith('/api/agent/')) return undefined;
  const relativePath = lowerPath.slice('/api/agent'.length);
  if (relativePath.length > 1 && relativePath.endsWith('/') && !relativePath.endsWith('//')) {
    return relativePath.slice(0, -1);
  }
  return relativePath;
}

/**
 * Privacy-safe operational route identity. Never return the incoming path:
 * unknown suffixes are attacker-controlled data and collapse to one label.
 */
export function methodRouteLabel(method: string, requestPath: string): MethodRouteLabel {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizeMethodRequestPath(requestPath);
  switch (`${normalizedMethod} ${normalizedPath}`) {
    case 'POST /': return 'agent-turn';
    case 'GET /history':
    case 'HEAD /history': return 'history-read';
    case 'GET /workspace':
    case 'HEAD /workspace': return 'workspace-read';
    case 'POST /workspace/operations': return 'workspace-operation';
    case 'POST /audio/transcribe': return 'audio-transcription';
    default: return 'method-unmatched';
  }
}
