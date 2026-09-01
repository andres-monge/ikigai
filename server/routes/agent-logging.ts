export type MethodRouteLabel =
  | 'agent-turn'
  | 'history-read'
  | 'workspace-read'
  | 'workspace-operation'
  | 'audio-transcription'
  | 'method-unmatched';

/**
 * Privacy-safe operational route identity. Never return the incoming path:
 * unknown suffixes are attacker-controlled data and collapse to one label.
 */
export function methodRouteLabel(method: string, requestPath: string): MethodRouteLabel {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = requestPath.startsWith('/api/agent')
    ? requestPath.slice('/api/agent'.length) || '/'
    : requestPath;
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
