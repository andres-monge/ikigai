/**
 * Replace the document when auth state must be reconstructed from server
 * cookies instead of the Better Auth client's in-memory session cache.
 */
export function replaceDocument(path: string): void {
  window.location.replace(path);
}
