/**
 * @description
 * User data extraction script for AI analysis of the Revelio application.
 *
 * Extracts questionnaire answers and session metadata in a format suitable for
 * AI-powered user persona analysis. The output is anonymized (session IDs are
 * already anonymous UUIDs) and formatted for consumption by AI analysis tools.
 *
 * Output includes:
 * - Session metadata (language, timestamps)
 * - Questionnaire responses (passions, skills, values, economic)
 * - Funnel progression (reached results, reached action plan)
 * - Export behavior (whether user exported, and from which page)
 *
 * @usage
 * npx tsx scripts/extract-user-data.ts --production > user-data.json
 * npx tsx scripts/extract-user-data.ts --production --days=7 > user-data.json
 * npx tsx scripts/extract-user-data.ts --days=30 > user-data.json  # uses DATABASE_URL (dev)
 */

// Load environment variables from .env file FIRST
import 'dotenv/config';

import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { eq, gte, isNotNull, and, inArray } from 'drizzle-orm';
import ws from 'ws';
import * as schema from '../shared/schema.js';

const { analyticsEvents, assessmentSessions, purposePaths } = schema;

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws;

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface ExportInfo {
  hasExported: boolean;
  exportedFromResults: boolean;
  exportedFromActionPlan: boolean;
}

interface ExtractedSession {
  sessionId: string;
  language: string;
  createdAt: string;
  responses: {
    passions: Array<{ question: string; answer: string }>;
    skills: Array<{ question: string; answer: string }>;
    values: Array<{ question: string; answer: string }>;
    economic: Array<{ question: string; answer: string }>;
  };
  reachedResults: boolean;
  reachedActionPlan: boolean;
  hasExported: boolean;
  exportedFromResults: boolean;
  exportedFromActionPlan: boolean;
}

/* -------------------------------------------------------------------------- */
/* CLI Argument Parsing                                                        */
/* -------------------------------------------------------------------------- */

function parseArgs(): { days: number | null; useProduction: boolean } {
  const args = process.argv.slice(2);
  let days: number | null = null;
  let useProduction = false;

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      const rawValue = arg.split('=')[1];
      const value = parseInt(rawValue, 10);
      if (isNaN(value) || value <= 0) {
        console.error(`Error: Invalid value for --days: "${rawValue}"`);
        console.error('Expected a positive number, e.g., --days=7 or --days=30');
        process.exit(1);
      }
      days = value;
    } else if (arg === '--production' || arg === '--prod') {
      useProduction = true;
    } else if (arg === '--help' || arg === '-h') {
      console.error('Usage: npx tsx scripts/extract-user-data.ts [--production] [--days=N]');
      console.error('');
      console.error('Extracts user questionnaire data for AI analysis.');
      console.error('Output is JSON format, suitable for piping to a file.');
      console.error('');
      console.error('Options:');
      console.error('  --production  Use PRODUCTION_DATABASE_URL instead of DATABASE_URL');
      console.error('  --days=N      Filter to last N days (default: all time)');
      console.error('  --help, -h    Show this help message');
      console.error('');
      console.error('Environment:');
      console.error('  DATABASE_URL             Default database connection');
      console.error('  PRODUCTION_DATABASE_URL  Production database (used with --production)');
      console.error('');
      console.error('Examples:');
      console.error('  npx tsx scripts/extract-user-data.ts --production');
      console.error('  npx tsx scripts/extract-user-data.ts --production --days=7');
      process.exit(0);
    } else {
      console.error(`Error: Unknown argument: ${arg}`);
      console.error('Usage: npx tsx scripts/extract-user-data.ts [--production] [--days=N]');
      console.error('Run with --help for more information.');
      process.exit(1);
    }
  }

  return { days, useProduction };
}

/* -------------------------------------------------------------------------- */
/* Main Extraction Function                                                    */
/* -------------------------------------------------------------------------- */

