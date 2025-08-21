/**
 * @description
 * Centralized environment variable management for the Ikigai Finder application.
 * This module loads, validates, and exports all required environment variables
 * using Zod schemas to ensure type safety and proper configuration at runtime.
 *
 * This provides a single source of truth for all environment configuration,
 * replacing scattered process.env.* calls throughout the codebase with
 * validated, type-safe imports.
 *
 * @throws {Error} If any required environment variables are missing or invalid
 */

import { z } from 'zod';

/* ────────────────────────────────────────────────────────────────────────── */
/* Environment Variable Schema Definition                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Zod schema defining all required environment variables and their validation rules.
 * This schema ensures that:
 * - All required variables are present
 * - String values are non-empty
 * - Database URLs follow expected format patterns
 * - API keys meet minimum length requirements
 */
const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL cannot be empty')
    .startsWith('postgresql://', 'DATABASE_URL must be a valid PostgreSQL connection string'),

  // Google AI Studio Configuration
  GEMINI_API_KEY: z
    .string()
    .min(10, 'GEMINI_API_KEY must be at least 10 characters long'),

  // Gemini Model Identifiers
  GEMINI_REASONING_MODEL: z
    .string()
    .min(1, 'GEMINI_REASONING_MODEL cannot be empty'),

  GEMINI_FACTS_MODEL: z
    .string()
    .min(1, 'GEMINI_FACTS_MODEL cannot be empty'),

  // YouTube Data API Configuration
  YOUTUBE_API_KEY: z
    .string()
    .min(10, 'YOUTUBE_API_KEY must be at least 10 characters long'),

  // Optional Environment Metadata
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Environment Variable Loading and Validation                               */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Parse and validate all environment variables at module load time.
 * This ensures the application fails fast if the environment is misconfigured.
 */
function loadAndValidateEnv() {
  try {
    // Parse environment variables using the schema
    const parsed = envSchema.parse(process.env);
    
    // Log successful validation in development
    if (parsed.NODE_ENV === 'development') {
      console.log('✅ Environment variables validated successfully');
    }
    
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format validation errors in a readable way
      const errorMessages = error.errors.map(
        (err) => `  - ${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      console.error('❌ Environment variable validation failed:');
      console.error(errorMessages);
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      console.error('See .env.example for the expected format.');
    } else {
      console.error('❌ Unexpected error during environment validation:', error);
    }
    
    // Exit the process on validation failure
    process.exit(1);
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Exported Configuration Object                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Validated environment configuration object.
 * All properties are guaranteed to exist and meet validation requirements.
 * 
 * Usage:
 * ```typescript
 * import { env } from './env.js';
 * 
 * // Type-safe access to environment variables
 * const apiKey = env.GEMINI_API_KEY; // string (guaranteed to exist)
 * const dbUrl = env.DATABASE_URL;    // string (guaranteed valid PostgreSQL URL)
 * ```
 */
export const env = loadAndValidateEnv();

/**
 * TypeScript type for the validated environment configuration.
 * Useful for type annotations and ensuring consistency across the codebase.
 */
export type Env = typeof env;