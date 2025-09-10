/**
 * @description
 * Concurrency limiter for AI operations using p-limit library.
 * 
 * This module provides a centralized way to control how many AI requests
 * can run simultaneously, preventing API overload and ensuring server stability.
 * 
 * The limiter acts like a queue - when the maximum number of concurrent operations
 * is reached, additional requests wait in line until a slot becomes available.
 * 
 * @example
 * ```typescript
 * import { aiLimiter } from './limiter.js';
 * 
 * // Wrap AI operations with the limiter
 * const result = await aiLimiter(() => someAIFunction(input));
 * ```
 */

import pLimit from 'p-limit';

/**
 * Maximum number of concurrent AI operations allowed.
 * Set to 2 to prevent overwhelming the Gemini API while still allowing
 * reasonable throughput for multiple users.
 */
const MAX_CONCURRENT_AI_OPERATIONS = 2;

/**
 * AI operation limiter instance.
 * 
 * This limiter ensures that no more than MAX_CONCURRENT_AI_OPERATIONS
 * AI requests run simultaneously. When the limit is reached, additional
 * requests are automatically queued and will execute when a slot becomes available.
 * 
 * The limiter is transparent to the calling code - functions wrapped with
 * the limiter will simply wait their turn without any special error handling needed.
 * 
 * @example
 * ```typescript
 * // Wrap an AI chain call with the limiter
 * const analysis = await aiLimiter(() => 
 *   getPurposeDiscoveryStreamChain(responses, language)
 * );
 * ```
 */
export const aiLimiter = pLimit(MAX_CONCURRENT_AI_OPERATIONS);