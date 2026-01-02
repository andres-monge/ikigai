/**
 * @description
 * Standardized logging utility for consistent timestamped output across the server.
 * Shared by both the Express app and Vite integration to avoid code duplication.
 */

/**
 * Logs a message with a formatted timestamp and source label.
 * @param message - The message to log to the console.
 * @param source - The source of the log message (e.g., 'express', 'vite').
 */
export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}