async function extractUserData(): Promise<void> {
  const { days, useProduction } = parseArgs();

  // Select the appropriate database URL
  const envVarName = useProduction ? 'PRODUCTION_DATABASE_URL' : 'DATABASE_URL';
  const databaseUrl = process.env[envVarName];

  if (!databaseUrl) {
    console.error(`Error: ${envVarName} environment variable is required`);
    if (useProduction) {
      console.error('Tip: Add PRODUCTION_DATABASE_URL to your .env file');
    }
    process.exit(1);
  }

  // Log which database we're using (to stderr so it doesn't pollute JSON output)
  console.error(`Using ${useProduction ? 'PRODUCTION' : 'development'} database`);

  // Create database connection with schema for type-safe queries
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  // Calculate date filter if specified
  const dateFilter = days
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    : null;

  try {
    // -------------------------------------------------------------------------
    // Query 1: Get all completed sessions with their purpose paths
    // -------------------------------------------------------------------------
    const sessionsQuery = dateFilter
      ? db.query.assessmentSessions.findMany({
          where: and(
            isNotNull(assessmentSessions.responses),
            gte(assessmentSessions.createdAt, dateFilter)
          ),
          with: { purposePaths: true },
        })
      : db.query.assessmentSessions.findMany({
          where: isNotNull(assessmentSessions.responses),
          with: { purposePaths: true },
        });

    const sessions = await sessionsQuery;

    if (sessions.length === 0) {
      // Output empty array as valid JSON
      console.log(JSON.stringify([], null, 2));
      await pool.end();
      return;
    }

    // -------------------------------------------------------------------------
    // Query 2: Get export events for these sessions
    // -------------------------------------------------------------------------
    const sessionIds = sessions.map((s) => s.sessionId);

    const exportEventsQuery = db
      .select({
        sessionId: analyticsEvents.sessionId,
        metadata: analyticsEvents.metadata,
      })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.eventType, 'export'),
          inArray(analyticsEvents.sessionId, sessionIds)
        )
      );

    const exportEvents = await exportEventsQuery;

    // Build a map of sessionId -> export info
    const exportInfoMap = new Map<string, ExportInfo>();

    for (const event of exportEvents) {
      const info = exportInfoMap.get(event.sessionId) ?? {
        hasExported: false,
        exportedFromResults: false,
        exportedFromActionPlan: false,
      };

      info.hasExported = true;

      const metadata = event.metadata as Record<string, unknown> | null;
      if (metadata?.page === 'results') {
        info.exportedFromResults = true;
      }
      if (metadata?.page === 'action-plan') {
        info.exportedFromActionPlan = true;
      }

      exportInfoMap.set(event.sessionId, info);
    }

    // -------------------------------------------------------------------------
    // Transform sessions to output format
    // -------------------------------------------------------------------------
    const extractedSessions: ExtractedSession[] = sessions.map((session) => {
      const responses = session.responses as schema.QuestionnaireResponses | null;
      const exportInfo = exportInfoMap.get(session.sessionId) ?? {
        hasExported: false,
        exportedFromResults: false,
        exportedFromActionPlan: false,
      };

      return {
        sessionId: session.sessionId,
        language: session.language,
        createdAt: session.createdAt.toISOString(),
        responses: {
          passions: responses?.passions ?? [],
          skills: responses?.skills ?? [],
          values: responses?.values ?? [],
          economic: responses?.economic ?? [],
        },
        reachedResults: session.purposePaths.length > 0,
        reachedActionPlan: session.actionPlan !== null,
        hasExported: exportInfo.hasExported,
        exportedFromResults: exportInfo.exportedFromResults,
        exportedFromActionPlan: exportInfo.exportedFromActionPlan,
      };
    });

    // -------------------------------------------------------------------------
    // Output as JSON to stdout
    // -------------------------------------------------------------------------
    console.log(JSON.stringify(extractedSessions, null, 2));

  } finally {
    await pool.end();
  }
}

// Run the extraction
extractUserData().catch((error) => {
  console.error('Error extracting user data:', error instanceof Error ? error.message : error);

  if (error instanceof Error && error.stack) {
    console.error('\nStack trace:', error.stack);
  }

  console.error('\nTroubleshooting:');
  console.error('  1. Verify DATABASE_URL is correct and accessible');
  console.error('  2. Ensure database schema is up to date: npm run db:push');
  console.error('  3. Check network connectivity to the database');
  console.error('');
  process.exit(1);
});
